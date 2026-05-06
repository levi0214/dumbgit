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
  const stagedRows = staged.map((entry) => ({
    entry,
    kind: 'staged' as const,
  }))
  const changeRows = hasStaged
    ? [
        ...unstaged.map((entry) => ({ entry, kind: 'unstaged' as const })),
        ...untracked.map((entry) => ({ entry, kind: 'untracked' as const })),
      ]
    : [
        ...staged.map((entry) => ({ entry, kind: 'staged' as const })),
        ...unstaged.map((entry) => ({ entry, kind: 'unstaged' as const })),
        ...untracked.map((entry) => ({ entry, kind: 'untracked' as const })),
      ]

  return (
    <div id="worktree" class="worktree-panel" data-repo={repoPath}>
      <div class="worktree-body">
        {hasStaged ? (
          <Section title="ready to commit" rows={stagedRows} />
        ) : null}
        {changeRows.length > 0 ? (
          <Section title="changes" rows={changeRows} />
        ) : null}
      </div>
    </div>
  )
}

function Section(props: {
  title: string
  rows: Array<{
    entry: WorkTreeEntry
    kind: 'staged' | 'unstaged' | 'untracked'
  }>
}) {
  if (props.rows.length === 0) return null
  return (
    <div class="wt-section">
      <div class="wt-section-title">
        {props.title}{' '}
        <span class="wt-count">({props.rows.length})</span>
      </div>
      <ul class="wt-list">
        {props.rows.map(({ entry: e, kind }) => {
          const label = markLabel(e.mark)
          const diffUrl = `/api/worktree/file?kind=${kind}&path=${encodeURIComponent(e.path)}`
          return (
            <li>
              <button
                type="button"
                class="wt-file-btn"
                title={
                  label ? `${label} — click for diff` : `${e.mark} — click for diff`
                }
                hx-get={diffUrl}
                hx-target="#diff"
                hx-swap="outerHTML"
              >
                <span class="wt-path">{e.path}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
