/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import {
  stripAnsi,
  type GraphCommitRow,
  type GraphRow,
  type HeadInfo,
  type WorkTreeSummary,
} from '../git'
import { RepoBar } from './repo'
import { WorkTreeFragment } from './worktree'

export type GraphFragmentProps =
  | {
      ok: true
      head: HeadInfo
      rows: GraphRow[]
      worktree: WorkTreeSummary
      /** Absolute repo root; tags #worktree so stale polls cannot overwrite after repo switch. */
      repoPath: string
      repoPickerRoot: string
      repoPickerRecents: string[]
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
      repoPickerRoot: string
      repoPickerRecents: string[]
      swapOob?: boolean
    }

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
  if (tokenPlain.includes('/')) return 'ref-pill ref-pill-remote'
  return 'ref-pill ref-pill-branch'
}

/** Distinct tag names on this commit. */
function collectTagNames(tokens: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tokens) {
    const plain = stripAnsi(t).trim()
    if (!isTagToken(plain)) continue
    const n = tagName(plain)
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

type GraphLaneConnections = {
  above: Set<number>
  below: Set<number>
}

const EMPTY_LANE_CONNECTIONS: GraphLaneConnections = {
  above: new Set(),
  below: new Set(),
}

function graphConnectsDown(text: string, col: number): boolean {
  return (
    isVerticalGraphChar(graphChar(text, col)) ||
    graphChar(text, col - 1) === '/' ||
    graphChar(text, col + 1) === '\\'
  )
}

function graphConnectsUp(text: string, col: number): boolean {
  return (
    isVerticalGraphChar(graphChar(text, col)) ||
    graphChar(text, col - 1) === '\\' ||
    graphChar(text, col + 1) === '/'
  )
}

export function graphLaneConnections(rows: GraphRow[]): GraphLaneConnections[] {
  const texts = rows.map(graphText)
  return texts.map((text, i) => {
    const above = new Set<number>()
    const below = new Set<number>()
    for (let col = 0; col < text.length; col++) {
      if (graphChar(text, col) !== '*') continue
      if (i > 0 && graphConnectsDown(texts[i - 1] ?? '', col)) above.add(col)
      if (i < texts.length - 1 && graphConnectsUp(texts[i + 1] ?? '', col)) {
        below.add(col)
      }
    }
    return { above, below }
  })
}

/**
 * Bright graph cells flow from reachable commits toward their parents.
 * We never flow upward, so an unmerged side branch that shares an old base
 * stays dim while the current main lane beside it remains bright.
 */
export function graphLaneHighlights(rows: GraphRow[]): Array<Set<number> | null> {
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

const GRAPH_COL_WIDTH = 7
const GRAPH_ROW_HEIGHT = 16
const GRAPH_CONNECTOR_HEIGHT = 2
const GRAPH_NODE_RADIUS = 3.2
const GRAPH_LINE_OVERLAP = 4

function graphColX(col: number): number {
  return col * GRAPH_COL_WIDTH + GRAPH_COL_WIDTH / 2
}

function graphLaneColor(onSpine: boolean): string {
  return onSpine ? 'var(--accent)' : 'var(--graph-rail-muted)'
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
  highlightLanes: Set<number> | null
  connections?: GraphLaneConnections
  isHead?: boolean
  isDetached?: boolean
  compact?: boolean
}) {
  const text = stripAnsi(props.ansi)
  const lanes = props.highlightLanes
  const height = props.compact ? GRAPH_CONNECTOR_HEIGHT : GRAPH_ROW_HEIGHT
  const width = Math.max(GRAPH_COL_WIDTH, text.length * GRAPH_COL_WIDTH)
  const mid = height / 2
  const out = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const onSpine = lanes !== null && lanes.has(i)
    const color = graphLaneColor(onSpine)
    const opacity = onSpine ? 1 : 0.34
    const x = graphColX(i)
    if (ch === ' ') continue
    if (ch === '|') {
      out.push(
        <line
          key={i}
          x1={x}
          y1={-GRAPH_LINE_OVERLAP}
          x2={x}
          y2={height + GRAPH_LINE_OVERLAP}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          opacity={opacity}
        />,
      )
      continue
    }
    if (ch === '/') {
      const x1 = graphColX(i - 1)
      const y1 = height + GRAPH_LINE_OVERLAP
      const x2 = graphColX(i + 1)
      const y2 = -GRAPH_LINE_OVERLAP
      out.push(
        <path
          key={i}
          d={graphCurvePath(x1, y1, x2, y2)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity={opacity}
        />,
      )
      continue
    }
    if (ch === '\\') {
      const x1 = graphColX(i - 1)
      const y1 = -GRAPH_LINE_OVERLAP
      const x2 = graphColX(i + 1)
      const y2 = height + GRAPH_LINE_OVERLAP
      out.push(
        <path
          key={i}
          d={graphCurvePath(x1, y1, x2, y2)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity={opacity}
        />,
      )
      continue
    }
    if (ch === '-' || ch === '_') {
      out.push(
        <line
          key={i}
          x1={x - GRAPH_COL_WIDTH / 2}
          y1={mid}
          x2={x + GRAPH_COL_WIDTH / 2}
          y2={mid}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          opacity={opacity}
        />,
      )
      continue
    }
    if (ch === '*') {
      const connectsAbove = props.connections?.above.has(i) ?? false
      const connectsBelow = props.connections?.below.has(i) ?? false
      if (props.isHead) {
        const hcls = `graph-node graph-node-head${props.isDetached ? ' graph-node-head-detached' : ''}`
        out.push(
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
      out.push(
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
              opacity={opacity}
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
              opacity={opacity}
            />
          ) : null}
          <circle
            class="graph-node"
            cx={x}
            cy={mid}
            r={GRAPH_NODE_RADIUS}
            fill={color}
            opacity={onSpine ? 1 : 0.44}
          />
        </g>,
      )
      continue
    }
    out.push(
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
      {out}
    </svg>
  )
}

/** Order pills as: HEAD ref first, local branch before remote-tracking. */
function pillSortKey(plain: string): number {
  if (/HEAD\s*->/i.test(plain)) return -1
  if (/^HEAD$/i.test(plain)) return 4
  if (plain.includes('/')) return 1
  return 0
}

function RefPills(props: {
  decorateRaw: string
  branchPrefix: string | null
  currentBranch: string | null
}) {
  const tokens = decorationRefs(props.decorateRaw)
  if (tokens.length === 0) return null
  const locals = localNamesOnRow(tokens, props.branchPrefix)
  const nonTag = tokens.filter((t) => !isTagToken(stripAnsi(t).trim()))
  const sorted = [...nonTag].sort(
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
        return (
          <span
            key={idx}
            class={pillClass(plain)}
            title={plain}
          >
            {plain}
            {ref === props.currentBranch ? (
              <button
                type="button"
                class="inline-action-btn ref-action-btn"
                title="git push"
                data-confirm-label="confirm push"
                hx-post="/api/push"
                hx-swap="none"
              >
                push
              </button>
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
  highlightLanes: Set<number> | null
  connections: GraphLaneConnections
}) {
  const { graphAnsi, shaFull, shaShort, decorateRaw, subject, date, inHistory } =
    props.row
  const isHead = graphCommitIsHead(decorateRaw)
  const branchPrefix = branchPrefixFromDecorations(decorateRaw)
  const tagNames = collectTagNames(decorationRefs(decorateRaw))
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
          highlightLanes={props.highlightLanes}
          connections={props.connections}
          isHead={isHead}
          isDetached={isHead && props.detached}
        />
      </span>
      {branchPrefix ? (
        <span
          class="branch-prefix"
          title={`branch: ${branchPrefix}`}
        >
          {branchPrefix}
          {branchPrefix === props.currentBranch ? (
            <button
              type="button"
              class="inline-action-btn branch-prefix-action"
              title="git push"
              data-confirm-label="confirm push"
              hx-post="/api/push"
              hx-swap="none"
            >
              push
            </button>
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

function GraphOtherLine(props: {
  ansi: string
  betweenInHistory: boolean
  highlightLanes: Set<number> | null
}) {
  const cls = `log-row log-row-other ${props.betweenInHistory ? '' : 'log-row-dim'}`
  return (
    <div class={cls.trim()}>
      <span class="graph-prefix-wide">
        <GraphLaneSpans
          ansi={props.ansi}
          highlightLanes={props.highlightLanes}
          compact
        />
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
      <span
        class="head-label"
        title={tip}
      >
        {label}
        {props.head.kind === 'branch' ? (
          <button
            type="button"
            class="inline-action-btn head-branch-action"
            title="git push"
            data-confirm-label="confirm push"
            hx-post="/api/push"
            hx-swap="none"
          >
            push
          </button>
        ) : null}
      </span>
    </>
  )
}

export function GraphRows(props: {
  rows: GraphRow[]
  detached: boolean
  currentBranch: string | null
  laneHighlights: Array<Set<number> | null>
  laneConnections: GraphLaneConnections[]
}) {
  return (
    <>
      {props.rows.map((r, i) =>
        r.kind === 'commit' ? (
          <GraphCommitLine
            key={i}
            row={r.row}
            detached={props.detached}
            currentBranch={props.currentBranch}
            highlightLanes={props.laneHighlights[i] ?? null}
            connections={props.laneConnections[i] ?? EMPTY_LANE_CONNECTIONS}
          />
        ) : (
          <GraphOtherLine
            key={i}
            ansi={r.ansi}
            betweenInHistory={r.betweenInHistory}
            highlightLanes={props.laneHighlights[i] ?? null}
          />
        ),
      )}
    </>
  )
}

export function GraphLoadMore(props: {
  offset: number
  nextLimit: number
  show: boolean
}) {
  if (!props.show) return null
  return (
    <button
      type="button"
      class="graph-load-more"
      title={`git log --graph -n ${props.nextLimit}`}
      hx-get={`/fragment/graph/tail?offset=${encodeURIComponent(String(props.offset))}&limit=${encodeURIComponent(String(props.nextLimit))}`}
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
  laneHighlights: Array<Set<number> | null>
  laneConnections: GraphLaneConnections[]
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
        laneHighlights={props.laneHighlights}
        laneConnections={props.laneConnections}
      />
      <GraphLoadMore
        offset={props.offset}
        nextLimit={props.nextLimit}
        show={props.showLoadMore}
      />
    </>
  )
}

export function GraphFragment(props: GraphFragmentProps) {
  const oob = props.swapOob ? ({ 'hx-swap-oob': 'true' } as const) : {}
  if (!props.ok) {
    return (
      <div id="graph" class="graph-root graph-error" {...oob}>
        <RepoBar root={props.repoPickerRoot} recents={props.repoPickerRecents} />
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, rows, worktree } = props
  const detached = head.kind === 'detached'
  const currentBranch = head.kind === 'branch' ? head.name : null
  const laneHighlights = graphLaneHighlights(rows)
  const laneConnections = graphLaneConnections(rows)

  return (
    <div
      id="graph"
      class="graph-root"
      data-graph-limit={String(props.graphCommitLimit)}
      {...oob}
    >
      <div class={`graph-head${detached ? ' graph-head-detached' : ''}`}>
        <RepoBar root={props.repoPickerRoot} recents={props.repoPickerRecents} />
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
      <WorkTreeFragment {...worktree} repoPath={props.repoPath} />
      <div class="graph-body">
        <div class={`log-lines${rows.length === 0 ? ' empty' : ''}`}>
          {rows.length === 0 ? (
            '(no commits yet)'
          ) : (
            <GraphTailFragment
              rows={rows}
              detached={detached}
              currentBranch={currentBranch}
              laneHighlights={laneHighlights}
              laneConnections={laneConnections}
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
