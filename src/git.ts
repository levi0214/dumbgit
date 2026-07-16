import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'

// Core repo state and git process helpers.
export class GitError extends Error {
  override readonly name = 'GitError'

  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message)
  }
}

export type HeadInfo =
  | { kind: 'branch'; name: string; sha: string }
  | { kind: 'detached'; sha: string; previousBranch?: string }

/** Working tree all git commands run in. `initRepo` sets this once per process. */
let repoRoot = process.cwd()
const lastBranchByRepo = new Map<string, string>()

/**
 * Bind dumbgit to a working tree at boot: validates `dir` is inside a
 * git repo and stores it as the process-wide root. Throws GitError if
 * the directory is not a git tree.
 */
export async function initRepo(dir: string): Promise<void> {
  const { code, stdout, stderr } = await spawnGit(
    ['rev-parse', '--show-toplevel'],
    dir,
  )
  if (code !== 0) {
    throw new GitError(stderr.trim() || 'not a git repository', code)
  }
  repoRoot = realpathSync(stdout.trim())
}

export function getCurrentRepo(): string {
  return repoRoot
}

async function previousReflogBranch(): Promise<string | undefined> {
  const prev = await spawnGit(['rev-parse', '--abbrev-ref', '@{-1}'])
  const name = prev.code === 0 ? prev.stdout.trim() : ''
  return name && name !== 'HEAD' && !name.includes('@') ? name : undefined
}

async function spawnGit(
  args: string[],
  cwd: string = repoRoot,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stdout, stderr }
}

/** Probe `dir` without changing the current repo. */
export async function isGitRepo(dir: string): Promise<boolean> {
  const { code } = await spawnGit(['rev-parse', '--git-dir'], dir)
  return code === 0
}

async function gitOrThrow(args: string[]): Promise<string> {
  const { code, stdout, stderr } = await spawnGit(args)
  if (code !== 0) {
    throw new GitError(stderr.trim() || `git exited with status ${code}`, code)
  }
  return stdout.replace(/\n+$/, '')
}

export async function headInfo(): Promise<HeadInfo> {
  const sha = (await gitOrThrow(['rev-parse', 'HEAD'])).trim()
  const sym = await spawnGit(['symbolic-ref', '-q', '--short', 'HEAD'])
  if (sym.code === 0) {
    const name = sym.stdout.trim()
    if (name) lastBranchByRepo.set(repoRoot, name)
    return { kind: 'branch', name, sha }
  }
  const previousBranch = lastBranchByRepo.get(repoRoot) ?? (await previousReflogBranch())
  if (previousBranch) lastBranchByRepo.set(repoRoot, previousBranch)
  return { kind: 'detached', sha, previousBranch }
}

/** Strip SGR sequences so we can regex-match hashes and decorations. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;:]*m/g, '')
}

// Graph log rows.
export type GraphCommitRow = {
  /** Full parent hashes in Git's stored order (first parent first). */
  parents: string[]
  /** Full 40-char hex, for copy / URLs. */
  shaFull: string
  /** Abbreviated hash from git `%h` (matches log elsewhere). */
  shaShort: string
  decorateRaw: string
  subject: string
  author: string
  date: string
  /** True iff this commit is reachable from current HEAD. */
  inHistory: boolean
}

export type GraphRow = { kind: 'commit'; row: GraphCommitRow }

/** Full hashes reachable from HEAD. Empty on failure. */
async function reachableShas(): Promise<Set<string>> {
  const { code, stdout } = await spawnGit(['rev-list', 'HEAD'])
  if (code !== 0) return new Set()
  const set = new Set<string>()
  for (const line of stdout.split('\n')) {
    const t = line.trim().toLowerCase()
    if (/^[a-f0-9]{40}$/.test(t)) set.add(t)
  }
  return set
}

/** Commits in date order. The view derives graph lanes from hashes + parents. */
export async function logGraphRows(limit = 50): Promise<GraphRow[]> {
  const { code, stdout, stderr } = await spawnGit([
    'log',
    '--date-order',
    '--exclude=refs/stash',
    '--all',
    '--pretty=format:\x1f%H\x1f%h\x1f%P\x1f%d\x1f%s\x1f%an\x1f%aI\x1f',
    '--decorate=full',
    '--color=always',
    '-n',
    String(limit),
  ])

  if (code !== 0) {
    const err = stderr.trim()
    if (
      err.includes('does not have any commits yet') ||
      err.includes('does not have any commits')
    ) {
      return []
    }
    throw new GitError(err || 'git log failed', code)
  }

  // Match on full %H — never %h. In larger repos Git widens %h past 7 chars,
  // so a fixed 7-char prefix set would mark every row as out-of-history (dim).
  const reachable = await reachableShas()
  const text = stdout.replace(/\n+$/, '')
  const rows: GraphRow[] = []

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length >= 8) {
      const shaFull = (parts[1] ?? '').trim()
      const shaShort = (parts[2] ?? '').trim()
      const parents = (parts[3] ?? '').trim().split(/\s+/).filter(Boolean)
      const decorateRaw = parts[4] ?? ''
      const subject = parts[5] ?? ''
      const author = parts[6] ?? ''
      const date = parts[7] ?? ''
      if (
        /^[a-f0-9]{7,40}$/i.test(shaFull) &&
        /^[a-f0-9]{7,40}$/i.test(shaShort)
      ) {
        const fullKey = shaFull.toLowerCase()
        rows.push({
          kind: 'commit',
          row: {
            parents,
            shaFull,
            shaShort,
            decorateRaw,
            subject,
            author,
            date,
            inHistory:
              reachable.size === 0 ? true : reachable.has(fullKey),
          },
        })
      }
    }
  }

  return rows
}

// Branch, checkout, and push actions.
export async function checkoutBranch(
  name: string,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const { code, stderr } = await spawnGit(['switch', name])
  if (code === 0) return { ok: true }
  return {
    ok: false,
    stderr: stderr.trim() || `git switch failed (${code})`,
  }
}

export async function checkoutCommit(
  sha: string,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const { code, stderr } = await spawnGit(['switch', '--detach', sha])
  if (code === 0) return { ok: true }
  return {
    ok: false,
    stderr: stderr.trim() || `git switch --detach failed (${code})`,
  }
}

/** Create a new branch at `sha` without switching (`git branch name sha`). */
export async function createBranchAt(
  sha: string,
  name: string,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const { code, stderr } = await spawnGit(['branch', name, sha])
  if (code === 0) return { ok: true }
  return {
    ok: false,
    stderr: stderr.trim() || `git branch failed (${code})`,
  }
}

// Commit summaries, file lists, and patches.
export type CommitFile = {
  status: string
  path: string
  /** Line counts from `git show --numstat`. */
  added?: number
  deleted?: number
  /** `-\\t-\\t` lines from numstat */
  binary?: boolean
}

export type TagInfo = {
  name: string
  message?: string
}

export type CommitSummary = {
  subject: string
  author: string
  date: string
  tags: TagInfo[]
  files: CommitFile[]
}

const TAG_REF_FIELD = '\x1f'

/** Parse one line from `git for-each-ref --format=…` tag batch output. */
export function parseTagForEachRefLine(line: string): {
  name: string
  objectType: string
} | null {
  const trimmed = line.trimEnd()
  if (!trimmed) return null
  const [name = '', objectType = ''] = trimmed.split(TAG_REF_FIELD)
  if (!name) return null
  return { name, objectType }
}

async function annotatedTagMessage(name: string): Promise<string | undefined> {
  const r = await spawnGit(['tag', '-l', name, '--format=%(contents)'])
  if (r.code !== 0) return undefined
  const message = r.stdout.trimEnd()
  return message || undefined
}

async function tagsAtCommit(sha: string): Promise<TagInfo[]> {
  const r = await spawnGit([
    'for-each-ref',
    `--points-at=${sha}`,
    'refs/tags',
    '--format',
    `%(refname:short)${TAG_REF_FIELD}%(objecttype)`,
  ])
  if (r.code !== 0 || !r.stdout.trim()) return []

  const parsed = r.stdout
    .trimEnd()
    .split('\n')
    .map(parseTagForEachRefLine)
    .filter((t): t is NonNullable<typeof t> => t !== null)

  return Promise.all(
    parsed.map(async (row) => {
      if (row.objectType === 'commit') return { name: row.name }
      return { name: row.name, message: await annotatedTagMessage(row.name) }
    }),
  )
}

type Numstat = { added?: number; deleted?: number; binary: boolean }

function parseNumstat(stdout: string): Map<string, Numstat> {
  const m = new Map<string, Numstat>()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const tabs = line.split('\t')
    if (tabs.length < 3) continue
    const path = tabs.slice(2).join('\t')
    const a = tabs[0] ?? ''
    const b = tabs[1] ?? ''
    const binary = a === '-' && b === '-'
    const ai = binary ? NaN : Number.parseInt(a, 10)
    const bi = binary ? NaN : Number.parseInt(b, 10)
    m.set(path, {
      binary,
      added: Number.isFinite(ai) ? ai : undefined,
      deleted: Number.isFinite(bi) ? bi : undefined,
    })
  }
  return m
}

function mergeNumstat<
  T extends {
    path: string
    added?: number
    deleted?: number
    binary?: boolean
  },
>(files: T[], stats: Map<string, Numstat>): T[] {
  return files.map((f) => {
    let st = stats.get(f.path)
    if (!st && f.path.includes(' → ')) {
      const parts = f.path.split(' → ').map((s) => s.trim())
      st = stats.get(parts[parts.length - 1]!) ?? stats.get(parts[0]!)
    }
    if (!st) return f
    return {
      ...f,
      added: st.added,
      deleted: st.deleted,
      binary: st.binary,
    }
  })
}

function parseShowNameStatus(stdout: string): CommitFile[] {
  const files: CommitFile[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const tabs = line.split('\t')
    const status = tabs[0] ?? ''
    const path = tabs.slice(1).join(' → ')
    if (path) files.push({ status, path })
  }
  return files
}

/** Subject, author, ISO date, changed files — no patch body (cheap). */
export async function commitSummary(
  sha: string,
  opts: { includeTags?: boolean } = {},
): Promise<{ ok: true; value: CommitSummary } | { ok: false; stderr: string }> {
  const meta = await spawnGit(['log', '-1', '--format=%s%n%an%n%aI', sha])
  if (meta.code !== 0) {
    return { ok: false, stderr: meta.stderr.trim() || `git log failed (${meta.code})` }
  }
  const [subject = '', author = '', date = ''] = meta.stdout.trimEnd().split('\n')

  const fileShow = await spawnGit([
    'show',
    '--name-status',
    '--format=',
    '--no-color',
    sha,
  ])
  if (fileShow.code !== 0) {
    return {
      ok: false,
      stderr: fileShow.stderr.trim() || `git show --name-status failed (${fileShow.code})`,
    }
  }

  const numstat = await spawnGit(['show', '--numstat', '--format=', sha])
  let files = parseShowNameStatus(fileShow.stdout)
  if (numstat.code === 0) {
    files = mergeNumstat(files, parseNumstat(numstat.stdout))
  }
  const tags = opts.includeTags ? await tagsAtCommit(sha) : []

  return {
    ok: true,
    value: {
      subject,
      author,
      date,
      tags,
      files,
    },
  }
}

/** Unified diff for one file in a commit; `displayPath` must match `commitSummary()` (renames use `old → new`). */
export async function commitFilePatch(
  sha: string,
  displayPath: string,
  files?: CommitFile[],
): Promise<{ ok: true; patch: string } | { ok: false; stderr: string }> {
  if (!files) {
    const summary = await commitSummary(sha)
    if (!summary.ok) return summary
    files = summary.value.files
  }
  if (!files.some((f) => f.path === displayPath)) {
    return {
      ok: false,
      stderr: 'path not in commit file list',
    }
  }

  const raw = gitDiffPath(displayPath)
  if (!raw) return { ok: false, stderr: 'invalid path' }

  const patch = await spawnGit([
    'show',
    '--format=',
    '--no-color',
    sha,
    '--',
    raw,
  ])
  if (patch.code !== 0) {
    return {
      ok: false,
      stderr: patch.stderr.trim() || `git show failed (${patch.code})`,
    }
  }
  return { ok: true, patch: patch.stdout.trimEnd() }
}

export async function push(): Promise<
  { ok: true } | { ok: false; stderr: string }
> {
  // Auto set upstream on first push of a branch; no-op when upstream exists.
  const { code, stdout, stderr } = await spawnGit(['-c', 'push.autoSetupRemote=true', 'push'])
  if (code === 0) return { ok: true }
  return { ok: false, stderr: stderr.trim() || stdout.trim() || `git push failed (${code})` }
}

/** Absolute path to the .git directory for the current cwd. */
export async function gitDir(): Promise<string> {
  const out = await gitOrThrow(['rev-parse', '--absolute-git-dir'])
  return out.trim()
}

// Worktree types shared by status, file actions, and preview stash.
export type WorkTreeEntry = {
  mark: string
  path: string
  added?: number
  deleted?: number
  binary?: boolean
}

export type WorkTreeSummary = {
  staged: WorkTreeEntry[]
  unstaged: WorkTreeEntry[]
  untracked: WorkTreeEntry[]
}

// Preview stash.
/** Message marker for `git stash push -m …` created by dumbgit preview toggle (not user stash). */
export const DUMBGIT_PREVIEW_STASH_MSG = 'dumbgit-preview-stash'

export type PreviewStashEntry = {
  ref: string
  baseSha: string
  subject: string
  age: string
}

export type PreviewStashUi = {
  /** Dumbgit-owned stash entries; user stashes are intentionally ignored. */
  stashes: PreviewStashEntry[]
}

async function dumbgitPreviewStashes(): Promise<PreviewStashEntry[]> {
  const r = await spawnGit(['stash', 'list', '--format=%gd%x1f%gs%x1f%cr'])
  if (r.code !== 0) return []
  const marker = DUMBGIT_PREVIEW_STASH_MSG
  const out: PreviewStashEntry[] = []
  for (const line of r.stdout.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const [ref = '', subject = '', age = ''] = t.split('\x1f')
    if (!ref || !subject.includes(marker)) continue
    const base = await spawnGit(['rev-parse', `${ref}^1`])
    if (base.code !== 0) continue
    out.push({ ref, baseSha: base.stdout.trim(), subject, age })
  }
  return out
}

async function findDumbgitPreviewStash(
  ref?: string,
): Promise<PreviewStashEntry | null> {
  const stashes = await dumbgitPreviewStashes()
  if (!ref) return stashes[0] ?? null
  return stashes.find((s) => s.ref === ref) ?? null
}

/** Whether a dumbgit preview stash exists (`git stash list`). */
export async function previewStashUiState(): Promise<PreviewStashUi> {
  return { stashes: await dumbgitPreviewStashes() }
}

async function applyAndDropPreviewStash(
  stash: PreviewStashEntry,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const applied = await spawnGit(['stash', 'apply', '--index', stash.ref])
  if (applied.code !== 0) {
    return {
      ok: false,
      stderr:
        applied.stderr.trim() ||
        applied.stdout.trim() ||
        `git stash apply failed (${applied.code})`,
    }
  }
  const dropped = await spawnGit(['stash', 'drop', stash.ref])
  if (dropped.code !== 0) {
    return {
      ok: false,
      stderr:
        dropped.stderr.trim() ||
        `restored stash but failed to drop ${stash.ref}: ${dropped.code}`,
    }
  }
  return { ok: true }
}

/**
 * Toggle: stash WIP (+ untracked) behind app marker, or apply+drop latest matching stash when clean.
 */
export async function togglePreviewStash(): Promise<
  { ok: true } | { ok: false; stderr: string }
> {
  const wt = await workTreeSummary()
  const dirty =
    wt.staged.length > 0 ||
    wt.unstaged.length > 0 ||
    wt.untracked.length > 0

  if (dirty) {
    const r = await spawnGit([
      'stash',
      'push',
      '-u',
      '-m',
      DUMBGIT_PREVIEW_STASH_MSG,
    ])
    if (r.code !== 0) {
      return {
        ok: false,
        stderr: r.stderr.trim() || r.stdout.trim() || `git stash push failed (${r.code})`,
      }
    }
    return { ok: true }
  }

  const stash = await findDumbgitPreviewStash()
  if (stash) return applyAndDropPreviewStash(stash)

  return { ok: false, stderr: 'nothing to stash or restore' }
}

export async function restorePreviewStash(ref?: string): Promise<
  { ok: true } | { ok: false; stderr: string }
> {
  const stash = await findDumbgitPreviewStash(ref)
  if (!stash) return { ok: false, stderr: 'no dumbgit preview stash to restore' }
  return applyAndDropPreviewStash(stash)
}

export async function dropPreviewStash(ref?: string): Promise<
  { ok: true } | { ok: false; stderr: string }
> {
  const stash = await findDumbgitPreviewStash(ref)
  if (!stash) return { ok: false, stderr: 'no dumbgit preview stash to drop' }
  const r = await spawnGit(['stash', 'drop', stash.ref])
  if (r.code !== 0) {
    return {
      ok: false,
      stderr: r.stderr.trim() || `git stash drop failed (${r.code})`,
    }
  }
  return { ok: true }
}

export async function stashSummary(
  ref: string,
): Promise<{ ok: true; value: CommitSummary } | { ok: false; stderr: string }> {
  const stash = await findDumbgitPreviewStash(ref)
  if (!stash) return { ok: false, stderr: 'stash not found' }
  const meta = await spawnGit(['log', '-1', '--format=%an%n%aI', stash.ref])
  if (meta.code !== 0) {
    return { ok: false, stderr: meta.stderr.trim() || `git log failed (${meta.code})` }
  }
  const [author = 'git stash', date = ''] = meta.stdout.trimEnd().split('\n')
  const fileShow = await spawnGit([
    'show',
    '--name-status',
    '--format=',
    '--no-color',
    stash.ref,
  ])
  if (fileShow.code !== 0) {
    return {
      ok: false,
      stderr:
        fileShow.stderr.trim() || `git show --name-status failed (${fileShow.code})`,
    }
  }
  const numstat = await spawnGit(['show', '--numstat', '--format=', stash.ref])
  let files = parseShowNameStatus(fileShow.stdout)
  if (numstat.code === 0) {
    files = mergeNumstat(files, parseNumstat(numstat.stdout))
  }
  return {
    ok: true,
    value: {
      subject: stash.subject,
      author,
      date,
      tags: [],
      files,
    },
  }
}

export async function stashFilePatch(
  ref: string,
  displayPath: string,
  files?: CommitFile[],
): Promise<{ ok: true; patch: string } | { ok: false; stderr: string }> {
  const stash = await findDumbgitPreviewStash(ref)
  if (!stash) return { ok: false, stderr: 'stash not found' }
  return commitFilePatch(stash.ref, displayPath, files)
}

// Worktree status and file actions.
function parseNameStatus(stdout: string): WorkTreeEntry[] {
  const entries: WorkTreeEntry[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const tabs = line.split('\t')
    const mark = tabs[0] ?? ''
    if (tabs.length === 2) {
      entries.push({ mark, path: tabs[1] })
    } else if (tabs.length >= 3) {
      entries.push({ mark, path: `${tabs[1]} → ${tabs[2]}` })
    }
  }
  return entries
}

/** Files changed in the working tree (not yet reflected in `git log`). */
export async function workTreeSummary(): Promise<WorkTreeSummary> {
  const [stagedR, unstagedR, stagedNumsR, unstagedNumsR] = await Promise.all([
    spawnGit(['diff', '--cached', '--name-status']),
    spawnGit(['diff', '--name-status']),
    spawnGit(['diff', '--cached', '--numstat']),
    spawnGit(['diff', '--numstat']),
  ])
  let staged = stagedR.code === 0 ? parseNameStatus(stagedR.stdout) : []
  let unstaged = unstagedR.code === 0 ? parseNameStatus(unstagedR.stdout) : []
  if (stagedNumsR.code === 0) {
    staged = mergeNumstat(staged, parseNumstat(stagedNumsR.stdout))
  }
  if (unstagedNumsR.code === 0) {
    unstaged = mergeNumstat(unstaged, parseNumstat(unstagedNumsR.stdout))
  }

  const ut = await spawnGit(['ls-files', '--others', '--exclude-standard'])
  const untracked =
    ut.code === 0
      ? ut.stdout
          .split('\n')
          .filter(Boolean)
          .map((fp) => ({ mark: '??', path: fp }))
      : []

  return { staged, unstaged, untracked }
}

/** Working-tree slice matching `/fragment/worktree` lists (`displayPath` may use `old → new` from rename rows). */
export type WorkTreeChangeKind = 'staged' | 'unstaged' | 'untracked'
export type WorkTreeActionOp = 'stage' | 'unstage' | 'discard'

/** Right-hand side path used by git diff after an `R*` rename (`old → new` → `new`). */
function gitDiffPath(displayPath: string): string {
  const parts = displayPath
    .split(' → ')
    .map((s) => s.trim())
    .filter(Boolean)
  return (parts.length ? parts[parts.length - 1] : displayPath.trim()) ?? ''
}

/** Resolve `relPath` under repo root; rejects `..` escapes; returns POSIX-ish relative path for git argv. */
async function strictRepoRelative(relPath: string): Promise<string | null> {
  const topR = await spawnGit(['rev-parse', '--show-toplevel'])
  if (topR.code !== 0) return null
  const top = path.resolve(topR.stdout.trim())
  const joined = path.resolve(top, relPath)
  const rel = path.relative(top, joined)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

/** Unified diff for one working-tree file; `displayPath` must match an entry from the matching bucket of `workTreeSummary()`. */
export async function workTreeFilePatch(
  kind: WorkTreeChangeKind,
  displayPath: string,
): Promise<{ ok: true; patch: string } | { ok: false; stderr: string }> {
  const wt = await workTreeSummary()
  const bucket =
    kind === 'staged' ? wt.staged : kind === 'unstaged' ? wt.unstaged : wt.untracked
  if (!bucket.some((e) => e.path === displayPath)) {
    return {
      ok: false,
      stderr: 'path not in current working tree list (try refreshing)',
    }
  }

  const raw = gitDiffPath(displayPath)
  if (!raw) return { ok: false, stderr: 'invalid path' }

  const rel = await strictRepoRelative(raw)
  if (!rel) return { ok: false, stderr: 'invalid path' }

  if (kind === 'untracked') {
    const r = await spawnGit([
      'diff',
      '--no-index',
      '--no-color',
      '--',
      '/dev/null',
      rel,
    ])
    if (!(r.code === 0 || r.code === 1)) {
      return {
        ok: false,
        stderr: r.stderr.trim() || `git diff failed (${r.code})`,
      }
    }
    const stderrTrim = r.stderr.trim()
    const stdoutTrim = r.stdout.trimEnd()
    if (
      !stdoutTrim &&
      stderrTrim &&
      stderrTrim
        .split('\n')
        .some((ln) => /^(error|fatal)\s*:/i.test(ln.trim()))
    ) {
      return { ok: false, stderr: stderrTrim }
    }
    return { ok: true, patch: stdoutTrim }
  }

  const args =
    kind === 'staged'
      ? (['diff', '--cached', '--no-color', '--', rel] as const)
      : (['diff', '--no-color', '--', rel] as const)

  const r = await spawnGit([...args])
  if (!(r.code === 0 || r.code === 1)) {
    return {
      ok: false,
      stderr: r.stderr.trim() || `git diff failed (${r.code})`,
    }
  }
  return { ok: true, patch: r.stdout.trimEnd() }
}

export async function workTreeFileAbsolutePath(
  kind: WorkTreeChangeKind,
  displayPath: string,
): Promise<{ ok: true; path: string } | { ok: false; stderr: string }> {
  const wt = await workTreeSummary()
  const bucket =
    kind === 'staged' ? wt.staged : kind === 'unstaged' ? wt.unstaged : wt.untracked
  if (!bucket.some((e) => e.path === displayPath)) {
    return {
      ok: false,
      stderr: 'path not in current working tree list (try refreshing)',
    }
  }

  const raw = gitDiffPath(displayPath)
  if (!raw) return { ok: false, stderr: 'invalid path' }

  const rel = await strictRepoRelative(raw)
  if (!rel) return { ok: false, stderr: 'invalid path' }

  const abs = path.resolve(repoRoot, rel)
  if (!existsSync(abs)) {
    return { ok: false, stderr: `${displayPath} does not exist in the working tree` }
  }

  return { ok: true, path: abs }
}

/** Explicit worktree action from the file detail panel. */
export async function applyWorkTreeAction(
  kind: WorkTreeChangeKind,
  op: WorkTreeActionOp,
  displayPath: string,
): Promise<{ ok: true } | { ok: false; stderr: string }> {
  const wt = await workTreeSummary()
  const bucket =
    kind === 'staged' ? wt.staged : kind === 'unstaged' ? wt.unstaged : wt.untracked
  if (!bucket.some((e) => e.path === displayPath)) {
    return {
      ok: false,
      stderr: 'path not in current working tree list (try refreshing)',
    }
  }

  const raw = gitDiffPath(displayPath)
  if (!raw) return { ok: false, stderr: 'invalid path' }

  const rel = await strictRepoRelative(raw)
  if (!rel) return { ok: false, stderr: 'invalid path' }

  if (op === 'stage' && kind === 'staged') {
    return { ok: false, stderr: `${displayPath} is already staged` }
  }
  if (op === 'unstage' && kind !== 'staged') {
    return { ok: false, stderr: `${displayPath} is not staged` }
  }
  if (op === 'discard' && kind === 'staged') {
    return { ok: false, stderr: 'unstage before discarding this file' }
  }

  const args =
    op === 'stage'
      ? ['add', '--', rel]
      : op === 'unstage'
        ? ['restore', '--staged', '--', rel]
        : kind === 'unstaged'
          ? ['restore', '--worktree', '--', rel]
          : ['clean', '-f', '--', rel]

  const r = await spawnGit(args)
  if (r.code !== 0) {
    return {
      ok: false,
      stderr: r.stderr.trim() || `git ${args[0]} failed (${r.code})`,
    }
  }
  return { ok: true }
}
