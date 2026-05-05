/** @jsxImportSource hono/jsx */
import type { WorkTreeEntry, WorkTreeSummary } from '../git'

const MARK_LABELS: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
  U: 'unmerged',
  '??': 'new file',
}

/** Look up a friendly word for a `git status` mark like `M`, `A`, `R100`, `??`. */
function markLabel(mark: string): string {
  if (!mark) return ''
  if (mark === '??') return MARK_LABELS['??']!
  const head = mark[0]!
  return MARK_LABELS[head] ?? mark
}

export function WorkTreeFragment(
  props: WorkTreeSummary & { repoPath: string },
) {
  const { staged, unstaged, untracked, repoPath } = props
  const total = staged.length + unstaged.length + untracked.length

  if (total === 0) {
    return (
      <div
        id="worktree"
        class="worktree-panel worktree-clean-panel"
        data-repo={repoPath}
      >
        <span class="worktree-clean">no changes</span>
      </div>
    )
  }

  const hasStaged = staged.length > 0
  const changes = hasStaged
    ? [...unstaged, ...untracked]
    : [...staged, ...unstaged, ...untracked]

  return (
    <div id="worktree" class="worktree-panel" data-repo={repoPath}>
      <div class="worktree-body">
        {hasStaged ? (
          <Section title="ready to commit" entries={staged} />
        ) : null}
        {changes.length > 0 ? (
          <Section title="changes" entries={changes} />
        ) : null}
      </div>
    </div>
  )
}

function Section(props: { title: string; entries: WorkTreeEntry[] }) {
  if (props.entries.length === 0) return null
  return (
    <div class="wt-section">
      <div class="wt-section-title">
        {props.title}{' '}
        <span class="wt-count">({props.entries.length})</span>
      </div>
      <ul class="wt-list">
        {props.entries.map((e) => {
          const label = markLabel(e.mark)
          return (
            <li title={label ? `${label} — ${e.mark}` : e.path}>
              <span class="wt-path">{e.path}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
