import { expect, test } from 'bun:test'
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DUMBGIT_PREVIEW_STASH_MSG, stashFilePatch, stashSummary } from '../src/git'
import { parseDiff } from '../src/views/diff'

for (const includeUntracked of [false, true]) {
  test(`stash shows unified changes with untracked=${includeUntracked}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'dumbgit-stash-'))
    const git = (...args: string[]) => {
      const result = Bun.spawnSync(['git', ...args], { cwd: root })
      if (result.exitCode !== 0) throw new Error(result.stderr.toString())
      return result.stdout.toString()
    }
    const write = (name: string, text: string) => writeFileSync(join(root, name), text)
    try {
      git('init', '-q')
      git('config', 'user.name', 'Test')
      git('config', 'user.email', 'test@example.com')
      const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}\n`).join('')
      write('tracked.txt', lines)
      write('staged.txt', 'before\n')
      write('deleted.txt', 'remove me\n')
      write('old.txt', lines)
      git('add', '.')
      git('commit', '-qm', 'test: initial')
      write('tracked.txt', lines.replace('line 15\n', 'line 15 changed\n'))
      write('staged.txt', 'after\n')
      write('added.txt', 'staged new file\n')
      renameSync(join(root, 'old.txt'), join(root, 'renamed.txt'))
      git('add', 'staged.txt', 'added.txt', 'old.txt', 'renamed.txt')
      rmSync(join(root, 'deleted.txt'))
      if (includeUntracked) {
        write('untracked.txt', 'new one\nnew two\n')
        write('binary.dat', '\0binary\0')
      }
      git('stash', 'push', ...(includeUntracked ? ['-u'] : []), '-m', DUMBGIT_PREVIEW_STASH_MSG)
      const summary = await stashSummary('stash@{0}', root)
      if (!summary.ok) throw new Error(summary.stderr)
      const files = summary.value.files
      expect(files.find((f) => f.path === 'tracked.txt')).toMatchObject({ status: 'M', added: 1, deleted: 1 })
      expect(files.find((f) => f.path === 'staged.txt')).toMatchObject({ status: 'M', added: 1, deleted: 1 })
      expect(files.find((f) => f.path === 'deleted.txt')).toMatchObject({ status: 'D', added: 0, deleted: 1 })
      expect(files.find((f) => f.path === 'added.txt')).toMatchObject({ status: 'A', added: 1, deleted: 0 })
      expect(files.find((f) => f.path === 'old.txt → renamed.txt')?.status).toBe('R100')
      const patch = await stashFilePatch('stash@{0}', 'tracked.txt', files, root)
      if (!patch.ok) throw new Error(patch.stderr)
      expect(patch.patch).toContain('-line 15\n+line 15 changed')
      expect(patch.patch).not.toContain('line 1\n')
      expect(patch.patch).not.toContain('diff --cc')
      expect(parseDiff(patch.patch).filter((r) => r.kind === 'add' || r.kind === 'del')).toHaveLength(2)
      for (const [name, expected] of [
        ['staged.txt', '-before\n+after'],
        ['added.txt', '+staged new file'],
        ['deleted.txt', '-remove me'],
        ['old.txt → renamed.txt', 'rename from old.txt\nrename to renamed.txt'],
      ]) {
        const result = await stashFilePatch('stash@{0}', name!, undefined, root)
        if (!result.ok) throw new Error(result.stderr)
        expect(result.patch).toContain(expected!)
      }
      if (includeUntracked) {
        expect(files.find((f) => f.path === 'untracked.txt')).toMatchObject({ status: 'A', added: 2, deleted: 0 })
        expect(files.find((f) => f.path === 'binary.dat')).toMatchObject({ status: 'A', binary: true })
        const result = await stashFilePatch('stash@{0}', 'untracked.txt', files, root)
        if (!result.ok) throw new Error(result.stderr)
        expect(result.patch).toContain('--- /dev/null')
        expect(result.patch).toContain('+new one\n+new two')
      }
      expect(await stashFilePatch('stash@{0}', 'missing.txt', files, root)).toMatchObject({ ok: false })
      expect(await stashFilePatch('stash@{99}', 'tracked.txt', files, root)).toMatchObject({ ok: false })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}
