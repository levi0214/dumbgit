/** @jsxImportSource hono/jsx */
import type { CommitDetails } from '../git'

export type DiffPanelProps =
  | { state: 'empty' }
  | { state: 'loaded'; sha: string; details: CommitDetails }
  | { state: 'error'; sha: string; stderr: string }

export function DiffPanel(props: DiffPanelProps) {
  if (props.state === 'empty') {
    return (
      <div id="diff" class="diff-panel diff-empty">
        (select a commit message to see its diff)
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

  const { sha, details } = props
  return (
    <div id="diff" class="diff-panel">
      <div class="diff-head">
        <div class="diff-subject">{details.subject}</div>
        <div class="diff-meta">
          {sha.slice(0, 7)} · {details.author} · {details.date}
        </div>
      </div>
      {details.files.length > 0 && (
        <ul class="diff-files">
          {details.files.map((f) => (
            <li>
              <span class={`file-status file-${f.status[0] ?? '_'}`}>
                {f.status}
              </span>
              <span class="file-path">{f.path}</span>
            </li>
          ))}
        </ul>
      )}
      <pre class="diff-body">{details.diff || '(no diff)'}</pre>
    </div>
  )
}
