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
