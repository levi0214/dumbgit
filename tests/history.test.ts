import { expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  forgetRepo,
  readRepoHistory,
  rememberRepo,
  reorderRepoHistory,
  repoHistoryPath,
} from '../src/history'

test('remembers and reorders canonical repository paths', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-history-'))
  const historyFile = path.join(root, 'state', 'repos.json')
  const first = path.join(root, 'first')
  const second = path.join(root, 'second')
  mkdirSync(first)
  mkdirSync(second)

  const previous = process.env.DUMBGIT_HISTORY_FILE
  process.env.DUMBGIT_HISTORY_FILE = historyFile

  try {
    expect(repoHistoryPath()).toBe(historyFile)
    expect(readRepoHistory()).toEqual([])

    rememberRepo(first)
    rememberRepo(second)
    expect(readRepoHistory().map((entry) => entry.repoPath)).toEqual([
      realpathSync(first),
      realpathSync(second),
    ])

    rememberRepo(first)
    expect(readRepoHistory().map((entry) => entry.repoPath)).toEqual([
      realpathSync(first),
      realpathSync(second),
    ])

    reorderRepoHistory([realpathSync(second), realpathSync(first)])
    expect(readRepoHistory().map((entry) => entry.repoPath)).toEqual([
      realpathSync(second),
      realpathSync(first),
    ])
    expect(JSON.parse(readFileSync(historyFile, 'utf8'))).toEqual({
      repos: [
        { repoPath: realpathSync(second) },
        { repoPath: realpathSync(first) },
      ],
    })

    expect(forgetRepo(first)).toBe(realpathSync(first))
    expect(readRepoHistory().map((entry) => entry.repoPath)).toEqual([
      realpathSync(second),
    ])
    expect(forgetRepo(first)).toBeNull()
    expect(forgetRepo('/no/such/repo')).toBeNull()
  } finally {
    if (previous === undefined) delete process.env.DUMBGIT_HISTORY_FILE
    else process.env.DUMBGIT_HISTORY_FILE = previous
    rmSync(root, { recursive: true, force: true })
  }
})
