import { expect, test } from 'bun:test'
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { commitFilePatch, commitSummary, workTreeFilePatch, workTreeSummary } from '../src/git'
import { parseDiff } from '../src/views/diff'

for (const changed of [false, true]) {
  for (const kind of ['staged', 'unstaged', 'commit'] as const) {
    test(`${kind} rename diff preserves ${changed ? 'content edits' : 'unchanged content'}`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'dumbgit-rename-'))
      const git = (...args: string[]) => {
        const result = Bun.spawnSync(['git', ...args], { cwd: root })
        if (result.exitCode !== 0) throw new Error(result.stderr.toString())
        return result.stdout.toString().trim()
      }
      try {
        git('init', '-q')
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@example.com')
        git('config', 'diff.renames', 'true')
        const before = Array.from({ length: 30 }, (_, i) => `line ${i + 1}\n`).join('')
        writeFileSync(join(root, 'old[1].txt'), before)
        git('add', '.')
        git('commit', '-qm', 'test: initial')
        renameSync(join(root, 'old[1].txt'), join(root, 'new[1].txt'))
        if (changed) writeFileSync(join(root, 'new[1].txt'), before.replace('line 15\n', 'edited line 15\n'))
        if (kind === 'unstaged') git('--literal-pathspecs', 'add', '-N', 'new[1].txt')
        else git('add', '.')
        const displayPath = 'old[1].txt → new[1].txt'
        let patch
        if (kind === 'commit') {
          git('commit', '-qm', 'test: rename file')
          const sha = git('rev-parse', 'HEAD')
          const summary = await commitSummary(sha, {}, root)
          if (!summary.ok) throw new Error(summary.stderr)
          expect(summary.value.files[0]?.status.startsWith('R')).toBe(true)
          patch = await commitFilePatch(sha, displayPath, undefined, root)
        } else {
          const summary = await workTreeSummary(root)
          expect(summary[kind][0]?.mark.startsWith('R')).toBe(true)
          patch = await workTreeFilePatch(kind, displayPath, root)
        }
        if (!patch.ok) throw new Error(patch.stderr)
        expect(patch.patch).toContain('rename from old[1].txt\nrename to new[1].txt')
        expect(patch.patch).not.toContain('new file mode')
        expect(parseDiff(patch.patch).filter((row) => row.kind === 'add' || row.kind === 'del')).toHaveLength(changed ? 2 : 0)
        if (changed) expect(patch.patch).toContain('-line 15\n+edited line 15')
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  }
}
