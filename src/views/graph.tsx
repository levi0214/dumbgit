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
const REF_BRANCH_ICO = raw(
  `<svg class="ref-branch-ico" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10M8 17c6 0 8-3 8-10"/></svg>`,
)
const ROW_ACTION_ICO_ATTRS =
  `class="row-action-ico" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`
const NEW_BRANCH_ICO = raw(
  `<svg ${ROW_ACTION_ICO_ATTRS}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
)
const CHECKOUT_ICO = raw(
  `<svg ${ROW_ACTION_ICO_ATTRS}><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
)
const RESTORE_ICO = raw(
  `<svg ${ROW_ACTION_ICO_ATTRS}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
)
const DROP_ICO = raw(
  `<svg ${ROW_ACTION_ICO_ATTRS}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
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

export function graphCommitIsHead(decorateRaw: string): boolean {
  const decoPlain = stripAnsi(decorateRaw)
  return (
    decoPlain.includes('HEAD ->') ||
    /(^|[(,\s])HEAD([),\s]|$)/.test(decoPlain)
  )
}

const GRAPH_COL_WIDTH = 8
const GRAPH_ROW_HEIGHT = 16
const GRAPH_NODE_RADIUS = 3.2
const GRAPH_LINE_OVERLAP = 4

function graphColX(col: number): number {
  return col * GRAPH_COL_WIDTH + GRAPH_COL_WIDTH / 2
}

/**
 * High-chroma lane colors: hue identifies topology, never reachability.
 * Column-based lookup is only a fallback; the topology pass below carries a
 * logical lane's color while that lane moves between screen columns.
 */
export const GRAPH_LANE_PALETTE = [
  '#169fe6',
  '#e653a8',
  '#39d353',
  '#f0a51a',
  '#a78bfa',
  '#22c7b8',
  '#f4d35e',
  '#70b7ff',
] as const

export type GraphLaneLayoutRow = {
  /** The physical lane containing this commit node. */
  lane: number
  /** Lanes whose pending target is this commit. Empty means a branch tip. */
  incoming: number[]
  /** Lanes assigned to this commit's parents, in parent order. */
  outgoing: number[]
  /** Unrelated lanes that pass straight through this row. */
  passThrough: number[]
}

export type GraphLaneLayout = {
  rows: GraphLaneLayoutRow[]
}

function firstFreeLane(lanes: Array<string | null>, after = -1): number {
  for (let i = after + 1; i < lanes.length; i++) {
    if (lanes[i] === null) return i
  }
  lanes.push(null)
  return lanes.length - 1
}

/**
 * A deliberately literal lane allocator.
 *
 * Every pending parent path owns one physical lane. Duplicate paths to the
 * same future commit are not coalesced early; they remain separate until that
 * commit row, where all matching lanes terminate at the real node.
 */
export function graphLaneLayout(rows: GraphRow[]): GraphLaneLayout {
  const lanes: Array<string | null> = []
  const layoutRows: GraphLaneLayoutRow[] = []

  for (const item of rows) {
    const sha = item.row.shaFull.toLowerCase()
    const incoming: number[] = []
    for (let lane = 0; lane < lanes.length; lane++) {
      if (lanes[lane]?.toLowerCase() === sha) incoming.push(lane)
    }

    let lane: number
    if (incoming.length > 0) {
      lane = incoming[0]!
    } else {
      lane = firstFreeLane(lanes)
      lanes[lane] = sha
    }

    const passThrough: number[] = []
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] !== null && !incoming.includes(i) && i !== lane) {
        passThrough.push(i)
      }
    }

    for (const matchedLane of incoming) lanes[matchedLane] = null

    const outgoing: number[] = []
    const parents = item.row.parents.map((parent) => parent.toLowerCase())
    if (parents[0]) {
      lanes[lane] = parents[0]
      outgoing.push(lane)
    } else {
      lanes[lane] = null
    }

    for (const parent of parents.slice(1)) {
      const parentLane = firstFreeLane(lanes, lane)
      lanes[parentLane] = parent
      outgoing.push(parentLane)
    }

    layoutRows.push({ lane, incoming, outgoing, passThrough })
  }

  return { rows: layoutRows }
}

/** Width needed by this row's node, curves, and pass-through lanes. */
export function graphRowGutterCols(layout: GraphLaneLayoutRow): number {
  const rightmostLane = Math.max(
    layout.lane,
    ...layout.incoming,
    ...layout.outgoing,
    ...layout.passThrough,
  )
  return rightmostLane * 2 + 1
}

/** Inline CSS vars so branch pills share the commit's lane color. */
function laneTintStyle(color: string): string {
  return `--lane:${color}`
}

function graphCurvePath(x1: number, y1: number, x2: number, y2: number): string {
  const bend = Math.abs(y2 - y1) * 0.62
  const dir = y2 > y1 ? 1 : -1
  return `M ${x1} ${y1} C ${x1} ${y1 + bend * dir}, ${x2} ${y2 - bend * dir}, ${x2} ${y2}`
}

function physicalLaneX(lane: number): number {
  return graphColX(lane * 2)
}

export function physicalLaneColor(lane: number): string {
  return GRAPH_LANE_PALETTE[lane % GRAPH_LANE_PALETTE.length]!
}

/** One SVG row: paths may meet only at the commit dot in its center. */
export function GraphLaneSpans(props: {
  layout: GraphLaneLayoutRow
  isHead: boolean
  isDetached: boolean
  rowHeight?: number
}) {
  const height = props.rowHeight ?? GRAPH_ROW_HEIGHT
  const mid = height / 2
  const width = graphRowGutterCols(props.layout) * GRAPH_COL_WIDTH
  const nodeX = physicalLaneX(props.layout.lane)
  const nodeColor = physicalLaneColor(props.layout.lane)
  const strokes = []

  for (const lane of props.layout.passThrough) {
    const x = physicalLaneX(lane)
    strokes.push(
      <line
        key={`pass-${lane}`}
        x1={x}
        y1={-GRAPH_LINE_OVERLAP}
        x2={x}
        y2={height + GRAPH_LINE_OVERLAP}
        stroke={physicalLaneColor(lane)}
        stroke-width="1.8"
        stroke-linecap="round"
      />,
    )
  }

  for (const lane of props.layout.incoming) {
    const x = physicalLaneX(lane)
    const color = physicalLaneColor(lane)
    strokes.push(
      lane === props.layout.lane ? (
        <line
          key={`in-${lane}`}
          x1={x}
          y1={-GRAPH_LINE_OVERLAP}
          x2={nodeX}
          y2={mid}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />
      ) : (
        <path
          key={`in-${lane}`}
          d={graphCurvePath(x, -GRAPH_LINE_OVERLAP, nodeX, mid)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ),
    )
  }

  for (const lane of props.layout.outgoing) {
    const x = physicalLaneX(lane)
    const color = physicalLaneColor(lane)
    strokes.push(
      lane === props.layout.lane ? (
        <line
          key={`out-${lane}`}
          x1={nodeX}
          y1={mid}
          x2={x}
          y2={height + GRAPH_LINE_OVERLAP}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />
      ) : (
        <path
          key={`out-${lane}`}
          d={graphCurvePath(nodeX, mid, x, height + GRAPH_LINE_OVERLAP)}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ),
    )
  }

  const isTip = props.layout.incoming.length === 0
  const headColor = props.isDetached ? '#e0a23a' : nodeColor
  const node = props.isHead ? (
    <circle
      class="graph-node graph-node-head graph-node-head-ring"
      cx={nodeX}
      cy={mid}
      r="4.6"
      fill="var(--bg)"
      stroke={headColor}
      stroke-width="1.9"
    />
  ) : isTip ? (
    <circle
      class="graph-node graph-node-tip"
      cx={nodeX}
      cy={mid}
      r={GRAPH_NODE_RADIUS}
      fill="var(--bg)"
      stroke={nodeColor}
      stroke-width="1.6"
    />
  ) : (
    <circle
      class="graph-node"
      cx={nodeX}
      cy={mid}
      r={GRAPH_NODE_RADIUS}
      fill={nodeColor}
    />
  )

  return (
    <svg
      class="graph-lanes-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      {strokes}
      {node}
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
  laneColor: string
  readonly?: boolean
}) {
  const tokens = decorationTokens(props.decorateRaw)
  if (tokens.length === 0) return null
  const locals = localNamesOnRow(tokens, props.branchPrefix)
  const nonTag = tokens.filter((t) => !isTagToken(t))
  const sorted = [...nonTag].sort((a, b) => pillSortKey(a) - pillSortKey(b))
  const tint = laneTintStyle(props.laneColor)
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
            class={`${pillClass(t)} lane-tint`}
            style={tint}
            title={peer ? `${display}, ${peer}/${display}` : display}
            data-copy={display}
          >
            {REF_BRANCH_ICO}
            {display}
            {peer ? (
              <>
                <span class="ref-peer-sep">|</span>
                <span class="ref-peer">{peer}</span>
              </>
            ) : null}
            <CopyBtn title="copy name" />
            {props.readonly ? null : ref === props.currentBranch ? (
              peer ? null : (
                <button
                  type="button"
                  class="inline-action-btn ref-action-btn"
                  title="Push current branch · git push"
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
                title={`Switch to ${ref} · git switch ${ref}`}
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
export function relTimeAgo(iso: string): string {
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
  if (day < 14) return `${day}d ago`
  if (day < 60) return `${Math.floor(day / 7)}w ago`
  if (day < 365) return `${Math.floor(day / 30)}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

function GraphCommitLine(props: {
  row: GraphCommitRow
  detached: boolean
  currentBranch: string | null
  laneLayout: GraphLaneLayoutRow
  readonly?: boolean
  diffUrl?: string
  diffTarget?: string
  workspaceRepoPath?: string
}) {
  const {
    shaFull,
    shaShort,
    decorateRaw,
    subject,
    author,
    date,
  } = props.row
  const isHead = graphCommitIsHead(decorateRaw)
  const tokens = decorationTokens(decorateRaw)
  const branchPrefix = branchPrefixFromTokens(tokens)
  const branchPrefixPeer = remotePeer(tokens, branchPrefix)
  const tagNames = collectTagNames(tokens)
  const laneColor = physicalLaneColor(props.laneLayout.lane)
  const tint = laneTintStyle(laneColor)
  const ageTitle = [author, date].filter(Boolean).join(' · ')
  const diffUrl =
    props.diffUrl ?? `/api/commit/${encodeURIComponent(shaFull)}`
  const cls = [
    'log-row',
    'log-row-commit',
    isHead ? 'log-row-head' : '',
    isHead && props.detached ? 'log-row-detached' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      class={cls}
      data-sha={shaFull}
      data-commit-row="true"
      data-workspace-select={props.readonly ? 'commit' : undefined}
      data-repo={props.workspaceRepoPath}
    >
      <span class="graph-prefix">
        <GraphLaneSpans
          layout={props.laneLayout}
          isHead={isHead}
          isDetached={isHead && props.detached}
        />
      </span>
      {branchPrefix ? (
        <span
          class="branch-prefix lane-tint"
          style={tint}
          title={
            branchPrefixPeer
              ? `branch: ${branchPrefix}, ${branchPrefixPeer}/${branchPrefix}`
              : `branch: ${branchPrefix}`
          }
          data-copy={branchPrefix}
        >
          {REF_BRANCH_ICO}
          <span class="branch-prefix-name">{branchPrefix}</span>
          {branchPrefixPeer ? (
            <>
              <span class="ref-peer-sep">|</span>
              <span class="ref-peer">{branchPrefixPeer}</span>
            </>
          ) : null}
          <CopyBtn title="copy name" />
          {props.readonly ? null : branchPrefix === props.currentBranch ? (
            branchPrefixPeer ? null : (
              <button
                type="button"
                class="inline-action-btn branch-prefix-action"
                title="Push current branch · git push"
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
              title={`Switch to ${branchPrefix} · git switch ${branchPrefix}`}
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
        laneColor={laneColor}
        readonly={props.readonly}
      />
      <button
        type="button"
        class="msg-btn"
        data-commit-trigger="true"
        title={[subject, ageTitle].filter(Boolean).join('\n')}
        hx-get={diffUrl}
        hx-target={props.diffTarget ?? '#diff'}
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
        <span class="msg-age" title={ageTitle}>
          {relTimeAgo(date)}
        </span>
        <span class="row-tail" data-commit-ignore="true">
          {props.readonly ? null : (
            <>
              <button
                type="button"
                class="row-action-btn"
                title={`New branch from this commit · git branch … ${shaShort}`}
                aria-label="new branch"
                hx-post={`/api/branch/create?sha=${encodeURIComponent(shaFull)}`}
                hx-target="#graph"
                hx-swap="outerHTML"
                hx-prompt="branch name"
              >
                {NEW_BRANCH_ICO}
              </button>
              <button
                type="button"
                class="row-action-btn"
                title={`Checkout this commit · git switch --detach ${shaShort}`}
                aria-label="checkout"
                data-confirm-label="confirm checkout"
                hx-post={`/api/checkout/commit?sha=${encodeURIComponent(shaFull)}`}
                hx-target="#graph"
                hx-swap="outerHTML"
              >
                {CHECKOUT_ICO}
              </button>
            </>
          )}
          <code class="hash-peek" title={shaFull}>
            {shaShort}
          </code>
          <CopyBtn dataCopy={shaFull} title="copy full hash" />
        </span>
      </span>
    </div>
  )
}

function StashLaneSpans(props: { layout: GraphLaneLayoutRow }) {
  const width = graphRowGutterCols(props.layout) * GRAPH_COL_WIDTH
  const height = GRAPH_ROW_HEIGHT
  const lanes = [...new Set([
    ...props.layout.incoming,
    ...props.layout.passThrough,
  ])].sort((a, b) => a - b)
  return (
    <svg
      class="graph-lanes-svg graph-stash-lanes"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      {lanes.map((lane) => {
        const x = physicalLaneX(lane)
        return (
          <line
            key={lane}
            x1={x}
            y1={-GRAPH_LINE_OVERLAP}
            x2={x}
            y2={height + GRAPH_LINE_OVERLAP}
            stroke={physicalLaneColor(lane)}
            stroke-width="1.8"
            stroke-linecap="round"
          />
        )
      })}
    </svg>
  )
}

function GraphStashLine(props: {
  stash: PreviewStashEntry
  laneLayout: GraphLaneLayoutRow
}) {
  const ref = encodeURIComponent(props.stash.ref)
  const summaryUrl = `/api/stash?ref=${ref}`
  return (
    <div class="log-row log-row-commit log-row-stash">
      <span class="graph-prefix">
        <StashLaneSpans layout={props.laneLayout} />
      </span>
      <span class="ref-pill ref-pill-stash" title={`stash: ${props.stash.ref}`}>
        <svg
          class="ref-stash-ico"
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <rect
            x="3"
            y="3"
            width="6"
            height="6"
            rx="1"
            transform="rotate(45 6 6)"
          />
        </svg>
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
            title={`Restore this stash · git stash apply --index ${props.stash.ref}; git stash drop ${props.stash.ref}`}
            aria-label="restore stash"
            hx-post={`/api/worktree/stash-restore?ref=${ref}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            {RESTORE_ICO}
          </button>
          <button
            type="button"
            class="row-action-btn stash-drop-btn"
            title={`Drop this stash · git stash drop ${props.stash.ref}`}
            aria-label="drop stash"
            data-confirm-label="drop"
            hx-post={`/api/worktree/stash-drop?ref=${ref}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            {DROP_ICO}
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
  laneLayoutByRow: GraphLaneLayoutRow[]
  readonly?: boolean
  workspaceRepoPath?: string
  diffUrlForSha?: (sha: string) => string
  diffTarget?: string
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
        const laneLayout = props.laneLayoutByRow[i]
        if (!laneLayout) return null
        const stashes = stashesByBase.get(r.row.shaFull) ?? []
        return (
          <>
            {stashes.map((stash) => (
              <GraphStashLine
                key={stash.ref}
                stash={stash}
                laneLayout={laneLayout}
              />
            ))}
            <GraphCommitLine
              key={i}
              row={r.row}
              detached={props.detached}
              currentBranch={props.currentBranch}
              laneLayout={laneLayout}
              readonly={props.readonly}
              workspaceRepoPath={props.workspaceRepoPath}
              diffUrl={props.diffUrlForSha?.(r.row.shaFull)}
              diffTarget={props.diffTarget}
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
}) {
  if (!props.show) return null
  return (
    <button
      type="button"
      class="graph-load-more"
      title={`git log --date-order -n ${props.nextLimit}`}
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
  stashes: PreviewStashEntry[]
  laneLayoutByRow: GraphLaneLayoutRow[]
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
        laneLayoutByRow={props.laneLayoutByRow}
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
          <a class="workspace-entry" href="/">
            workspace
          </a>
        </div>
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, rows, worktree } = props
  const detached = head.kind === 'detached'
  const currentBranch = head.kind === 'branch' ? head.name : null
  const laneLayout = graphLaneLayout(rows)

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
        <div class="graph-head-actions">
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
          <a class="workspace-entry" href="/">
            workspace
          </a>
        </div>
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
              laneLayoutByRow={laneLayout.rows}
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
