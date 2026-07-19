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
  active: boolean
}

type HistoryFile = {
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
    if (!Array.isArray(parsed.repos)) return []
    return parsed.repos.filter(
      (entry): entry is RememberedRepo =>
        !!entry &&
        typeof entry.repoPath === 'string' &&
        typeof entry.active === 'boolean',
    )
  } catch {
    return []
  }
}

function writeRepoHistory(repos: RememberedRepo[]): void {
  const file = repoHistoryPath()
  mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  const payload: HistoryFile = { repos }
  writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  })
  renameSync(temp, file)
}

export function rememberRepo(repoPath: string, active = true): void {
  try {
    const canonical = realpathSync(repoPath)
    const repos = readRepoHistory()
    const existing = repos.find(
      (entry) => entry.repoPath === canonical,
    )
    if (existing) {
      if (active) existing.active = true
    } else {
      repos.push({ repoPath: canonical, active })
    }
    writeRepoHistory(repos)
  } catch {
    // History is a convenience; it must never prevent opening a repository.
  }
}

export function setRepoActive(repoPath: string, active: boolean): boolean {
  try {
    const canonical = realpathSync(repoPath)
    const repos = readRepoHistory()
    const existing = repos.find((entry) => entry.repoPath === canonical)
    if (!existing) return false
    existing.active = active
    writeRepoHistory(repos)
    return true
  } catch {
    return false
  }
}

export function reorderRepoHistory(repoPaths: string[]): void {
  try {
    const repos = readRepoHistory()
    const byPath = new Map(repos.map((entry) => [entry.repoPath, entry]))
    const reordered: RememberedRepo[] = []
    const seen = new Set<string>()

    for (const repoPath of repoPaths) {
      if (seen.has(repoPath)) continue
      const entry = byPath.get(repoPath)
      if (!entry) continue
      reordered.push(entry)
      seen.add(repoPath)
    }
    for (const entry of repos) {
      if (!seen.has(entry.repoPath)) reordered.push(entry)
    }
    writeRepoHistory(reordered)
  } catch {
    // Reordering is a convenience; keep the existing history on failure.
  }
}
