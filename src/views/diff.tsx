/** @jsxImportSource hono/jsx */
import type { CommitSummary } from '../git'

export type DiffPanelProps =
  | { state: 'empty' }
  | { state: 'summary'; sha: string; summary: CommitSummary }
  | { state: 'error'; sha: string; stderr: string }

function diffLineClass(line: string): string {
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'diff-meta-line'
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-del'
  return 'diff-ctx'
}

/** Lazy-loaded unified diff (htmx swaps into `#diff-patch-slot`). */
export function DiffPatchBody(props: { text: string }) {
  const lines = props.text.split('\n')
  return (
    <pre class="diff-body diff-patch-pre">
      {lines.map((line, i) => (
        <span key={i} class={diffLineClass(line)}>
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}

export function DiffPanel(props: DiffPanelProps) {
  if (props.state === 'empty') {
    return (
      <div id="diff" class="diff-panel diff-empty">
        (click a commit message to see changed files)
      </div>
    )
  }

  if (props.state === 'error') {
    return (
      <div id="diff" class="diff-panel diff-error">
        <div class="diff-head">
          <div class="diff-subject">{props.sha.slice(0, 7)}</div>
        </div>
        <pre class="diff-body">{props.stderr}</pre>
      </div>
    )
  }

  const { sha, summary } = props
  const checkoutUrl = `/api/checkout/commit?sha=${encodeURIComponent(sha)}`
  const patchUrl = `/api/diff/${encodeURIComponent(sha)}/patch`

  return (
    <div id="diff" class="diff-panel diff-summary">
      <div class="diff-head">
        <div class="diff-subject">{summary.subject}</div>
        <div class="diff-meta">
          {sha.slice(0, 7)} · {summary.author} · {summary.date}
        </div>
        <div class="diff-actions">
          <button
            type="button"
            class="diff-checkout-btn"
            title="git switch --detach to this commit (HEAD will detach)"
            hx-post={checkoutUrl}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            ↗ checkout (detached)
          </button>
        </div>
      </div>
      <div class="diff-files-head">
        changed files{' '}
        <span class="diff-files-count">({summary.files.length})</span>
      </div>
      {summary.files.length > 0 ? (
        <ul class="diff-files">
          {summary.files.map((f) => (
            <li>
              <span class={`file-status file-${f.status[0] ?? '_'}`}>
                {f.status}
              </span>
              <span class="file-path">{f.path}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div class="diff-files-empty">(no file changes)</div>
      )}
      <div id="diff-patch-slot" class="diff-patch-slot">
        <button
          type="button"
          class="diff-show-patch-btn"
          title="Load full unified diff from git"
          hx-get={patchUrl}
          hx-target="#diff-patch-slot"
          hx-swap="innerHTML"
        >
          ▾ unified diff…
        </button>
      </div>
    </div>
  )
}
