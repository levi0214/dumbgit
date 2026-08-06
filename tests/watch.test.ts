import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { watchGitRefs } from '../src/watch'

function tempGitDir(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'dumbgit-watch-'))
  const gitDir = path.join(root, '.git')
  mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true })
  mkdirSync(path.join(gitDir, 'objects', 'ab'), { recursive: true })
  writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
  writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), 'a'.repeat(40) + '\n')
  return gitDir
}

describe('watchGitRefs', () => {
  const cleanups: Array<() => void> = []
  const dirs: string[] = []

  afterEach(() => {
    for (const c of cleanups.splice(0)) c()
    for (const d of dirs.splice(0)) {
      try {
        rmSync(path.dirname(d), { recursive: true, force: true })
      } catch {
        // ignore
      }
    }
  })

  test('fires on refs/ and HEAD changes, not on objects/', async () => {
    const gitDir = tempGitDir()
    dirs.push(gitDir)

    let hits = 0
    const close = watchGitRefs(
      gitDir,
      () => {
        hits++
      },
      { pollIntervalMs: 150 },
    )
    cleanups.push(close)

    // Let the watcher attach (FSEvents can be slightly async).
    await Bun.sleep(100)
    // Ignore attach-time spurious events.
    hits = 0

    writeFileSync(
      path.join(gitDir, 'objects', 'ab', 'cd'.repeat(19)),
      'blob-bytes',
    )
    await Bun.sleep(300)
    expect(hits).toBe(0)

    writeFileSync(path.join(gitDir, 'refs', 'heads', 'main'), 'b'.repeat(40) + '\n')
    await Bun.sleep(800)
    expect(hits).toBeGreaterThanOrEqual(1)
    const afterRef = hits

    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/topic\n')
    await Bun.sleep(800)
    expect(hits).toBeGreaterThan(afterRef)
  })

  test('watches common dir refs for linked worktrees', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'dumbgit-wt-'))
    dirs.push(path.join(root, '.git'))

    const common = path.join(root, '.git')
    const worktreeGit = path.join(common, 'worktrees', 'w1')
    mkdirSync(path.join(common, 'refs', 'heads'), { recursive: true })
    mkdirSync(worktreeGit, { recursive: true })
    writeFileSync(path.join(common, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(path.join(common, 'refs', 'heads', 'main'), 'a'.repeat(40) + '\n')
    writeFileSync(path.join(worktreeGit, 'commondir'), '../..\n')
    writeFileSync(path.join(worktreeGit, 'HEAD'), 'ref: refs/heads/main\n')

    let hits = 0
    const close = watchGitRefs(
      worktreeGit,
      () => {
        hits++
      },
      { pollIntervalMs: 150 },
    )
    cleanups.push(close)
    await Bun.sleep(50)

    writeFileSync(
      path.join(common, 'refs', 'heads', 'main'),
      'c'.repeat(40) + '\n',
    )
    await Bun.sleep(250)
    expect(hits).toBeGreaterThanOrEqual(1)
  })
})
