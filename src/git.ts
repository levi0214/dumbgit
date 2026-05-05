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

export type Branch = { name: string; isCurrent: boolean; sha: string }

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

export async function listBranches(): Promise<Branch[]> {
  const { code, stdout, stderr } = await spawnGit([
    'for-each-ref',
    'refs/heads/',
    '--sort=-committerdate',
    '--format=%(HEAD)\t%(refname:short)\t%(objectname:short)',
  ])
  if (code !== 0) {
    throw new GitError(stderr.trim() || 'git for-each-ref failed', code)
  }

  const branches: Branch[] = []
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [head, name, sha] = line.split('\t')
    if (!name || !sha) continue
    branches.push({
      name: name.trim(),
      sha: sha.trim(),
      isCurrent: head.trim() === '*',
    })
  }

  branches.sort((a, b) => {
    if (a.isCurrent) return -1
    if (b.isCurrent) return 1
    return a.name.localeCompare(b.name)
  })

  return branches
}

export async function logGraph(limit = 50): Promise<string> {
  const { code, stdout, stderr } = await spawnGit([
    'log',
    '--graph',
    '--oneline',
    '--all',
    '--decorate',
    '--no-color',
    '-n',
    String(limit),
  ])

  if (code === 0) return stdout.replace(/\n+$/, '')

  const err = stderr.trim()
  if (
    err.includes('does not have any commits yet') ||
    err.includes('does not have any commits')
  ) {
    return ''
  }

  throw new GitError(err || 'git log failed', code)
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
