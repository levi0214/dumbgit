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
  | { kind: 'detached'; sha: string }

async function spawnGit(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: process.cwd(),
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stdout, stderr }
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
  return { kind: 'detached', sha }
}

/** Strip SGR sequences so we can regex-match hashes and decorations. */
export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;:]*m/g, '')
}

export type GraphCommitRow = {
  graphAnsi: string
  hashAnsi: string
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

/** Graph lines from `git log --graph`, ANSI-colored lanes preserved in `graphAnsi` / `hashAnsi`. */
export async function logGraphRows(limit = 50): Promise<GraphRow[]> {
  const { code, stdout, stderr } = await spawnGit([
    'log',
    '--graph',
    '--all',
    '--pretty=format:\x1f%C(auto)%h\x1f%d\x1f%s\x1f%an\x1f%ai\x1f',
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
    if (parts.length >= 6) {
      const graphAnsi = parts[0] ?? ''
      const hashAnsi = parts[1] ?? ''
      const decorateRaw = parts[2] ?? ''
      const subject = parts[3] ?? ''
      const author = parts[4] ?? ''
      const date = parts[5] ?? ''
      const hashPlain = stripAnsi(hashAnsi).trim()
      if (/^[a-f0-9]{7,40}$/i.test(hashPlain)) {
        tmp.push({
          kind: 'commit',
          row: {
            graphAnsi,
            hashAnsi,
            decorateRaw,
            subject,
            author,
            date,
            inHistory: reachable.size === 0 ? true : reachable.has(hashPlain),
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

export type CommitFile = { status: string; path: string }
export type CommitDetails = {
  subject: string
  author: string
  date: string
  files: CommitFile[]
  diff: string
}

export async function commitDetails(
  sha: string,
): Promise<{ ok: true; value: CommitDetails } | { ok: false; stderr: string }> {
  const meta = await spawnGit(['log', '-1', '--format=%s%n%an%n%ai', sha])
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
  const files: CommitFile[] = []
  for (const line of fileShow.stdout.split('\n')) {
    if (!line.trim()) continue
    const tabs = line.split('\t')
    const status = tabs[0] ?? ''
    const path = tabs.slice(1).join(' → ')
    if (path) files.push({ status, path })
  }

  const patch = await spawnGit(['show', '--format=', '--no-color', sha])
  if (patch.code !== 0) {
    return {
      ok: false,
      stderr: patch.stderr.trim() || `git show failed (${patch.code})`,
    }
  }

  return {
    ok: true,
    value: { subject, author, date, files, diff: patch.stdout.trimEnd() },
  }
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

export type WorkTreeEntry = { mark: string; path: string }

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
  const stagedR = await spawnGit(['diff', '--cached', '--name-status'])
  const unstagedR = await spawnGit(['diff', '--name-status'])
  const staged = stagedR.code === 0 ? parseNameStatus(stagedR.stdout) : []
  const unstaged = unstagedR.code === 0 ? parseNameStatus(unstagedR.stdout) : []

  const ut = await spawnGit(['ls-files', '--others', '--exclude-standard'])
  const untracked =
    ut.code === 0
      ? ut.stdout
          .split('\n')
          .filter(Boolean)
          .map((path) => ({ mark: '??', path }))
      : []

  return { staged, unstaged, untracked }
}
