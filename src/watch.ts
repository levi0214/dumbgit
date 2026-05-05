import { watch } from 'node:fs'

/**
 * Watch a git directory and call `onChange` when refs/HEAD/packed-refs change.
 *
 * Notes:
 * - Uses macOS FSEvents under the hood when run on Bun/macOS, so the cost
 *   is essentially zero while idle.
 * - Burst events (e.g. during `git gc`) are coalesced via a small debounce.
 * - Filters out noise from `objects/`, `logs/`, etc. — we only care about
 *   things that change what `git log --all` and the branch list show.
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

  const w = watch(gitDirPath, { recursive: true }, (_event, filename) => {
    if (!filename) return
    const f = filename.replace(/\\/g, '/')
    if (
      f === 'HEAD' ||
      f === 'packed-refs' ||
      f.startsWith('refs/')
    ) {
      fire()
    }
  })

  w.on('error', (err) => {
    console.error('dumbgit: git watcher error:', err)
  })

  return () => {
    if (timer) clearTimeout(timer)
    w.close()
  }
}
