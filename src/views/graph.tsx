/** @jsxImportSource hono/jsx */
import type { Branch, HeadInfo, WorkTreeSummary } from '../git'
import { WorkTreeFragment } from './worktree'

export type GraphFragmentProps =
  | { ok: true; head: HeadInfo; branches: Branch[]; log: string; worktree: WorkTreeSummary }
  | { ok: false; stderr: string }

function headLine(head: HeadInfo): string {
  const short = head.sha.slice(0, 7)
  if (head.kind === 'branch') {
    return `HEAD @ ${head.name} · ${short}`
  }
  return `HEAD detached @ ${short}`
}

/** First plausible abbreviated/full commit hash on a `git log --oneline --graph` line. */
function splitCommitLine(
  line: string,
): { before: string; sha: string; after: string } | null {
  const re = /\b([a-f0-9]{7,40})\b/i
  const m = line.match(re)
  if (!m || m.index === undefined) return null
  const sha = m[1]
  const before = line.slice(0, m.index)
  const after = line.slice(m.index + sha.length)
  return { before, sha, after }
}

function GraphLogLine(props: { line: string }) {
  const parts = splitCommitLine(props.line)
  if (!parts) return <>{props.line}</>

  const checkoutUrl = `/api/checkout/commit?sha=${encodeURIComponent(parts.sha)}`
  const diffUrl = `/api/diff/${encodeURIComponent(parts.sha)}`
  return (
    <>
      {parts.before}
      <button
        type="button"
        class="sha-btn"
        title="checkout this commit (detached HEAD)"
        hx-post={checkoutUrl}
        hx-target="#graph"
        hx-swap="outerHTML"
      >
        {parts.sha}
      </button>
      <button
        type="button"
        class="msg-btn"
        title="show diff"
        hx-get={diffUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        {parts.after}
      </button>
    </>
  )
}

function LogLines(props: { log: string }) {
  const { log } = props
  if (!log.trim()) {
    return <div class="log-lines empty">(no commits yet)</div>
  }

  const lines = log.split('\n')
  return (
    <div class="log-lines">
      {lines.map((line) => (
        <span class="log-line">
          <GraphLogLine line={line} />
        </span>
      ))}
    </div>
  )
}

export function GraphFragment(props: GraphFragmentProps) {
  if (!props.ok) {
    return (
      <div id="graph" class="graph-root graph-error">
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, branches, log, worktree } = props

  return (
    <div id="graph" class="graph-root">
      <div class="graph-head">{headLine(head)}</div>
      <WorkTreeFragment {...worktree} />
      <div class="graph-body">
        <aside>
          <ul class="branch-list">
            {branches.map((b) => (
              <li class={b.isCurrent ? 'current' : ''}>
                <button
                  type="button"
                  class="branch-row-btn"
                  hx-post={`/api/checkout/branch?name=${encodeURIComponent(b.name)}`}
                  hx-target="#graph"
                  hx-swap="outerHTML"
                >
                  <span class="branch-name">{b.name}</span>
                  <span class="branch-sha">{b.sha.slice(0, 7)}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <LogLines log={log} />
      </div>
    </div>
  )
}
