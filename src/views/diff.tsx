/** @jsxImportSource hono/jsx */
import type { CommitDetails } from '../git'

export type DiffPanelProps =
  | { state: 'empty' }
  | { state: 'loaded'; sha: string; details: CommitDetails }
  | { state: 'error'; sha: string; stderr: string }

function diffLineClass(line: string): string {
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'diff-meta-line'
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-del'
  return 'diff-ctx'
}

function DiffBody(props: { text: string }) {
  const lines = props.text.split('\n')
  return (
    <pre class="diff-body">
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
  const body =
    details.diff.trim().length > 0 ? (
      <DiffBody text={details.diff} />
    ) : (
      <pre class="diff-body">(no diff)</pre>
    )

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
      {body}
    </div>
  )
}
