import fs from 'node:fs'
import path from 'node:path'

const MAX = 10
const FILE = path.join(import.meta.dir, '..', '.dumbgit-recents.json')

export function loadRecents(): string[] {
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('dumbgit: bad .dumbgit-recents.json, ignoring:', e)
    }
    return []
  }
}

/** MRU list; writes absolute paths. */
export function bumpRecent(absPath: string): void {
  const norm = path.resolve(absPath)
  const next = [norm, ...loadRecents().filter((p) => p !== norm)].slice(0, MAX)
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n', 'utf8')
}
