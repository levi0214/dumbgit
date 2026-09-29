import { expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compare } from '../src/compare'
import { CompareView, splitRows } from '../src/views/compare'

function git(cwd: string, ...args: string[]) {
  const p = Bun.spawnSync(['git', ...args], { cwd })
  if (p.exitCode) throw new Error(p.stderr.toString())
  return p.stdout.toString().trim()
}
test('direct branch and working tree comparisons, literal paths, rename and binary files', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dg-compare-'))
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'config', 'user.email', 'test@example.test')
    mkdirSync(path.join(repo, 'contracts'))
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'before\n')
    writeFileSync(path.join(repo, 'rename.txt'), 'unchanged\n')
    writeFileSync(path.join(repo, 'deleted.txt'), 'gone\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'test: base')
    git(repo, 'switch', '-c', 'feature')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'after\n')
    renameSync(path.join(repo, 'rename.txt'), path.join(repo, 'renamed.txt'))
    rmSync(path.join(repo, 'deleted.txt'))
    writeFileSync(path.join(repo, 'binary'), Buffer.from([0, 1, 2]))
    writeFileSync(path.join(repo, 'tab\tline\n.txt'), 'odd name\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'test: feature')
    const r = await compare(repo, {})
    expect(r.base).toBe('refs/heads/main')
    expect(r.target).toBe('refs/heads/feature')
    expect(r.files.find(f => f.path === 'renamed.txt')?.oldPath).toBe('rename.txt')
    expect(r.files.some(f => f.path === 'tab\tline\n.txt')).toBe(true)
    expect(r.files.some(f => f.status === 'D')).toBe(true)
    const filtered = await compare(repo, { scope: 'contracts/[a].txt' })
    expect(filtered.files.length).toBe(1)
    expect(filtered.patch).toContain('+after')
    expect(filtered.patch).toContain('-before')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'staged\n')
    git(repo, 'add', '.')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'working\n')
    writeFileSync(path.join(repo, 'untracked'), 'invisible\n')
    const work = await compare(repo, { target: 'worktree', scope: 'contracts/' })
    expect(work.patch).toContain('+working')
    expect(work.patch).not.toContain('+staged')
    expect((await compare(repo, { target: 'worktree' })).files.some(f => f.path === 'untracked')).toBe(false)
    expect((await compare(repo, { scope: 'missing/' })).files).toEqual([])
    expect((await compare(repo, { file: 'binary' })).patch).toContain('Binary files')
    // Advance main separately: comparison must use its tip, not the merge base.
    git(repo, 'restore', '--staged', '--worktree', 'contracts/[a].txt')
    git(repo, 'switch', 'main')
    writeFileSync(path.join(repo, 'main-only'), 'tip\n')
    git(repo, 'add', 'main-only')
    git(repo, 'commit', '-m', 'test: advance main')
    const direct = await compare(repo, { target: 'refs/heads/feature' })
    expect(direct.files.some(f => f.path === 'main-only' && f.status === 'D')).toBe(true)
    expect(git(repo, 'branch', '--show-current')).toBe('main')
    await expect(compare(repo, { base: '--help' })).rejects.toThrow('Unknown')
    await expect(compare(repo, { scope: '../' })).rejects.toThrow('relative')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('split rows preserve independent line numbers and align unequal replacements', () => {
  const rows = splitRows('@@ -1,4 +1,3 @@\n same\n-old\n-removed\n+new\n end\n')
  expect(rows.length).toBe(4)
  expect(rows[1]?.left?.text).toBe('old')
  expect(rows[1]?.right?.text).toBe('new')
  expect(rows[2]?.right).toBeUndefined()
  expect(rows[3]?.left?.oldNo).toBe(4)
  expect(rows[3]?.right?.newNo).toBe(3)
})

test('reader escapes code, folds context and exposes change navigation', () => {
  const patch = '@@ -1,21 +1,21 @@\n' + Array.from({ length: 20 }, (_, i) => ` line ${i}\n`).join('') + '-old\n+<script>alert(1)</script>\n'
  const html = CompareView({ repo: '/tmp/example', name: 'example', scope: '', result: { refs: [{ value: 'HEAD', label: 'HEAD' }], base: 'HEAD', target: 'worktree', files: [{ status: 'M', path: 'a.txt' }], selected: { status: 'M', path: 'a.txt' }, patch } }).toString()
  expect(html).toContain('Show 17 unchanged lines')
  expect(html).toContain('compare-change-0')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('untracked files are excluded')
})
