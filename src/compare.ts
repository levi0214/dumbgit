import { spawnGit } from './git'

export type CompareFile = { status: string; path: string; oldPath?: string }
export type CompareResult = {
  refs: { value: string; label: string }[]
  base: string
  target: string
  files: CompareFile[]
  selected?: CompareFile
  patch: string
}

async function git(cwd: string, args: string[]) {
  const r = await spawnGit(args, cwd, { timeoutMs: 15000 })
  if (r.code) throw new Error(r.stderr.trim() || 'Could not compare these versions')
  return r.stdout
}

export async function comparisonRefs(cwd: string) {
  const refs = (await git(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']))
    .trim().split('\n').filter(Boolean).filter(r => !r.endsWith('/HEAD'))
    .map(value => ({ value, label: value.replace(/^refs\/(heads|remotes)\//, '') }))
  refs.push({ value: 'HEAD', label: 'HEAD' })
  return refs
}

export async function compare(cwd: string, options: { base?: string; target?: string; scope?: string; file?: string }): Promise<CompareResult> {
  const refs = await comparisonRefs(cwd)
  const current = await spawnGit(['symbolic-ref', '-q', 'HEAD'], cwd)
  const base = options.base ?? refs.find(r => r.value === 'refs/heads/main')?.value ?? 'HEAD'
  const target = options.target ?? (current.code === 0 ? current.stdout.trim() : 'HEAD')
  const resolve = async (ref: string) => {
    if (!refs.some(r => r.value === ref)) throw new Error('Unknown comparison branch')
    return (await git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim()
  }
  const left = await resolve(base)
  const right = target === 'worktree' ? undefined : await resolve(target)
  const args = ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', left, ...(right ? [right] : [])]
  const scope = options.scope ?? ''
  if (scope.startsWith('/') || scope.split('/').includes('..')) throw new Error('Use a path relative to the repository')
  const names = (await git(cwd, [...args, '--name-status', '-z', '--', ...(scope ? [scope] : [])])).split('\0')
  const files: CompareFile[] = []
  for (let i = 0; i < names.length && names[i];) {
    const status = names[i++]!
    const first = names[i++]!
    if (status.startsWith('R') || status.startsWith('C')) files.push({ status, oldPath: first, path: names[i++]! })
    else files.push({ status, path: first })
  }
  const selected = files.find(f => f.path === options.file) ?? files[0]
  let patch = ''
  if (selected) {
    patch = await git(cwd, [...args, '--unified=1000000', '--', ...new Set([selected.oldPath, selected.path].filter((p): p is string => !!p))])
    if (patch.length > 2_000_000 || patch.split('\n').length > 20_000) patch = 'This file is too large to display. Narrow the comparison or inspect it with git.'
  }
  return { refs, base, target, files, selected, patch }
}
