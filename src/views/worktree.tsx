/** @jsxImportSource hono/jsx */
import type { WorkTreeSummary } from '../git'

export function WorkTreeFragment(props: WorkTreeSummary) {
  const { staged, unstaged, untracked } = props
  const clean =
    staged.length === 0 && unstaged.length === 0 && untracked.length === 0

  return (
    <div id="worktree" class="worktree-panel">
      <div class="worktree-head">working tree</div>
      {clean ? (
        <div class="worktree-clean">clean — nothing staged or unstaged</div>
      ) : (
        <div class="worktree-body">
          <Section title="staged" entries={staged} />
          <Section title="unstaged" entries={unstaged} />
          <Section title="untracked" entries={untracked} />
        </div>
      )}
    </div>
  )
}

function Section(props: {
  title: string
  entries: WorkTreeSummary['staged']
}) {
  if (props.entries.length === 0) return null
  return (
    <div class="wt-section">
      <div class="wt-section-title">
        {props.title}{' '}
        <span class="wt-count">({props.entries.length})</span>
      </div>
      <ul class="wt-list">
        {props.entries.map((e) => (
          <li>
            <span class="wt-mark">{e.mark}</span>
            <span class="wt-path">{e.path}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
