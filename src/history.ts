import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type RememberedRepo = {
  repoPath: string
  lastOpenedAt: string
}

type HistoryFile = {
  version: 1
  repos: RememberedRepo[]
}

export function repoHistoryPath(): string {
  const override = process.env.DUMBGIT_HISTORY_FILE
  if (override) return path.resolve(override)
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'dumbgit',
    'repos.json',
  )
}

export function readRepoHistory(): RememberedRepo[] {
  try {
    const parsed = JSON.parse(
      readFileSync(repoHistoryPath(), 'utf8'),
    ) as Partial<HistoryFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.repos)) return []
    return parsed.repos
      .filter(
        (entry): entry is RememberedRepo =>
          !!entry &&
          typeof entry.repoPath === 'string' &&
          typeof entry.lastOpenedAt === 'string',
      )
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
  } catch {
    return []
  }
}

export function rememberRepo(repoPath: string): void {
  try {
    const canonical = realpathSync(repoPath)
    const now = new Date().toISOString()
    const repos = readRepoHistory().filter(
      (entry) => entry.repoPath !== canonical,
    )
    repos.unshift({ repoPath: canonical, lastOpenedAt: now })

    const file = repoHistoryPath()
    mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    const payload: HistoryFile = { version: 1, repos }
    writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, {
      mode: 0o600,
    })
    renameSync(temp, file)
  } catch {
    // History is a convenience; it must never prevent opening a repository.
  }
}
