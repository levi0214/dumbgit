import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

/**
 * Watch git refs / HEAD and call `onChange` when they change.
 *
 * Only watches `HEAD`, `packed-refs`, and `refs/**` — never `objects/`.
 * A recursive watch on the whole git dir would see every loose-object write
 * (thousands per day in an active repo) and, on long-lived Bun processes,
 * that event churn balloons the JS heap until graph loads fail with OOM.
 *
 * Notes:
 * - Uses macOS FSEvents under the hood when run on Bun/macOS, so the cost
 *   is essentially zero while idle.
 * - Burst events (e.g. during `git fetch`) are coalesced via a small debounce.
 * - Linked worktrees: also watches the common git dir (via `commondir`).
 */
export function watchGitRefs(
  gitDirPath: string,
  onChange: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      try {
        onChange()
      } catch {
        // never let observer errors kill the watcher
      }
    }, 80)
  }

  const watchers: FSWatcher[] = []
  const onErr = (err: Error) => {
    console.error('dumbgit: git watcher error:', err)
  }

  const track = (w: FSWatcher) => {
    w.on('error', onErr)
    watchers.push(w)
  }

  /** Prefer file watches — directory watches miss in-place edits on some platforms. */
  const watchFile = (filePath: string) => {
    if (!existsSync(filePath)) return
    track(watch(filePath, () => fire()))
  }

  const watchRefsTree = (dir: string) => {
    const refsDir = path.join(dir, 'refs')
    if (!existsSync(refsDir)) return
    // refs/ is tiny vs objects/; recursive here is fine.
    track(watch(refsDir, { recursive: true }, () => fire()))
  }

  const watchGitDir = (dir: string) => {
    watchFile(path.join(dir, 'HEAD'))
    watchFile(path.join(dir, 'packed-refs'))
    // packed-refs may appear later (first pack); catch create via non-recursive dir watch.
    track(
      watch(dir, { recursive: false }, (_event, filename) => {
        if (!filename) return
        const f = filename.replace(/\\/g, '/')
        if (f === 'packed-refs' || f === 'HEAD') fire()
      }),
    )
    watchRefsTree(dir)
  }

  watchGitDir(gitDirPath)

  const commonDir = resolveCommonDir(gitDirPath)
  if (commonDir !== gitDirPath) {
    watchGitDir(commonDir)
  }

  return () => {
    if (timer) clearTimeout(timer)
    timer = null
    for (const w of watchers) {
      try {
        w.close()
      } catch {
        // ignore double-close
      }
    }
    watchers.length = 0
  }
}

/** Main repo git dir for linked worktrees (`commondir` file); else `gitDirPath`. */
function resolveCommonDir(gitDirPath: string): string {
  const marker = path.join(gitDirPath, 'commondir')
  if (!existsSync(marker)) return gitDirPath
  try {
    const rel = readFileSync(marker, 'utf8').trim()
    if (!rel) return gitDirPath
    return path.resolve(gitDirPath, rel)
  } catch {
    return gitDirPath
  }
}
