/** @jsxImportSource hono/jsx */
import path from 'node:path'
import { raw } from 'hono/html'
import {
  stripAnsi,
  type GraphCommitRow,
  type GraphRow,
  type HeadInfo,
  type PreviewStashEntry,
  type PreviewStashUi,
  type WorkTreeSummary,
} from '../git'
import { decorationTokens, type DecorationToken } from '../decorations'
import { WorkTreeFragment } from './worktree'

export type GraphFragmentProps =
  | {
      ok: true
      head: HeadInfo
      rows: GraphRow[]
      worktree: WorkTreeSummary
      previewStash: PreviewStashUi
      /** Absolute repo root; tags #graph for client/server identity checks. */
      repoPath: string
      /** Process id at render time; detects server restarts on the same port. */
      serverPid: number
      /** Current `git log -n` window size (shown commits cap). */
      graphCommitLimit: number
      /** Next limit for “load more” (`min(limit + step, max)`). */
      graphNextLimit: number
      showLoadMore: boolean
      swapOob?: boolean
    }
  | {
      ok: false
      stderr: string
      repoPath: string
      serverPid: number
      swapOob?: boolean
    }

const COPY_ICO = raw(
  `<svg class="copy-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
)
const CHECK_ICO = raw(
  `<svg class="check-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
)
function CopyBtn(props: { dataCopy?: string; title?: string }) {
  return (
    <button
      type="button"
      class="copy-btn"
      data-copy={props.dataCopy}
      title={props.title ?? 'copy'}
    >
      {COPY_ICO}
      {CHECK_ICO}
    </button>
  )
}
const TAG_ICO = raw(
  `<svg class="tag-ico" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
)
/** Local-ish branch label to show before the subject (avoids duplicating HEAD / same-name pills). */
function branchPrefixFromTokens(tokens: DecorationToken[]): string | null {
  for (const t of tokens) {
    if (t.head && t.name) return t.name
  }
  for (const t of tokens) {
    if (t.kind === 'local') return t.name
  }
  for (const t of tokens) {
    if (t.kind === 'remote') return t.name
  }
  return null
}

function refPillRedundantWithBranchPrefix(
  token: DecorationToken,
  branchPrefix: string | null,
): boolean {
  if (!branchPrefix) return false
  return token.name === branchPrefix
}

/** Argument for `git switch <ref>` (branch, remote ref, tag name, …). */
function refForCheckout(token: DecorationToken): string | null {
  if (token.kind === 'head') return null
  return token.name || null
}

function isTagToken(token: DecorationToken): boolean {
  return token.kind === 'tag'
}

function isRemoteHeadToken(token: DecorationToken): boolean {
  return token.kind === 'remote' && remoteBranchName(token) === 'HEAD'
}

function remoteName(token: DecorationToken): string | null {
  if (token.kind !== 'remote') return null
  const slash = token.name.indexOf('/')
  return slash > 0 ? token.name.slice(0, slash) : null
}

function remoteBranchName(token: DecorationToken): string | null {
  if (token.kind !== 'remote') return null
  const slash = token.name.indexOf('/')
  return slash > 0 ? token.name.slice(slash + 1) : null
}

/**
 * Names of local branches on this commit (including `fix/foo` topic branches).
 */
function localNamesOnRow(
  tokens: DecorationToken[],
  branchPrefix: string | null,
): Set<string> {
  const set = new Set<string>()
  if (branchPrefix) {
    const branchPrefixToken = tokens.find((t) => t.name === branchPrefix)
    if (!branchPrefixToken || branchPrefixToken.kind === 'local') set.add(branchPrefix)
  }
  for (const t of tokens) {
    if (t.kind === 'local') set.add(t.name)
  }
  return set
}

/** `<remote>/<x>` is redundant if `<x>` is already shown as a local branch on the same row. */
function isRemoteShadowingLocal(
  token: DecorationToken,
  locals: Set<string>,
): boolean {
  const branch = remoteBranchName(token)
  return !!branch && locals.has(branch)
}

function remotePeer(tokens: DecorationToken[], branch: string | null): string | null {
  if (!branch) return null
  for (const t of tokens) {
    if (remoteBranchName(t) === branch) return remoteName(t)
  }
  return null
}

function pillClass(token: DecorationToken): string {
  if (token.head) return 'ref-pill ref-pill-head'
  if (token.kind === 'remote') return 'ref-pill ref-pill-remote'
  return 'ref-pill ref-pill-branch'
}

/** Distinct tag names on this commit. */
function collectTagNames(tokens: DecorationToken[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tokens) {
    if (!isTagToken(t)) continue
    const n = t.name
    if (n && !seen.has(n)) {
      seen.add(n)
      out.push(n)
    }
  }
  return out
}

function graphCommitIsHead(decorateRaw: string): boolean {
  const decoPlain = stripAnsi(decorateRaw)
  return (
    decoPlain.includes('HEAD ->') ||
    /(^|[(,\s])HEAD([),\s]|$)/.test(decoPlain)
  )
}

function graphText(row: GraphRow): string {
  return stripAnsi(row.kind === 'commit' ? row.row.graphAnsi : row.ansi)
}

function graphChar(text: string, col: number): string {
  return col >= 0 && col < text.length ? (text[col] ?? ' ') : ' '
}

function isGraphChar(ch: string): boolean {
  return ch !== '' && ch !== ' '
}

function addIfGraph(set: Set<number>, text: string, col: number): void {
  if (isGraphChar(graphChar(text, col))) set.add(col)
}

function isVerticalGraphChar(ch: string): boolean {
  return ch === '|' || ch === '*'
}

/**
 * How a row is rendered:
 * - 'commit': a commit row (dot + pass-through lanes).
 * - 'curve':  a lone connector row, collapsed to zero height; its lane
 *             transitions are drawn as full-height curves from the center of
 *             the commit row above to the center of the commit row below.
 * - 'tall':   a connector row inside a run of consecutive connectors; keeps
 *             its own height so stacked transitions don't overdraw.
 */
export type GraphRowKind = 'commit' | 'curve' | 'tall'

export type GraphNeighbor = { kind: GraphRowKind; text: string }

export type GraphRowMeta = {
  kind: GraphRowKind
  above: GraphNeighbor | null
  below: GraphNeighbor | null
}

const LONE_COMMIT_META: GraphRowMeta = {
  kind: 'commit',
  above: null,
  below: null,
}

export function graphRowMeta(rows: GraphRow[]): GraphRowMeta[] {
  const texts = rows.map(graphText)
  const kinds: GraphRowKind[] = rows.map((r, i) => {
    if (r.kind === 'commit') return 'commit'
    const inRun =
      rows[i - 1]?.kind === 'other' || rows[i + 1]?.kind === 'other'
    return inRun ? 'tall' : 'curve'
  })
  return rows.map((_, i) => ({
    kind: kinds[i]!,
    above: i > 0 ? { kind: kinds[i - 1]!, text: texts[i - 1]! } : null,
    below:
      i < rows.length - 1
        ? { kind: kinds[i + 1]!, text: texts[i + 1]! }
        : null,
  }))
}

/*
 * Diagonal glyph geometry: `/` at column c runs from its top at column c+1
 * down to column c-1; `\` at column c runs from its top at column c-1 down
 * to column c+1.
 */

/** Does a stroke in `text` touch the row's TOP edge at `col`? */
function touchesTopVertically(text: string, col: number): boolean {
  return isVerticalGraphChar(graphChar(text, col))
}

function touchesTopDiagonally(text: string, col: number): boolean {
  return (
    graphChar(text, col - 1) === '/' || graphChar(text, col + 1) === '\\'
  )
}

/** Does a stroke in `text` touch the row's BOTTOM edge at `col`? */
function touchesBottomVertically(text: string, col: number): boolean {
  return isVerticalGraphChar(graphChar(text, col))
}

function touchesBottomDiagonally(text: string, col: number): boolean {
  return (
    graphChar(text, col + 1) === '/' || graphChar(text, col - 1) === '\\'
  )
}

/**
 * Should a commit row draw a straight stub from its dot toward the row above?
 * Diagonal arrivals from a 'curve' connector are excluded: the connector
 * already draws that link all the way to the dot's center.
 */
function dotStubAbove(above: GraphNeighbor | null, col: number): boolean {
  if (!above) return false
  if (touchesBottomVertically(above.text, col)) return true
  if (above.kind === 'curve') return false
  return touchesBottomDiagonally(above.text, col)
}

function dotStubBelow(below: GraphNeighbor | null, col: number): boolean {
  if (!below) return false
  if (touchesTopVertically(below.text, col)) return true
  if (below.kind === 'curve') return false
  return touchesTopDiagonally(below.text, col)
}

/** Lane departs/arrives only via a curve-connector diagonal (no straight continuation). */
function laneBendsBelow(below: GraphNeighbor | null, col: number): boolean {
  return (
    below?.kind === 'curve' &&
    !touchesTopVertically(below.text, col) &&
    touchesTopDiagonally(below.text, col)
  )
}

function laneBendsAbove(above: GraphNeighbor | null, col: number): boolean {
  return (
    above?.kind === 'curve' &&
    !touchesBottomVertically(above.text, col) &&
    touchesBottomDiagonally(above.text, col)
  )
}

/**
 * Bright graph cells flow from reachable commits toward their parents.
 * We never flow upward, so an unmerged side branch that shares an old base
 * stays dim while the current main lane beside it remains bright.
 */
export function graphBrightCols(rows: GraphRow[]): Array<Set<number> | null> {
  const texts = rows.map(graphText)
  const out = rows.map(() => new Set<number>())

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row.kind === 'commit' && row.row.inHistory) {
      const col = stripAnsi(row.row.graphAnsi).indexOf('*')
      if (col !== -1) out[i]!.add(col)
    }
  }

  for (let y = 0; y < rows.length - 1; y++) {
    const here = texts[y] ?? ''
    const next = texts[y + 1] ?? ''
    for (const x of out[y]!) {
      const ch = graphChar(here, x)
      if (ch === '/') {
        addIfGraph(out[y + 1]!, next, x - 1)
        continue
      }
      if (ch === '\\') {
        addIfGraph(out[y + 1]!, next, x + 1)
        continue
      }

      addIfGraph(out[y + 1]!, next, x)
      if (graphChar(next, x - 1) === '/') out[y + 1]!.add(x - 1)
      if (graphChar(next, x + 1) === '\\') out[y + 1]!.add(x + 1)
    }
  }

  return out.map((cols) => (cols.size === 0 ? null : cols))
}

const GRAPH_COL_WIDTH = 10
const GRAPH_ROW_HEIGHT = 16
const GRAPH_CONNECTOR_HEIGHT = GRAPH_ROW_HEIGHT
const GRAPH_NODE_RADIUS = 3.2
const GRAPH_LINE_OVERLAP = 4
/**
 * Half the rendered height of a log row: 16px lane SVG + 3px top/bottom
 * padding (see `.log-row` CSS) = 22px total. Curve connectors span from the
 * center of the commit row above to the center of the commit row below.
 */
const GRAPH_HALF_LOG_ROW = 11

function graphColX(col: number): number {
  return col * GRAPH_COL_WIDTH + GRAPH_COL_WIDTH / 2
}

function graphLaneColor(onSpine: boolean): string {
  return onSpine ? 'var(--accent)' : 'var(--graph-rail-dim)'
}

function graphNodeColor(onSpine: boolean): string {
  return onSpine ? 'var(--accent)' : 'var(--graph-node-dim)'
}

/**
 * Fixed gutter width (in text columns) so every row's pills and message
 * start at the same x, like dedicated graph UIs. Trailing whitespace is
 * ignored — git pads merge rows (`| *   `) to make room for the connector
 * below, which would otherwise indent just those rows.
 */
export function graphGutterCols(rows: GraphRow[]): number {
  let max = 1
  for (const r of rows) {
    const len = graphText(r).replace(/\s+$/, '').length
    if (len > max) max = len
  }
  return max
}

function graphCurvePath(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.abs(y2 - y1) * 0.62
  const dir = y2 > y1 ? 1 : -1
  return `M ${x1} ${y1} C ${x1} ${y1 + bend * dir}, ${x2} ${y2 - bend * dir}, ${x2} ${y2}`
}

/**
 * Render the `git --graph` prefix as a tiny SVG. Git still owns layout; this
 * only replaces ASCII glyphs with rounded line segments and commit dots.
 */
function GraphLaneSpans(props: {
  ansi: string
  brightCols: Set<number> | null
  gutterCols: number
  meta?: GraphRowMeta
  isHead?: boolean
  isDetached?: boolean
}) {
  const text = stripAnsi(props.ansi).replace(/\s+$/, '')
  const brightCols = props.brightCols
  const height = GRAPH_ROW_HEIGHT
  const width = Math.max(props.gutterCols, text.length, 1) * GRAPH_COL_WIDTH
  const mid = height / 2
  const above = props.meta?.above ?? null
  const below = props.meta?.below ?? null
  const lanesBack = []
  const markersFront = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const onSpine = brightCols !== null && brightCols.has(i)
    const color = graphLaneColor(onSpine)
    const x = graphColX(i)
    if (ch === ' ') continue
    if (ch === '|') {
      // When the lane turns at an adjacent curve connector, stop at the row
      // center: the connector draws the bend from there. A straight
      // continuation keeps the usual overlap into the neighboring row.
      const y1 = laneBendsAbove(above, i) ? mid : -GRAPH_LINE_OVERLAP
      const y2 = laneBendsBelow(below, i) ? mid : height + GRAPH_LINE_OVERLAP
      lanesBack.push(
        <line
          key={i}
          x1={x}
          y1={y1}
          x2={x}
          y2={y2}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />,
      )
      continue
    }
    if (ch === '/') {
      const x1 = graphColX(i - 1)
      const y1 = height + GRAPH_LINE_OVERLAP
      const x2 = graphColX(i + 1)
      const y2 = -GRAPH_LINE_OVERLAP
      lanesBack.push(
        <path
          key={i}
          d={graphCurvePath(x1, y1, x2, y2)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />,
      )
      continue
    }
    if (ch === '\\') {
      const x1 = graphColX(i - 1)
      const y1 = -GRAPH_LINE_OVERLAP
      const x2 = graphColX(i + 1)
      const y2 = height + GRAPH_LINE_OVERLAP
      lanesBack.push(
        <path
          key={i}
          d={graphCurvePath(x1, y1, x2, y2)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />,
      )
      continue
    }
    if (ch === '-' || ch === '_') {
      lanesBack.push(
        <line
          key={i}
          x1={x - GRAPH_COL_WIDTH / 2}
          y1={mid}
          x2={x + GRAPH_COL_WIDTH / 2}
          y2={mid}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />,
      )
      continue
    }
    if (ch === '*') {
      const connectsAbove = dotStubAbove(above, i)
      const connectsBelow = dotStubBelow(below, i)
      // Branch tip: no link reaches this dot from above (not even a curve
      // connector). Render as a hollow ring so the lane visibly *starts*
      // here instead of looking like a broken line in a reused column.
      const isTip =
        !connectsAbove &&
        !(above?.kind === 'curve' && touchesBottomDiagonally(above.text, i))
      if (props.isHead) {
        const hcls = `graph-node graph-node-head${props.isDetached ? ' graph-node-head-detached' : ''}`
        markersFront.push(
          <g
            key={i}
            class={hcls}
            title={props.isDetached ? 'detached HEAD' : 'HEAD'}
          >
            {connectsBelow ? (
              <line
                x1={x}
                y1={mid + GRAPH_NODE_RADIUS}
                x2={x}
                y2={height + GRAPH_LINE_OVERLAP}
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                opacity="0.3"
              />
            ) : null}
            <circle
              class="graph-node-head-ring"
              cx={x}
              cy={mid}
              r="5.2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              opacity="0.3"
            />
            <circle cx={x} cy={mid} r={GRAPH_NODE_RADIUS} fill="currentColor" />
          </g>,
        )
        continue
      }
      markersFront.push(
        <g key={i}>
          {connectsAbove ? (
            <line
              x1={x}
              y1={-GRAPH_LINE_OVERLAP}
              x2={x}
              y2={mid - GRAPH_NODE_RADIUS}
              stroke={color}
              stroke-width="1.8"
              stroke-linecap="round"
            />
          ) : null}
          {connectsBelow ? (
            <line
              x1={x}
              y1={mid + GRAPH_NODE_RADIUS}
              x2={x}
              y2={height + GRAPH_LINE_OVERLAP}
              stroke={color}
              stroke-width="1.8"
              stroke-linecap="round"
            />
          ) : null}
          {isTip ? (
            <circle
              class="graph-node graph-node-tip"
              cx={x}
              cy={mid}
              r={GRAPH_NODE_RADIUS}
              fill="var(--bg)"
              stroke={graphNodeColor(onSpine)}
              stroke-width="1.6"
            />
          ) : (
            <circle
              class="graph-node"
              cx={x}
              cy={mid}
              r={GRAPH_NODE_RADIUS}
              fill={graphNodeColor(onSpine)}
            />
          )}
        </g>,
      )
      continue
    }
    markersFront.push(
      <text
        key={i}
        x={x}
        y={mid + 4}
        text-anchor="middle"
        class="graph-lane-fallback"
      >
        {ch}
      </text>,
    )
  }
  return (
    <svg
      class="graph-lanes-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      {lanesBack}
      {markersFront}
    </svg>
  )
}

/**
 * A lone connector row collapses to zero height, so its lane transitions are
 * drawn as continuous segments spanning from the center of the commit row
 * above to the center of the commit row below — wide, smooth curves like a
 * dedicated graph renderer would produce, instead of kinks squeezed into the
 * row boundary.
 */
function ConnectorLaneSpans(props: {
  ansi: string
  brightCols: Set<number> | null
  gutterCols: number
}) {
  const text = stripAnsi(props.ansi).replace(/\s+$/, '')
  const width = Math.max(props.gutterCols, text.length, 1) * GRAPH_COL_WIDTH
  const height = GRAPH_CONNECTOR_HEIGHT
  const mid = height / 2
  // The SVG is centered on the zero-height row; reach into both neighbors.
  const yTop = mid - GRAPH_HALF_LOG_ROW
  const yBottom = mid + GRAPH_HALF_LOG_ROW
  const lanes = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ') continue
    const onSpine = props.brightCols !== null && props.brightCols.has(i)
    const color = graphLaneColor(onSpine)
    const x = graphColX(i)
    if (ch === '|') {
      lanes.push(
        <line
          key={i}
          x1={x}
          y1={yTop}
          x2={x}
          y2={yBottom}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />,
      )
      continue
    }
    if (ch === '/' || ch === '\\') {
      const xTop = ch === '/' ? graphColX(i + 1) : graphColX(i - 1)
      const xBottom = ch === '/' ? graphColX(i - 1) : graphColX(i + 1)
      lanes.push(
        <path
          key={i}
          d={graphCurvePath(xTop, yTop, xBottom, yBottom)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />,
      )
      continue
    }
    if (ch === '-' || ch === '_') {
      lanes.push(
        <line
          key={i}
          x1={x - GRAPH_COL_WIDTH / 2}
          y1={mid}
          x2={x + GRAPH_COL_WIDTH / 2}
          y2={mid}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />,
      )
      continue
    }
    lanes.push(
      <text
        key={i}
        x={x}
        y={mid + 4}
        text-anchor="middle"
        class="graph-lane-fallback"
      >
        {ch}
      </text>,
    )
  }
  return (
    <svg
      class="graph-lanes-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      {lanes}
    </svg>
  )
}

/** Order pills as: HEAD ref first, local branch before remote-tracking. */
function pillSortKey(token: DecorationToken): number {
  if (token.head) return -1
  if (token.kind === 'head') return 4
  if (token.kind === 'remote') return 1
  return 0
}

function RefPills(props: {
  decorateRaw: string
  branchPrefix: string | null
  currentBranch: string | null
}) {
  const tokens = decorationTokens(props.decorateRaw)
  if (tokens.length === 0) return null
  const locals = localNamesOnRow(tokens, props.branchPrefix)
  const nonTag = tokens.filter((t) => !isTagToken(t))
  const sorted = [...nonTag].sort((a, b) => pillSortKey(a) - pillSortKey(b))
  return (
    <span class="graph-pills">
      {sorted.map((t, idx) => {
        const display = t.name
        if (t.kind === 'head') return null
        if (isRemoteHeadToken(t)) return null
        if (refPillRedundantWithBranchPrefix(t, props.branchPrefix)) return null
        if (isRemoteShadowingLocal(t, locals)) return null
        const ref = refForCheckout(t)
        if (!ref) return null
        const peer = t.kind === 'local' ? remotePeer(tokens, display) : null
        return (
          <span
            key={idx}
            class={pillClass(t)}
            title={peer ? `${display}, ${peer}/${display}` : display}
            data-copy={display}
          >
            {display}
            {peer ? (
              <>
                <span class="ref-peer-sep">|</span>
                <span class="ref-peer">{peer}</span>
              </>
            ) : null}
            <CopyBtn title="copy name" />
            {ref === props.currentBranch ? (
              peer ? null : (
                <button
                  type="button"
                  class="inline-action-btn ref-action-btn"
                  title="git push"
                  data-confirm-label="confirm push"
                  data-confirm-busy-label="pushing…"
                  hx-post="/api/push"
                  hx-target="#graph"
                  hx-swap="outerHTML"
                >
                  push
                </button>
              )
            ) : (
              <button
                type="button"
                class="inline-action-btn ref-action-btn"
                title={`git switch ${ref}`}
                hx-post={`/api/checkout/branch?name=${encodeURIComponent(ref)}`}
                hx-target="#graph"
                hx-swap="outerHTML"
              >
                switch
              </button>
            )}
          </span>
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
  currentBranch: string | null
  brightCols: Set<number> | null
  meta: GraphRowMeta
  gutterCols: number
}) {
  const { graphAnsi, shaFull, shaShort, decorateRaw, subject, date, inHistory } =
    props.row
  const isHead = graphCommitIsHead(decorateRaw)
  const tokens = decorationTokens(decorateRaw)
  const branchPrefix = branchPrefixFromTokens(tokens)
  const branchPrefixPeer = remotePeer(tokens, branchPrefix)
  const tagNames = collectTagNames(tokens)
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
        <GraphLaneSpans
          ansi={graphAnsi}
          brightCols={props.brightCols}
          gutterCols={props.gutterCols}
          meta={props.meta}
          isHead={isHead}
          isDetached={isHead && props.detached}
        />
      </span>
      {branchPrefix ? (
        <span
          class="branch-prefix"
          title={
            branchPrefixPeer
              ? `branch: ${branchPrefix}, ${branchPrefixPeer}/${branchPrefix}`
              : `branch: ${branchPrefix}`
          }
          data-copy={branchPrefix}
        >
          {branchPrefix}
          {branchPrefixPeer ? (
            <>
              <span class="ref-peer-sep">|</span>
              <span class="ref-peer">{branchPrefixPeer}</span>
            </>
          ) : null}
          <CopyBtn title="copy name" />
          {branchPrefix === props.currentBranch ? (
            branchPrefixPeer ? null : (
              <button
                type="button"
                class="inline-action-btn branch-prefix-action"
                title="git push"
                data-confirm-label="confirm push"
                data-confirm-busy-label="pushing…"
                hx-post="/api/push"
                hx-target="#graph"
                hx-swap="outerHTML"
              >
                push
              </button>
            )
          ) : (
            <button
              type="button"
              class="inline-action-btn branch-prefix-action"
              title={`git switch ${branchPrefix}`}
              hx-post={`/api/checkout/branch?name=${encodeURIComponent(branchPrefix)}`}
              hx-target="#graph"
              hx-swap="outerHTML"
            >
              switch
            </button>
          )}
        </span>
      ) : null}
      <RefPills
        decorateRaw={decorateRaw}
        branchPrefix={branchPrefix}
        currentBranch={props.currentBranch}
      />
      <button
        type="button"
        class="msg-btn"
        title={subject}
        hx-get={diffUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        {subject}
        {tagNames.length > 0 ? (
          <span
            class="row-tags-marker"
            title={`tags: ${tagNames.join(', ')}`}
          >
            {TAG_ICO}
          </span>
        ) : null}
      </button>
      <span class="row-end">
        <span class="msg-age" title={date}>
          {relTimeAgo(date)}
        </span>
        <span class="row-tail">
          <button
            type="button"
            class="row-action-btn"
            title={`git branch … ${shaShort}`}
            hx-post={`/api/branch/create?sha=${encodeURIComponent(shaFull)}`}
            hx-target="#graph"
            hx-swap="outerHTML"
            hx-prompt="branch name"
          >
            new branch
          </button>
          <button
            type="button"
            class="row-action-btn"
            title="git switch --detach to this commit"
            data-confirm-label="confirm checkout"
            hx-post={`/api/checkout/commit?sha=${encodeURIComponent(shaFull)}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            checkout
          </button>
          <code class="hash-peek" title={shaFull}>
            {shaShort}
          </code>
          <CopyBtn dataCopy={shaFull} title="copy full hash" />
        </span>
      </span>
    </div>
  )
}

function GraphOtherLine(props: {
  ansi: string
  betweenInHistory: boolean
  brightCols: Set<number> | null
  /**
   * 'curve' connectors collapse to zero height and draw center-to-center
   * curves into both neighboring commit rows. 'tall' connectors (inside a
   * run of consecutive connectors) keep their height so stacked transitions
   * don't overdraw each other.
   */
  kind: 'curve' | 'tall'
  gutterCols: number
}) {
  const cls = [
    'log-row',
    'log-row-other',
    props.kind === 'tall' ? 'log-row-other-tall' : '',
    props.betweenInHistory ? '' : 'log-row-dim',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div class={cls}>
      <span class="graph-prefix-wide">
        {props.kind === 'tall' ? (
          <GraphLaneSpans
            ansi={props.ansi}
            brightCols={props.brightCols}
            gutterCols={props.gutterCols}
          />
        ) : (
          <ConnectorLaneSpans
            ansi={props.ansi}
            brightCols={props.brightCols}
            gutterCols={props.gutterCols}
          />
        )}
      </span>
    </div>
  )
}

function StashLaneSpans(props: { graphAnsi: string; gutterCols: number }) {
  const text = stripAnsi(props.graphAnsi).replace(/\s+$/, '')
  const width = Math.max(props.gutterCols, text.length, 1) * GRAPH_COL_WIDTH
  const height = GRAPH_ROW_HEIGHT
  const mid = height / 2
  const col = Math.max(0, text.indexOf('*'))
  const x = graphColX(col)
  const r = 3.4
  return (
    <svg
      class="graph-lanes-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={x}
        y1={-GRAPH_LINE_OVERLAP}
        x2={x}
        y2={height + GRAPH_LINE_OVERLAP}
        stroke="var(--graph-rail-muted)"
        stroke-width="1.8"
        stroke-linecap="round"
        opacity="0.55"
      />
      <rect
        class="graph-stash-node"
        x={x - r}
        y={mid - r}
        width={r * 2}
        height={r * 2}
        rx="1.2"
        transform={`rotate(45 ${x} ${mid})`}
      />
    </svg>
  )
}

function GraphStashLine(props: {
  stash: PreviewStashEntry
  baseRow: GraphCommitRow
  gutterCols: number
}) {
  const ref = encodeURIComponent(props.stash.ref)
  const summaryUrl = `/api/stash?ref=${ref}`
  return (
    <div class="log-row log-row-commit log-row-stash">
      <span class="graph-prefix">
        <StashLaneSpans
          graphAnsi={props.baseRow.graphAnsi}
          gutterCols={props.gutterCols}
        />
      </span>
      <span class="ref-pill ref-pill-stash" title={`stash: ${props.stash.ref}`}>
        {props.stash.ref}
      </span>
      <button
        type="button"
        class="msg-btn stash-msg"
        title={props.stash.subject}
        hx-get={summaryUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        {props.stash.subject}
      </button>
      <span class="row-end">
        <span class="msg-age" title={props.stash.subject}>
          {props.stash.age}
        </span>
        <span class="row-tail">
          <button
            type="button"
            class="row-action-btn"
            title={`git stash apply --index ${props.stash.ref}; git stash drop ${props.stash.ref}`}
            hx-post={`/api/worktree/stash-restore?ref=${ref}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            restore
          </button>
          <button
            type="button"
            class="row-action-btn stash-drop-btn"
            title={`git stash drop ${props.stash.ref}`}
            data-confirm-label="drop"
            hx-post={`/api/worktree/stash-drop?ref=${ref}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            drop
          </button>
        </span>
      </span>
    </div>
  )
}

function HeadLine(props: { head: HeadInfo }) {
  const short = props.head.sha.slice(0, 7)
  let prefix = 'Detached at:'
  let label = short
  let tip = `detached at ${short}`
  if (props.head.kind === 'branch') {
    prefix = 'On branch:'
    label = props.head.name
    tip = `at ${short}`
  }
  return (
    <>
      <span class="head-prep">{prefix}</span>
      <span class="head-label" title={tip}>
        {label}
      </span>
    </>
  )
}

export function GraphRows(props: {
  rows: GraphRow[]
  detached: boolean
  currentBranch: string | null
  stashes: PreviewStashEntry[]
  brightColsByRow: Array<Set<number> | null>
  rowMeta: GraphRowMeta[]
  gutterCols: number
}) {
  const stashesByBase = new Map<string, PreviewStashEntry[]>()
  for (const stash of props.stashes) {
    const bucket = stashesByBase.get(stash.baseSha) ?? []
    bucket.push(stash)
    stashesByBase.set(stash.baseSha, bucket)
  }

  return (
    <>
      {props.rows.map((r, i) => {
        const meta = props.rowMeta[i] ?? LONE_COMMIT_META
        if (r.kind !== 'commit') {
          return (
            <GraphOtherLine
              key={i}
              ansi={r.ansi}
              betweenInHistory={r.betweenInHistory}
              brightCols={props.brightColsByRow[i] ?? null}
              kind={meta.kind === 'tall' ? 'tall' : 'curve'}
              gutterCols={props.gutterCols}
            />
          )
        }
        const stashes = stashesByBase.get(r.row.shaFull) ?? []
        return (
          <>
            {stashes.map((stash) => (
              <GraphStashLine
                key={stash.ref}
                stash={stash}
                baseRow={r.row}
                gutterCols={props.gutterCols}
              />
            ))}
            <GraphCommitLine
              key={i}
              row={r.row}
              detached={props.detached}
              currentBranch={props.currentBranch}
              brightCols={props.brightColsByRow[i] ?? null}
              meta={meta}
              gutterCols={props.gutterCols}
            />
          </>
        )
      })}
    </>
  )
}

export function GraphLoadMore(props: {
  offset: number
  nextLimit: number
  show: boolean
  /** Carried to tail loads so appended rows keep at least this gutter width. */
  gutterCols: number
}) {
  if (!props.show) return null
  return (
    <button
      type="button"
      class="graph-load-more"
      title={`git log --graph -n ${props.nextLimit}`}
      hx-get={`/fragment/graph/tail?offset=${encodeURIComponent(String(props.offset))}&limit=${encodeURIComponent(String(props.nextLimit))}&gutter=${encodeURIComponent(String(props.gutterCols))}`}
      hx-target="this"
      hx-swap="outerHTML show:none"
      hx-trigger="click, intersect once root:#graph threshold:0.2"
    >
      load more
    </button>
  )
}

export function GraphTailFragment(props: {
  rows: GraphRow[]
  detached: boolean
  currentBranch: string | null
  stashes: PreviewStashEntry[]
  brightColsByRow: Array<Set<number> | null>
  rowMeta: GraphRowMeta[]
  gutterCols: number
  offset: number
  nextLimit: number
  showLoadMore: boolean
}) {
  return (
    <>
      <GraphRows
        rows={props.rows}
        detached={props.detached}
        currentBranch={props.currentBranch}
        stashes={props.stashes}
        brightColsByRow={props.brightColsByRow}
        rowMeta={props.rowMeta}
        gutterCols={props.gutterCols}
      />
      <GraphLoadMore
        offset={props.offset}
        nextLimit={props.nextLimit}
        show={props.showLoadMore}
        gutterCols={props.gutterCols}
      />
    </>
  )
}

export function GraphFragment(props: GraphFragmentProps) {
  const oob = props.swapOob ? ({ 'hx-swap-oob': 'true' } as const) : {}
  if (!props.ok) {
    return (
      <div
        id="graph"
        class="graph-root graph-error"
        data-repo={props.repoPath}
        data-server-pid={String(props.serverPid)}
        {...oob}
      >
        <div class="graph-error-head">
          <span class="graph-repo-name" title={props.repoPath}>
            {path.basename(props.repoPath)}
          </span>
        </div>
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, rows, worktree } = props
  const detached = head.kind === 'detached'
  const currentBranch = head.kind === 'branch' ? head.name : null
  const brightColsByRow = graphBrightCols(rows)
  const rowMeta = graphRowMeta(rows)
  const gutterCols = graphGutterCols(rows)

  return (
    <div
      id="graph"
      class="graph-root"
      data-repo={props.repoPath}
      data-server-pid={String(props.serverPid)}
      data-graph-limit={String(props.graphCommitLimit)}
      {...oob}
    >
      <div class={`graph-head${detached ? ' graph-head-detached' : ''}`}>
        <span class="graph-repo-name" title={props.repoPath}>
          {path.basename(props.repoPath)}
        </span>
        <div class="graph-head-line">
          <HeadLine head={head} />
        </div>
        {head.kind === 'detached' && head.previousBranch ? (
          <div class="graph-head-actions">
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
          </div>
        ) : null}
      </div>
      <WorkTreeFragment
        {...worktree}
        currentSha={head.sha}
        previewStash={props.previewStash}
        repoPath={props.repoPath}
      />
      <div class="graph-body">
        <div class={`log-lines${rows.length === 0 ? ' empty' : ''}`}>
          {rows.length === 0 ? (
            '(no commits yet)'
          ) : (
            <GraphTailFragment
              rows={rows}
              detached={detached}
              currentBranch={currentBranch}
              stashes={props.previewStash.stashes}
              brightColsByRow={brightColsByRow}
              rowMeta={rowMeta}
              gutterCols={gutterCols}
              offset={rows.length}
              nextLimit={props.graphNextLimit}
              showLoadMore={props.showLoadMore}
            />
          )}
        </div>
      </div>
    </div>
  )
}
