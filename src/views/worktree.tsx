/** @jsxImportSource hono/jsx */
import {
  DUMBGIT_PREVIEW_STASH_MSG,
  type PreviewStashUi,
  type WorkTreeEntry,
  type WorkTreeSummary,
} from '../git'

const STASH_CMD = `git stash push -u -m ${DUMBGIT_PREVIEW_STASH_MSG}`
const UNSH_CMD =
  'git stash apply --index -u <dumbgit-preview-ref>; git stash drop <same-ref>'

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

function WorkTreeNums(props: {
  entry: WorkTreeEntry
  kind: 'staged' | 'unstaged' | 'untracked'
}) {
  const { entry: e } = props
  if (props.kind === 'untracked') {
    return <span class="file-num file-num-new">new</span>
  }
  if (e.binary) {
    return <span class="file-num file-num-binary">binary</span>
  }
  if (
    e.added === undefined ||
    e.deleted === undefined ||
    !Number.isFinite(e.added) ||
    !Number.isFinite(e.deleted)
  ) {
    return null
  }
  return (
    <span class="file-num">
      <span class="file-num-add">+{e.added}</span>
      <span class="file-num-del"> −{e.deleted}</span>
    </span>
  )
}

export function WorkTreeFragment(
  props: WorkTreeSummary & { repoPath: string; previewStash: PreviewStashUi },
) {
  const { staged, unstaged, untracked, repoPath, previewStash } = props
  const total = staged.length + unstaged.length + untracked.length

  const showStashToggle =
    previewStash.hasLocalChanges || previewStash.previewStashPresent
  const stashBtn = showStashToggle ? (
    <button
      type="button"
      class="wt-stash-btn"
      title={previewStash.hasLocalChanges ? STASH_CMD : UNSH_CMD}
      aria-label={
        previewStash.hasLocalChanges
          ? `Hide local edits (${STASH_CMD}; untracked files that are not gitignored)`
          : `Restore hidden edits (${UNSH_CMD})`
      }
      hx-post="/api/worktree/stash-toggle"
      hx-target="#graph"
      hx-swap="outerHTML"
    >
      {previewStash.hasLocalChanges
        ? 'Hide local edits'
        : 'Restore hidden edits'}
    </button>
  ) : null

  if (total === 0) {
    return (
      <div
        id="worktree"
        class="worktree-panel worktree-clean-panel"
        data-repo={repoPath}
      >
        <span class="worktree-clean">no changes</span>
        {stashBtn ? <span class="wt-clean-stash-slot">{stashBtn}</span> : null}
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
        {stashBtn ? (
          <div class="wt-stash-bar">
            <span class="wt-stash-bar-label">compare</span>
            {stashBtn}
          </div>
        ) : null}
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
                data-kind={kind}
                data-path={e.path}
              >
                <span class={`wt-mark file-${e.mark[0] ?? '_'}`}>{e.mark}</span>
                <span class="wt-path">{e.path}</span>
                <WorkTreeNums entry={e} kind={kind} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
