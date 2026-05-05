/** @jsxImportSource hono/jsx */
import type { CommitFile, CommitSummary } from '../git'

export type DiffPanelProps =
  | { state: 'empty'; swapOob?: boolean }
  | { state: 'summary'; sha: string; summary: CommitSummary }
  | { state: 'error'; sha: string; stderr: string }

function diffLineClass(line: string): string {
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'diff-meta-line'
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-del'
  return 'diff-ctx'
}

function FileNums(props: { file: CommitFile }) {
  const { file: f } = props
  if (f.binary) {
    return <span class="file-num file-num-binary">binary</span>
  }
  if (
    f.added === undefined ||
    f.deleted === undefined ||
    !Number.isFinite(f.added) ||
    !Number.isFinite(f.deleted)
  ) {
    return null
  }
  return (
    <span class="file-num">
      <span class="file-num-add">+{f.added}</span>
      <span class="file-num-del"> −{f.deleted}</span>
    </span>
  )
}

/** Unified diff appended under the file list (lazy-loaded). */
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
    const oob = props.swapOob ? ({ 'hx-swap-oob': 'true' } as const) : {}
    return (
      <div id="diff" class="diff-panel diff-empty" {...oob}>
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
  const branchUrl = `/api/branch/create?sha=${encodeURIComponent(sha)}`
  const patchUrl = `/api/diff/${encodeURIComponent(sha)}/patch`

  return (
    <div id="diff" class="diff-panel diff-summary">
      <input type="hidden" id="viewing-sha" value={sha} autocomplete="off" />
      <div class="diff-head">
        <div class="diff-subject">{summary.subject}</div>
        <div class="diff-meta">
          {sha.slice(0, 7)} · {summary.author} · {summary.date}
        </div>
        <div class="diff-actions">
          <details class="diff-branch-details">
            <summary class="diff-branch-summary">new branch</summary>
            <div class="diff-branch-panel">
              <form
                class="diff-branch-form"
                hx-post={branchUrl}
                hx-target="#graph"
                hx-swap="outerHTML"
              >
                <input
                  type="text"
                  name="name"
                  class="diff-branch-input"
                  placeholder="branch name"
                  autocomplete="off"
                  spellcheck={false}
                  aria-label="New branch name"
                  title={`git branch … ${sha.slice(0, 7)}`}
                  required
                />
                <div class="diff-branch-panel-actions">
                  <button type="submit" class="diff-branch-btn">
                    create
                  </button>
                  <button type="button" class="diff-branch-cancel diff-checkout-btn">
                    cancel
                  </button>
                </div>
              </form>
            </div>
          </details>
          <button
            type="button"
            class="diff-checkout-btn"
            title="git switch --detach to this commit"
            hx-post={checkoutUrl}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            checkout
          </button>
        </div>
      </div>

      <div
        id="diff-files-trigger"
        class="diff-files-block"
        tabindex={0}
        role="button"
        title="Load unified diff below"
        hx-get={patchUrl}
        hx-target="#diff-patch-slot"
        hx-swap="innerHTML"
      >
        <div class="diff-files-head">
          changed files{' '}
          <span class="diff-files-count">({summary.files.length})</span>
          <span class="diff-files-hint"> — click to show patch</span>
        </div>
        {summary.files.length > 0 ? (
          <ul class="diff-files">
            {summary.files.map((f) => (
              <li>
                <span class={`file-status file-${f.status[0] ?? '_'}`}>
                  {f.status}
                </span>
                <span class="file-path">{f.path}</span>
                <FileNums file={f} />
              </li>
            ))}
          </ul>
        ) : (
          <div class="diff-files-empty">(no file changes)</div>
        )}
      </div>

      <div id="diff-patch-slot" class="diff-patch-slot"></div>
    </div>
  )
}
