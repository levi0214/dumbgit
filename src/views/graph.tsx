import type { HeadInfo } from '../git'

export type GraphFragmentProps =
  | { ok: true; head: HeadInfo; branches: Branch[]; log: string }
  | { ok: false; stderr: string }

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function headLine(head: HeadInfo): string {
  const short = head.sha.slice(0, 7)
  if (head.kind === 'branch') {
    return `HEAD @ ${head.name} · ${short}`
  }
  return `HEAD detached @ ${short}`
}

export function GraphFragment(props: GraphFragmentProps) {
  if (!props.ok) {
    return (
      <div id="graph" class="graph-root graph-error">
        <p class="msg">{escapeHtml(props.stderr)}</p>
      </div>
    )
  }

  const { head, branches, log } = props
  const logEmpty = !log.trim()

  return (
    <div id="graph" class="graph-root">
      <div class="graph-head">{escapeHtml(headLine(head))}</div>
      <div class="graph-body">
        <aside>
          <ul class="branch-list">
            {branches.map((b) => (
              <li class={b.isCurrent ? 'current' : ''}>
                <span class="branch-name">{escapeHtml(b.name)}</span>
                <span class="branch-sha">{escapeHtml(b.sha.slice(0, 7))}</span>
              </li>
            ))}
          </ul>
        </aside>
        <pre class={logEmpty ? 'log-lines empty' : 'log-lines'}>
          {logEmpty ? '(no commits yet)' : escapeHtml(log)}
        </pre>
      </div>
    </div>
  )
}
