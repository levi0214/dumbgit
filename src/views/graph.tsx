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
  | {
      ok: true
      head: HeadInfo
      rows: GraphRow[]
      worktree: WorkTreeSummary
      swapOob?: boolean
    }
  | { ok: false; stderr: string; swapOob?: boolean }

const COPY_ICO = raw(
  `<svg class="copy-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
)
const TAG_ICO = raw(
  `<svg class="tag-ico" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
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

/** Local-ish branch label to show before the subject (avoids duplicating HEAD / same-name pills). */
function branchPrefixFromDecorations(decorateRaw: string): string | null {
  const tokens = decorationRefs(decorateRaw)
  for (const t of tokens) {
    const plain = stripAnsi(t).trim()
    const hm = plain.match(/^HEAD\s*->\s*(.+)$/i)
    if (hm) {
      const name = hm[1]?.trim()
      if (name) return name
    }
  }
  for (const t of tokens) {
    const plain = stripAnsi(t).trim()
    if (/^tag:/i.test(plain)) continue
    if (/^HEAD$/i.test(plain)) continue
    if (!plain.includes('/') && plain) return plain
  }
  for (const t of tokens) {
    const plain = stripAnsi(t).trim()
    if (/^tag:/i.test(plain)) continue
    if (/^HEAD$/i.test(plain)) continue
    if (plain.includes('/') && plain) return plain
  }
  return null
}

function refPillRedundantWithBranchPrefix(
  tokenPlain: string,
  branchPrefix: string | null,
): boolean {
  if (!branchPrefix) return false
  const p = stripAnsi(tokenPlain).trim()
  const hm = p.match(/^HEAD\s*->\s*(.+)$/i)
  if (hm && hm[1]?.trim() === branchPrefix) return true
  return p === branchPrefix
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

function isTagToken(plain: string): boolean {
  return /^tag:/i.test(plain)
}

function tagName(plain: string): string {
  return plain.replace(/^tag:\s*/i, '').trim()
}

function isOriginHeadToken(plain: string): boolean {
  // matches "origin/HEAD" (decorate=short) or "origin/HEAD -> origin/main" (decorate=full)
  return /^origin\/HEAD(\s*->.*)?$/i.test(plain)
}

/**
 * Names of "local" branches present on this commit: any non-tag, non-remote
 * (no slash) ref token, plus the prefix branch we render before the subject.
 */
function localNamesOnRow(
  tokens: string[],
  branchPrefix: string | null,
): Set<string> {
  const set = new Set<string>()
  if (branchPrefix && !branchPrefix.includes('/')) set.add(branchPrefix)
  for (const t of tokens) {
    const p = stripAnsi(t).trim()
    const hm = p.match(/^HEAD\s*->\s*(.+)$/i)
    const name = hm ? hm[1].trim() : p
    if (!name) continue
    if (isTagToken(name)) continue
    if (/^HEAD$/i.test(name)) continue
    if (!name.includes('/')) set.add(name)
  }
  return set
}

/** `origin/<x>` is redundant if `<x>` is already shown as a local branch on the same row. */
function isRemoteShadowingLocal(plain: string, locals: Set<string>): boolean {
  const m = plain.match(/^origin\/(.+)$/i)
  if (!m) return false
  return locals.has(m[1])
}

function pillClass(tokenPlain: string): string {
  if (/HEAD\s*->/i.test(tokenPlain)) return 'ref-pill ref-pill-head'
  if (isTagToken(tokenPlain)) return 'ref-tag'
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

/**
 * Render the `git --graph` prefix with per-column colored lanes.
 * Git uses `*` for the commit node; we swap it for a round bullet so the
 * graph reads quieter than a bold asterisk. Connector glyphs stay dimmed.
 */
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
    if (ch === '*') {
      out.push(
        <span key={i} class="graph-node" style={`color:${color}`}>
          {'\u2022'}
        </span>,
      )
      continue
    }
    const styleStr = `color:${color};font-weight:600;opacity:0.45`
    out.push(
      <span key={i} style={styleStr}>
        {ch}
      </span>,
    )
  }
  return <>{out}</>
}

/** Order pills as: local branch > remote branch > tag. */
function pillSortKey(plain: string): number {
  if (/HEAD\s*->/i.test(plain)) return -1
  if (/^HEAD$/i.test(plain)) return 4
  if (isTagToken(plain)) return 2
  if (plain.includes('/')) return 1
  return 0
}

function RefPills(props: {
  decorateRaw: string
  branchPrefix: string | null
}) {
  const tokens = decorationRefs(props.decorateRaw)
  if (tokens.length === 0) return null
  const locals = localNamesOnRow(tokens, props.branchPrefix)
  const sorted = [...tokens].sort(
    (a, b) => pillSortKey(stripAnsi(a).trim()) - pillSortKey(stripAnsi(b).trim()),
  )
  return (
    <span class="graph-pills">
      {sorted.map((t, idx) => {
        const plain = stripAnsi(t).trim()
        if (/^HEAD$/i.test(plain)) return null
        if (isOriginHeadToken(plain)) return null
        if (refPillRedundantWithBranchPrefix(t, props.branchPrefix)) return null
        if (isRemoteShadowingLocal(plain, locals)) return null
        const ref = refForCheckout(t)
        if (!ref) return null
        if (isTagToken(plain)) {
          const name = tagName(plain)
          return (
            <button
              key={idx}
              type="button"
              class="ref-tag"
              title={`tag ${name} — git switch ${name}`}
              hx-post={`/api/checkout/branch?name=${encodeURIComponent(ref)}`}
              hx-target="#graph"
              hx-swap="outerHTML"
            >
              {TAG_ICO}
              <span class="ref-tag-name">{name}</span>
            </button>
          )
        }
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
            {plain}
          </button>
        )
      })}
    </span>
  )
}

/** Relative time with trailing “ago” where English allows it. */
function relTimeAgo(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, Date.now() - t)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 14) return `${day}d ago`
  if (day < 60) return `${Math.floor(day / 7)}w ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

function GraphCommitLine(props: {
  row: GraphCommitRow
  detached: boolean
}) {
  const { graphAnsi, shaFull, shaShort, decorateRaw, subject, date, inHistory } =
    props.row
  const decoPlain = stripAnsi(decorateRaw)
  const isHead =
    decoPlain.includes('HEAD ->') || /(^|[(,\s])HEAD([),\s]|$)/.test(decoPlain)
  const branchPrefix = branchPrefixFromDecorations(decorateRaw)
  const diffUrl = `/api/commit/${encodeURIComponent(shaFull)}`
  const cls = [
    'log-row',
    'log-row-commit',
    isHead ? 'log-row-head' : '',
    isHead && props.detached ? 'log-row-detached' : '',
    inHistory ? '' : 'log-row-dim',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div class={cls} data-sha={shaFull}>
      <span class="graph-prefix">
        <GraphLaneSpans ansi={graphAnsi} />
      </span>
      {isHead ? (
        <span
          class="row-current-dot"
          aria-hidden="true"
          title={props.detached ? 'viewing past commit' : 'current'}
        >
          ●
        </span>
      ) : null}
      {branchPrefix ? (
        <span
          class="branch-prefix"
          title={`branch: ${branchPrefix} — double-click to switch`}
          hx-post={`/api/checkout/branch?name=${encodeURIComponent(branchPrefix)}`}
          hx-target="#graph"
          hx-swap="outerHTML"
          hx-trigger="dblclick"
        >
          {branchPrefix}
        </span>
      ) : null}
      <RefPills decorateRaw={decorateRaw} branchPrefix={branchPrefix} />
      <button
        type="button"
        class="msg-btn"
        title={subject}
        hx-get={diffUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        {subject}
      </button>
      <span class="row-end">
        <span class="msg-age" title={date}>
          {relTimeAgo(date)}
        </span>
        <span class="row-tail">
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

function HeadLine(props: { head: HeadInfo }) {
  const short = props.head.sha.slice(0, 7)
  const onBranch = props.head.kind === 'branch'
  const prefix = onBranch ? 'On branch:' : 'Detached at:'
  const label = onBranch ? props.head.name : short
  const tip = onBranch ? `at ${short}` : `detached at ${short}`
  return (
    <>
      <span class="head-prep">{prefix}</span>
      <span class="head-label" title={tip}>
        {label}
      </span>
    </>
  )
}

function LogLines(props: { rows: GraphRow[]; detached: boolean }) {
  if (props.rows.length === 0) {
    return <div class="log-lines empty">(no commits yet)</div>
  }

  return (
    <div class="log-lines">
      {props.rows.map((r, i) =>
        r.kind === 'commit' ? (
          <GraphCommitLine key={i} row={r.row} detached={props.detached} />
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
  const oob = props.swapOob ? ({ 'hx-swap-oob': 'true' } as const) : {}
  if (!props.ok) {
    return (
      <div id="graph" class="graph-root graph-error" {...oob}>
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, rows, worktree } = props
  const detached = head.kind === 'detached'

  return (
    <div id="graph" class="graph-root" {...oob}>
      <div class={`graph-head${detached ? ' graph-head-detached' : ''}`}>
        <HeadLine head={head} />
        {head.kind === 'detached' && head.previousBranch ? (
          <button
            type="button"
            class="head-back-btn"
            title={`git switch ${head.previousBranch}`}
            hx-post={`/api/checkout/branch?name=${encodeURIComponent(head.previousBranch)}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            ← back to {head.previousBranch}
          </button>
        ) : null}
        <button
          type="button"
          id="push-btn"
          class="head-push-btn"
          title={
            head.kind === 'branch'
              ? 'git push'
              : 'detached HEAD has no upstream — switch to a branch first'
          }
          disabled={head.kind !== 'branch'}
          hx-post="/api/push"
          hx-swap="none"
        >
          ↑ push
        </button>
      </div>
      <WorkTreeFragment {...worktree} />
      <div class="graph-body">
        <LogLines rows={rows} detached={detached} />
      </div>
    </div>
  )
}
