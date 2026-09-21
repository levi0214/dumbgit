import { createHash } from 'node:crypto'
import { spawnGit } from './git'

export const ACTIVITY_WINDOW_MS = 12 * 60 * 60 * 1000
export type RepoActivity = { token: string; lastActiveAt: number }

export function isRepoActive(lastActiveAt: number, now = Date.now()): boolean {
  return lastActiveAt > 0 && now - lastActiveAt < ACTIVITY_WINDOW_MS
}

/** Remote refs and background fetches deliberately do not enter this token. */
export async function readLocalActivity(repoPath: string, fingerprint: string) {
  const [head, branch] = await Promise.all([
    spawnGit(['rev-parse', '--verify', 'HEAD'], repoPath),
    spawnGit(['symbolic-ref', '-q', 'HEAD'], repoPath),
  ])
  if (head.code !== 0 && branch.code !== 0) throw new Error('Repository unavailable')
  const token = createHash('sha256')
    .update(head.stdout + '\0' + branch.stdout + '\0' + fingerprint).digest('hex')
  return token
}

/** Best available evidence when we have never observed this repository. */
export async function initialActivityTime(repoPath: string, fingerprint: string): Promise<number> {
  const [commit, reflog] = await Promise.all([
    spawnGit(['log', '-1', '--format=%ct'], repoPath),
    spawnGit(['reflog', '-1', '--format=%gD', '--date=unix', 'HEAD'], repoPath),
  ])
  let latest = Math.max(Number(commit.stdout.trim()) * 1000 || 0,
    Number(reflog.stdout.match(/@\{(\d+)\}/)?.[1]) * 1000 || 0)
  // The fingerprint contains metadata for changed, non-ignored files only.
  for (const record of fingerprint.split('\x1e').slice(1)) {
    const fields = record.split('\x1f')
    if (fields.length >= 4) latest = Math.max(latest, Number(fields.at(-2)) || 0)
  }
  return Math.min(latest, Date.now())
}

export function nextActivity(previous: RepoActivity | undefined, token: string, initial: number, now = Date.now()): RepoActivity {
  return { token, lastActiveAt: previous ? (previous.token === token ? previous.lastActiveAt : now) : initial }
}
