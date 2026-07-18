import { expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  readRepoHistory,
  rememberRepo,
  repoHistoryPath,
} from '../src/history'

test('remembers canonical repository paths without duplicates', () => {
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
      realpathSync(second),
      realpathSync(first),
    ])

    rememberRepo(first)
    expect(readRepoHistory().map((entry) => entry.repoPath)).toEqual([
      realpathSync(first),
      realpathSync(second),
    ])
  } finally {
    if (previous === undefined) delete process.env.DUMBGIT_HISTORY_FILE
    else process.env.DUMBGIT_HISTORY_FILE = previous
    rmSync(root, { recursive: true, force: true })
  }
})
