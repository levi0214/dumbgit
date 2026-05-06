import path from 'node:path'

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

/** Working tree all git commands run in (switch via repo picker). */
let repoRoot = process.cwd()

export function setCurrentRepo(dir: string): void {
  repoRoot = dir
}

export function getCurrentRepo(): string {
  return repoRoot
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
    return { kind: 'branch', name: sym.stdout.trim(), sha }
  }
  const prev = await spawnGit(['rev-parse', '--abbrev-ref', '@{-1}'])
  const prevName = prev.code === 0 ? prev.stdout.trim() : ''
  const previousBranch =
    prevName && prevName !== 'HEAD' && !prevName.includes('@') ? prevName : undefined
  return { kind: 'detached', sha, previousBranch }
}

/** Strip SGR sequences so we can regex-match hashes and decorations. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;:]*m/g, '')
}

export type GraphCommitRow = {
  graphAnsi: string
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

export type GraphRow =
  | { kind: 'commit'; row: GraphCommitRow }
  | { kind: 'other'; ansi: string; betweenInHistory: boolean }

/** Set of short (7-char) hashes reachable from HEAD. Empty on failure. */
async function reachableShortShas(): Promise<Set<string>> {
  const { code, stdout } = await spawnGit(['rev-list', 'HEAD'])
  if (code !== 0) return new Set()
  const set = new Set<string>()
  for (const line of stdout.split('\n')) {
    const t = line.trim()
    if (t.length >= 7) set.add(t.slice(0, 7))
  }
  return set
}

/** Graph lines from `git log --graph`. Lane colors come from `graphAnsi`; hashes are plain fields. */
export async function logGraphRows(limit = 50): Promise<GraphRow[]> {
  const { code, stdout, stderr } = await spawnGit([
    'log',
    '--graph',
    '--all',
    '--pretty=format:\x1f%H\x1f%h\x1f%d\x1f%s\x1f%an\x1f%aI\x1f',
    '--decorate=short',
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

  const reachable = await reachableShortShas()
  const text = stdout.replace(/\n+$/, '')
  type Tmp =
    | { kind: 'commit'; row: GraphCommitRow }
    | { kind: 'other'; ansi: string }
  const tmp: Tmp[] = []

  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split('\x1f')
    if (parts.length >= 7) {
      const graphAnsi = parts[0] ?? ''
      const shaFull = (parts[1] ?? '').trim()
      const shaShort = (parts[2] ?? '').trim()
      const decorateRaw = parts[3] ?? ''
      const subject = parts[4] ?? ''
      const author = parts[5] ?? ''
      const date = parts[6] ?? ''
      if (
        /^[a-f0-9]{7,40}$/i.test(shaFull) &&
        /^[a-f0-9]{7,40}$/i.test(shaShort)
      ) {
        tmp.push({
          kind: 'commit',
          row: {
            graphAnsi,
            shaFull,
            shaShort,
            decorateRaw,
            subject,
            author,
            date,
            inHistory: reachable.size === 0 ? true : reachable.has(shaShort),
          },
        })
        continue
      }
    }
    tmp.push({ kind: 'other', ansi: line })
  }

  /**
   * A connector row inherits the in-history flag from the commit row IMMEDIATELY
   * ABOVE it (i.e. its source). `git log --graph` reads top-to-bottom newest →
   * oldest, so the lanes flowing down through a connector belong to the row above.
   */
  const rows: GraphRow[] = tmp.map((t, i) => {
    if (t.kind === 'commit') return t
    let prevInHistory = true
    for (let j = i - 1; j >= 0; j--) {
      const x = tmp[j]
      if (x.kind === 'commit') {
        prevInHistory = x.row.inHistory
        break
      }
    }
    return { kind: 'other', ansi: t.ansi, betweenInHistory: prevInHistory }
  })

  return rows
}

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

export type CommitFile = {
  status: string
  path: string
  /** Line counts from `git show --numstat`. */
  added?: number
  deleted?: number
  /** `-\\t-\\t` lines from numstat */
  binary?: boolean
}

export type CommitSummary = {
  subject: string
  author: string
  date: string
  files: CommitFile[]
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

  return {
    ok: true,
    value: {
      subject,
      author,
      date,
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
  { ok: true; message: string } | { ok: false; stderr: string }
> {
  const { code, stdout, stderr } = await spawnGit(['push'])
  const out = stderr.trim() || stdout.trim() || '(no output)'
  if (code === 0) return { ok: true, message: out }
  return { ok: false, stderr: out }
}

export async function ensureGitRepo(): Promise<void> {
  const { code, stderr } = await spawnGit(['rev-parse', '--git-dir'])
  if (code !== 0) {
    throw new GitError(stderr.trim() || 'not a git repository', code)
  }
}

/** Absolute path to the .git directory for the current cwd. */
export async function gitDir(): Promise<string> {
  const out = await gitOrThrow(['rev-parse', '--absolute-git-dir'])
  return out.trim()
}

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
