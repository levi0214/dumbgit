/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import {
  stripAnsi,
  type GraphCommitRow,
  type GraphRow,
  type HeadInfo,
  type WorkTreeSummary,
} from '../git'
import { WorkTreeFragment } from './worktree'

export type GraphFragmentProps =
  | { ok: true; head: HeadInfo; rows: GraphRow[]; worktree: WorkTreeSummary }
  | { ok: false; stderr: string }

const COPY_ICO = raw(
  `<svg class="copy-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
)
/** Split `%d` / parentheses list on commas not inside nested parens. */
function splitDec(inner: string): string[] {
  const parts: string[] = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      const t = cur.trim()
      if (t) parts.push(t)
      cur = ''
      continue
    }
    cur += ch
  }
  const t = cur.trim()
  if (t) parts.push(t)
  return parts
}

function decorationRefs(decorateRaw: string): string[] {
  const plain = stripAnsi(decorateRaw).trim()
  if (!plain) return []
  const inner = plain.replace(/^\(/, '').replace(/\)$/, '').trim()
  if (!inner) return []
  return splitDec(inner)
}

/** Argument for `git switch <ref>` (branch, remote ref, tag name, …). */
function refForCheckout(tokenPlain: string): string | null {
  const s = tokenPlain.trim()
  const hm = s.match(/^HEAD\s*->\s*(.+)$/i)
  if (hm) return hm[1].trim()
  if (!s) return null
  if (/^tag:/i.test(s)) return s.replace(/^tag:\s*/i, '').trim() || null
  return s
}

function pillClass(tokenPlain: string): string {
  if (/HEAD\s*->/i.test(tokenPlain)) return 'ref-pill ref-pill-head'
  if (/^tag:/i.test(tokenPlain)) return 'ref-pill ref-pill-tag'
  if (tokenPlain.includes('/')) return 'ref-pill ref-pill-remote'
  return 'ref-pill ref-pill-branch'
}

const LANE_PALETTE = [
  '#3aafff', // vivid blue
  '#3ddc6c', // vivid green
  '#ff5cd5', // hot pink
  '#ffd633', // vivid yellow
  '#28e6c8', // vivid cyan
  '#ff7a3d', // vivid orange
  '#9d7aff', // vivid purple
]

/**
 * Color a single `git log --graph` lane char by its column.
 * git draws lane chars at even columns (`|`, `*`) and slants at odd columns
 * (`/`, `\`). Slants connect adjacent lanes; we color them with the OUTER
 * lane (the one farther from main lane 0), which is what your eye traces
 * when following a branch up or down.
 */
function laneOf(col: number): number {
  return col % 2 === 0 ? col / 2 : (col + 1) / 2
}

function laneColor(col: number): string {
  return LANE_PALETTE[laneOf(col) % LANE_PALETTE.length]
}

/** Render the `git --graph` prefix with per-column colored lanes. */
function GraphLaneSpans(props: { ansi: string }) {
  const text = stripAnsi(props.ansi)
  const out: JSX.Element[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ') {
      out.push(<span key={i}> </span>)
      continue
    }
    const color = laneColor(i)
    const styleStr =
      ch === '*'
        ? `color:${color};font-weight:800`
        : `color:${color};font-weight:700`
    out.push(
      <span key={i} style={styleStr}>
        {ch}
      </span>,
    )
  }
  return <>{out}</>
}

function RefPills(props: { decorateRaw: string }) {
  const tokens = decorationRefs(props.decorateRaw)
  if (tokens.length === 0) return null
  return (
    <span class="graph-pills">
      {tokens.map((t, idx) => {
        const ref = refForCheckout(t)
        if (!ref) return null
        return (
          <button
            key={idx}
            type="button"
            class={pillClass(t)}
            title={`git switch ${ref}`}
            hx-post={`/api/checkout/branch?name=${encodeURIComponent(ref)}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            {t}
          </button>
        )
      })}
    </span>
  )
}

/** Compact relative time like `3m`, `2h`, `yesterday`, `2w`, `4mo`, `1y`. */
function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 14) return `${day}d`
  if (day < 60) return `${Math.floor(day / 7)}w`
  if (day < 365) return `${Math.floor(day / 30)}mo`
  return `${Math.floor(day / 365)}y`
}

function GraphCommitLine(props: { row: GraphCommitRow }) {
  const { graphAnsi, shaFull, shaShort, decorateRaw, subject, date, inHistory } =
    props.row
  const isHead = stripAnsi(decorateRaw).includes('HEAD ->')
  const diffUrl = `/api/commit/${encodeURIComponent(shaFull)}`
  const cls = [
    'log-row',
    'log-row-commit',
    isHead ? 'log-row-head' : '',
    inHistory ? '' : 'log-row-dim',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div class={cls} data-sha={shaFull}>
      <span class="graph-prefix">
        <GraphLaneSpans ansi={graphAnsi} />
      </span>
      <div class="msg-cell">
        <button
          type="button"
          class="msg-btn"
          title="show changed files"
          hx-get={diffUrl}
          hx-target="#diff"
          hx-swap="outerHTML"
        >
          {subject}
        </button>
        <span class="msg-tail">
          <span class="msg-tail-sep"> · </span>
          <code class="hash-peek" title={shaFull}>
            {shaShort}
          </code>
          <button
            type="button"
            class="copy-sha-btn"
            data-sha={shaFull}
            title="copy full hash"
          >
            {COPY_ICO}
          </button>
        </span>
      </div>
      <RefPills decorateRaw={decorateRaw} />
      <span class="row-time" title={date}>
        {relTime(date)}
      </span>
    </div>
  )
}

function GraphOtherLine(props: { ansi: string; betweenInHistory: boolean }) {
  const cls = `log-row log-row-other ${props.betweenInHistory ? '' : 'log-row-dim'}`
  return (
    <div class={cls.trim()}>
      <span class="graph-prefix-wide">
        <GraphLaneSpans ansi={props.ansi} />
      </span>
    </div>
  )
}

function headLine(head: HeadInfo): string {
  const short = head.sha.slice(0, 7)
  if (head.kind === 'branch') {
    return `HEAD @ ${head.name} · ${short}`
  }
  return `HEAD detached @ ${short}`
}

function LogLines(props: { rows: GraphRow[] }) {
  if (props.rows.length === 0) {
    return <div class="log-lines empty">(no commits yet)</div>
  }

  return (
    <div class="log-lines">
      {props.rows.map((r, i) =>
        r.kind === 'commit' ? (
          <GraphCommitLine key={i} row={r.row} />
        ) : (
          <GraphOtherLine
            key={i}
            ansi={r.ansi}
            betweenInHistory={r.betweenInHistory}
          />
        ),
      )}
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

  const { head, rows, worktree } = props

  return (
    <div id="graph" class="graph-root">
      <div class="graph-head">{headLine(head)}</div>
      <WorkTreeFragment {...worktree} />
      <div class="graph-body">
        <LogLines rows={rows} />
      </div>
    </div>
  )
}
