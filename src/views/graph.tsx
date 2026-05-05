/** @jsxImportSource hono/jsx */
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

const FG: Record<number, string> = {
  30: '#808080',
  31: '#f48771',
  32: '#6a9955',
  33: '#dcdcaa',
  34: '#569cd6',
  35: '#c586c0',
  36: '#4ec9b0',
  37: '#d4d4d4',
  90: '#808080',
  91: '#f48771',
  92: '#89d185',
  93: '#e5e510',
  94: '#6796e6',
  95: '#d670d6',
  96: '#4ec9b0',
  97: '#ffffff',
}

function cssToObj(s: string): Record<string, string> | undefined {
  const o: Record<string, string> = {}
  for (const chunk of s.split(';')) {
    const idx = chunk.indexOf(':')
    if (idx === -1) continue
    const k = chunk.slice(0, idx).trim()
    const v = chunk.slice(idx + 1).trim()
    if (k) o[k] = v
  }
  return Object.keys(o).length ? o : undefined
}

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

function parseAnsi(s: string): { style?: Record<string, string>; text: string }[] {
  const out: { style?: Record<string, string>; text: string }[] = []
  let i = 0
  let bold = false
  let fg: number | undefined

  const styleObj = (): Record<string, string> | undefined => {
    const parts: string[] = []
    if (bold) parts.push('font-weight:700')
    if (fg !== undefined && FG[fg]) parts.push(`color:${FG[fg]}`)
    const css = parts.join(';')
    return cssToObj(css)
  }

  let buf = ''
  let curStyle = styleObj()

  const flush = () => {
    if (!buf) return
    out.push({ style: curStyle, text: buf })
    buf = ''
  }

  while (i < s.length) {
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const end = s.indexOf('m', i)
      if (end === -1) {
        buf += s.slice(i)
        break
      }
      const seq = s.slice(i + 2, end)
      i = end + 1
      flush()
      const codes =
        seq === ''
          ? [0]
          : seq
              .split(';')
              .map((x) => parseInt(x, 10))
              .filter((c) => !Number.isNaN(c))
      for (const c of codes) {
        if (c === 0) {
          bold = false
          fg = undefined
        } else if (c === 1) bold = true
        else if (c === 22) bold = false
        else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) fg = c
        else if (c === 39) fg = undefined
      }
      curStyle = styleObj()
      continue
    }
    buf += s[i]
    i++
  }
  flush()
  return out
}

function AnsiSpans(props: { ansi: string }) {
  return (
    <>
      {parseAnsi(props.ansi).map((p, idx) =>
        p.style ? (
          <span key={idx} style={p.style}>
            {p.text}
          </span>
        ) : (
          <span key={idx}>{p.text}</span>
        ),
      )}
    </>
  )
}

const LANE_PALETTE = [
  '#4ec9ff', // bright blue
  '#89d185', // bright green
  '#e98ee8', // bright magenta
  '#f5d76e', // warm yellow
  '#5fe6c8', // cyan
  '#ff9d7a', // orange
  '#c7b8ff', // lavender
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
      ch === '*' ? `color:${color};font-weight:700` : `color:${color}`
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

function GraphCommitLine(props: { row: GraphCommitRow }) {
  const { graphAnsi, hashAnsi, decorateRaw, subject } = props.row
  const sha = stripAnsi(hashAnsi).trim()
  const isHead = stripAnsi(decorateRaw).includes('HEAD ->')
  const checkoutUrl = `/api/checkout/commit?sha=${encodeURIComponent(sha)}`
  const diffUrl = `/api/diff/${encodeURIComponent(sha)}`

  return (
    <div class={`log-row ${isHead ? 'log-row-head' : ''}`}>
      <span class="graph-prefix">
        <GraphLaneSpans ansi={graphAnsi} />
      </span>
      <button
        type="button"
        class="sha-btn"
        title="checkout this commit (detached HEAD)"
        hx-post={checkoutUrl}
        hx-target="#graph"
        hx-swap="outerHTML"
      >
        <AnsiSpans ansi={hashAnsi} />
      </button>
      <button
        type="button"
        class="msg-btn"
        title="show diff"
        hx-get={diffUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        {subject}
      </button>
      <RefPills decorateRaw={decorateRaw} />
    </div>
  )
}

function GraphOtherLine(props: { ansi: string }) {
  return (
    <div class="log-row log-row-other">
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
          <GraphOtherLine key={i} ansi={r.ansi} />
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
