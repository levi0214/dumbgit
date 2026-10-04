import { spawnGit } from './git'

export type CompareFile = {
  status: string
  path: string
  oldPath?: string
  added?: number
  deleted?: number
  binary?: boolean
}
export type CompareResult = {
  refs: { value: string; label: string; current?: boolean }[]
  base: string
  target: string
  versions?: { base: string; target: string }
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
  const [output, current] = await Promise.all([
    git(cwd, ['for-each-ref', '--sort=refname', '--sort=-committerdate', '--format=%(refname)%09%(symref)', 'refs/heads', 'refs/remotes']),
    spawnGit(['symbolic-ref', '-q', 'HEAD'], cwd),
  ])
  const currentRef = current.code === 0 ? current.stdout.trim() : 'HEAD'
  const refs = output.split('\n').filter(Boolean)
    .map(line => line.split('\t'))
    .filter(([ref, symref]) => !(ref!.startsWith('refs/remotes/') && ref!.endsWith('/HEAD') && symref))
    .map(([ref]) => ref!)
    .map(value => ({ value, label: value.replace(/^refs\/(heads|remotes)\//, ''), current: value === currentRef }))
  refs.push({ value: 'HEAD', label: 'HEAD', current: currentRef === 'HEAD' })
  return refs.sort((a, b) => Number(b.current) - Number(a.current))
}

const fileCache = new Map<string, CompareFile[]>()

function diffArgs(base: string, target: string) {
  return ['--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', base, ...(target === 'worktree' ? [] : [target])]
}

/** Load only the selected file, using the commit IDs resolved for the reader. */
export async function comparisonPatch(cwd: string, base: string, target: string, file: Pick<CompareFile, 'path' | 'oldPath'>) {
  const oid = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
  if (!oid.test(base) || (target !== 'worktree' && !oid.test(target))) throw new Error('Invalid comparison version')
  const paths = [...new Set([file.oldPath, file.path].filter((p): p is string => p !== undefined))]
  if (!file.path || paths.some(p => !p || p.startsWith('/') || p.split('/').includes('..'))) throw new Error('Use a path relative to the repository')
  const patch = await git(cwd, [...diffArgs(base, target), '--unified=1000000', '--', ...paths])
  return patch.length > 2_000_000 || patch.split('\n').length > 20_000
    ? 'This file is too large to display. Open this file in your editor or inspect it with git.' : patch
}

async function comparisonFiles(cwd: string, args: string[], paths: string[]) {
  const [nameOutput, statOutput] = await Promise.all([
    git(cwd, [...args, '--name-status', '-z', '--', ...paths]),
    git(cwd, [...args, '--numstat', '-z', '--', ...paths]),
  ])
  const names = nameOutput.split('\0')
  const files: CompareFile[] = []
  for (let i = 0; i < names.length && names[i];) {
    const status = names[i++]!
    const first = names[i++]!
    if (status.startsWith('R') || status.startsWith('C')) files.push({ status, oldPath: first, path: names[i++]! })
    else files.push({ status, path: first })
  }
  // With -z, renamed paths occupy two separate NUL-delimited fields.
  // Only the first two tabs are separators; filenames may themselves contain tabs.
  const stats = statOutput.split('\0')
  const byPath = new Map(files.map(file => [file.path, file]))
  for (let i = 0; i < stats.length && stats[i];) {
    const record = stats[i++]!
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    const added = record.slice(0, firstTab)
    const deleted = record.slice(firstTab + 1, secondTab)
    let filePath = record.slice(secondTab + 1)
    if (!filePath) {
      i++ // old path
      filePath = stats[i++]!
    }
    const file = byPath.get(filePath)
    if (!file) continue
    file.binary = added === '-' || deleted === '-'
    if (!file.binary) {
      file.added = Number(added)
      file.deleted = Number(deleted)
    }
  }
  return files
}

export async function compare(cwd: string, options: { base?: string; target?: string; scope?: string; file?: string; previous?: { base: string; target: string } }): Promise<CompareResult> {
  const refs = await comparisonRefs(cwd)
  // Explicit links take precedence. Forget a saved pair if either branch disappeared.
  const previous = !options.base && !options.target && options.previous
    && refs.some(r => r.value === options.previous!.base)
    && (options.previous.target === 'worktree' || refs.some(r => r.value === options.previous!.target))
    ? options.previous : undefined
  const base = options.base ?? previous?.base ?? refs.find(r => r.value === 'refs/heads/main')?.value ?? 'HEAD'
  const target = options.target ?? previous?.target ?? refs.find(r => r.current)?.value ?? 'HEAD'
  const resolve = async (ref: string) => {
    if (!refs.some(r => r.value === ref)) throw new Error('Unknown comparison branch')
    return (await git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim()
  }
  const [left, right] = await Promise.all([resolve(base), target === 'worktree' ? undefined : resolve(target)])
  const versions = { base: left, target: right ?? 'worktree' }
  const args = diffArgs(versions.base, versions.target)
  const scope = options.scope ?? ''
  if (scope.startsWith('/') || scope.split('/').includes('..')) throw new Error('Use a path relative to the repository')
  const paths = scope ? [scope] : []
  // Commit tips are immutable. Never cache working-tree metadata.
  const key = right ? JSON.stringify([cwd, left, right, scope]) : undefined
  let files = key ? fileCache.get(key) : undefined
  if (files && key) {
    fileCache.delete(key)
    fileCache.set(key, files)
  } else {
    files = await comparisonFiles(cwd, args, paths)
    if (key && files.length <= 10_000) {
      fileCache.set(key, files)
      while (fileCache.size > 32 || [...fileCache.values()].reduce((n, files) => n + files.length, 0) > 10_000) {
        fileCache.delete(fileCache.keys().next().value!)
      }
    }
  }
  // Keep callers from mutating the cached snapshot.
  files = files.map(file => ({ ...file }))
  const selected = files.find(f => f.path === options.file) ?? files[0]
  const patch = selected ? await comparisonPatch(cwd, versions.base, versions.target, selected) : ''
  return { refs, base, target, versions, files, selected, patch }
}
