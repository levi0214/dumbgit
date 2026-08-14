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
import { CopyButton } from './copy'
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
/** Stable graph/description boundary without Git Graph's very wide empty gutter. */
const GRAPH_COLUMN_MIN = 48
const GRAPH_COLUMN_MIN_COMPACT = 32
const GRAPH_COLUMN_END_PAD = 10
const GRAPH_COLUMN_END_PAD_COMPACT = 6

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

export type GraphLaneEdge = {
  lane: number
  /** Logical path color, independent of its current screen column. */
  color: number
}

export type GraphLaneTransition = {
  from: number
  to: number
  color: number
}

export type GraphLaneLayoutRow = {
  /** The physical lane containing this commit node. */
  lane: number
  /** Logical color carried by this commit's primary path. */
  nodeColor: number
  /** Top-edge lanes whose pending target is this commit. */
  incoming: GraphLaneEdge[]
  /** Bottom-edge lanes assigned to this commit's parents, in parent order. */
  outgoing: GraphLaneEdge[]
  /** Unrelated paths, including any leftward compaction across this row. */
  passThrough: GraphLaneTransition[]
}

export type GraphLaneLayout = {
  rows: GraphLaneLayoutRow[]
}

type SemanticBranch = {
  /** Topological identity; unlike color, this is never reused. */
  id: number
  color: number
}

type PendingLane = {
  target: string
  branch: SemanticBranch
}

type SemanticBranches = {
  branchByRow: SemanticBranch[]
  branchBySha: Map<string, SemanticBranch>
  nextBranchId: number
  nextColor: number
}

/**
 * Assign immutable colors to semantic first-parent branches before choosing
 * their screen columns. The earliest visible tip owns its ancestry; later
 * branches stop when they reach a commit that already belongs to a branch.
 *
 * This mirrors Git Graph's Branch/Vertex model: moving a path left does not
 * change its identity, and a side branch joins the established main branch
 * rather than donating its color to it.
 */
function semanticBranches(rows: GraphRow[]): SemanticBranches {
  const rowBySha = new Map<string, number>()
  rows.forEach((item, index) => {
    rowBySha.set(item.row.shaFull.toLowerCase(), index)
  })

  const branchByRow = Array<SemanticBranch | null>(rows.length).fill(null)
  const availableAfter: number[] = []
  let nextBranchId = 0

  for (let start = 0; start < rows.length; start++) {
    if (branchByRow[start] !== null) continue

    let color = availableAfter.findIndex((end) => start > end)
    if (color === -1) {
      color = availableAfter.length
      availableAfter.push(-1)
    }
    const branch = { id: nextBranchId++, color }

    let current = start
    let end = start
    while (branchByRow[current] === null) {
      branchByRow[current] = branch
      const firstParent = rows[current]!.row.parents[0]?.toLowerCase()
      if (!firstParent) break

      const parentRow = rowBySha.get(firstParent)
      if (parentRow === undefined) {
        // The branch continues beyond the loaded window, so its color cannot
        // safely be reused by another visible branch.
        end = rows.length
        break
      }

      end = Math.max(end, parentRow)
      if (parentRow <= current || branchByRow[parentRow] !== null) break
      current = parentRow
    }
    availableAfter[color] = end
  }

  const resolvedBranches = branchByRow.map((branch) => branch!)
  const branchBySha = new Map<string, SemanticBranch>()
  rows.forEach((item, index) => {
    branchBySha.set(item.row.shaFull.toLowerCase(), resolvedBranches[index]!)
  })
  return {
    branchByRow: resolvedBranches,
    branchBySha,
    nextBranchId,
    nextColor: availableAfter.length,
  }
}

function firstFreeLane<T>(lanes: Array<T | null>, after = -1): number {
  for (let i = after + 1; i < lanes.length; i++) {
    if (lanes[i] === null) return i
  }
  lanes.push(null)
  return lanes.length - 1
}

/**
 * Compact logical paths after every row without changing their branch.
 *
 * First-parent paths remain independent until the actual parent vertex. Merge
 * connectors may reuse an existing path only when it belongs to the same
 * semantic branch; equal target hashes alone never create an early junction.
 */
export function graphLaneLayout(rows: GraphRow[]): GraphLaneLayout {
  let lanes: Array<PendingLane | null> = []
  const layoutRows: GraphLaneLayoutRow[] = []
  const branches = semanticBranches(rows)
  const boundaryBranches = new Map<string, SemanticBranch>()
  let nextBranchId = branches.nextBranchId
  let nextColor = branches.nextColor

  for (const [rowIndex, item] of rows.entries()) {
    const sha = item.row.shaFull.toLowerCase()
    const nodeBranch = branches.branchByRow[rowIndex]!
    const nodeColor = nodeBranch.color
    const topLanes = [...lanes]
    const incomingIndexes: number[] = []
    for (let lane = 0; lane < topLanes.length; lane++) {
      if (topLanes[lane]?.target === sha) incomingIndexes.push(lane)
    }

    // Keep the vertex on its semantic branch when several paths converge.
    const primaryIncoming = incomingIndexes.find(
      (incomingLane) => topLanes[incomingLane]!.branch.id === nodeBranch.id,
    )
    const lane = primaryIncoming ?? incomingIndexes[0] ?? firstFreeLane(lanes)
    const incoming = incomingIndexes.map((incomingLane) => ({
      lane: incomingLane,
      color: topLanes[incomingLane]!.branch.color,
    }))

    for (const incomingLane of incomingIndexes) lanes[incomingLane] = null
    lanes[lane] = null

    const outgoingPaths: Array<{ path: PendingLane; color: number }> = []
    const parents = item.row.parents.map((parent) => parent.toLowerCase())
    for (const [parentIndex, parent] of parents.entries()) {
      let pathBranch: SemanticBranch
      if (parentIndex === 0) {
        // A normal branch owns its first-parent edge all the way to the parent,
        // even when another active branch is also waiting for that commit.
        pathBranch = nodeBranch
      } else {
        // An additional merge edge is drawn as part of the parent branch and
        // may attach to that branch's existing route.
        const loadedBranch = branches.branchBySha.get(parent)
        if (loadedBranch) {
          pathBranch = loadedBranch
        } else {
          const boundaryBranch = boundaryBranches.get(parent)
          pathBranch = boundaryBranch ?? {
            id: nextBranchId++,
            color: nextColor++,
          }
          if (!boundaryBranch) boundaryBranches.set(parent, pathBranch)
        }
      }

      const pendingLane = lanes.findIndex(
        (path) =>
          path?.target === parent && path.branch.id === pathBranch.id,
      )
      if (pendingLane >= 0) {
        const path = lanes[pendingLane]!
        outgoingPaths.push({ path, color: pathBranch.color })
        continue
      }

      const path = { target: parent, branch: pathBranch }
      const parentLane =
        parentIndex === 0 ? lane : firstFreeLane(lanes, lane)
      lanes[parentLane] = path
      outgoingPaths.push({ path, color: pathBranch.color })
    }

    const compactLanes = lanes.filter((path): path is PendingLane => !!path)
    const bottomLaneByPath = new Map<PendingLane, number>()
    compactLanes.forEach((path, bottomLane) => {
      bottomLaneByPath.set(path, bottomLane)
    })

    const passThrough: GraphLaneTransition[] = []
    for (let from = 0; from < topLanes.length; from++) {
      const path = topLanes[from]
      if (!path || incomingIndexes.includes(from)) continue
      const to = bottomLaneByPath.get(path)
      if (to !== undefined) {
        passThrough.push({ from, to, color: path.branch.color })
      }
    }
    const outgoing = outgoingPaths.map(({ path, color }) => ({
      lane: bottomLaneByPath.get(path)!,
      color,
    }))

    layoutRows.push({ lane, nodeColor, incoming, outgoing, passThrough })
    lanes = compactLanes
  }

  return { rows: layoutRows }
}

/** Width needed by this row's node, curves, and pass-through lanes. */
function graphRowRightmostLane(layout: GraphLaneLayoutRow): number {
  return Math.max(
    layout.lane,
    ...layout.incoming.map((edge) => edge.lane),
    ...layout.outgoing.map((edge) => edge.lane),
    ...layout.passThrough.flatMap((edge) => [edge.from, edge.to]),
  )
}

export function graphRowGutterCols(layout: GraphLaneLayoutRow): number {
  return graphRowRightmostLane(layout) * 2 + 1
}

function graphColumnWidth(rightmostLane: number, compact: boolean): number {
  const required = (rightmostLane * 2 + 1) * GRAPH_COL_WIDTH
  return Math.max(
    compact ? GRAPH_COLUMN_MIN_COMPACT : GRAPH_COLUMN_MIN,
    required + (compact ? GRAPH_COLUMN_END_PAD_COMPACT : GRAPH_COLUMN_END_PAD),
  )
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

function logicalLaneColor(color: number): string {
  return GRAPH_LANE_PALETTE[color % GRAPH_LANE_PALETTE.length]!
}

/** One SVG row; paths may change columns as empty lanes compact left. */
export function GraphLaneSpans(props: {
  layout: GraphLaneLayoutRow
  isHead: boolean
  isDetached: boolean
  /** Shared by every row so descriptions begin on one vertical boundary. */
  columnWidth?: number
  rowHeight?: number
}) {
  const height = props.rowHeight ?? GRAPH_ROW_HEIGHT
  const mid = height / 2
  const width =
    props.columnWidth ?? graphRowGutterCols(props.layout) * GRAPH_COL_WIDTH
  const nodeX = physicalLaneX(props.layout.lane)
  const nodeColor = logicalLaneColor(props.layout.nodeColor)
  const strokes = []

  for (const edge of props.layout.passThrough) {
    const x1 = physicalLaneX(edge.from)
    const x2 = physicalLaneX(edge.to)
    const color = logicalLaneColor(edge.color)
    strokes.push(
      edge.from === edge.to ? (
        <line
          key={`pass-${edge.from}-${edge.to}`}
          x1={x1}
          y1={-GRAPH_LINE_OVERLAP}
          x2={x2}
          y2={height + GRAPH_LINE_OVERLAP}
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
        />
      ) : (
        <path
          key={`pass-${edge.from}-${edge.to}`}
          d={graphCurvePath(
            x1,
            -GRAPH_LINE_OVERLAP,
            x2,
            height + GRAPH_LINE_OVERLAP,
          )}
          fill="none"
          stroke={color}
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      ),
    )
  }

  for (const edge of props.layout.incoming) {
    const x = physicalLaneX(edge.lane)
    const color = logicalLaneColor(edge.color)
    strokes.push(
      edge.lane === props.layout.lane ? (
        <line
          key={`in-${edge.lane}`}
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
          key={`in-${edge.lane}`}
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

  for (const edge of props.layout.outgoing) {
    const x = physicalLaneX(edge.lane)
    const color = logicalLaneColor(edge.color)
    strokes.push(
      edge.lane === props.layout.lane ? (
        <line
          key={`out-${edge.lane}`}
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
          key={`out-${edge.lane}`}
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
  currentUpstream: string | null
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
            <CopyButton title="copy name" />
            {props.readonly ? null : ref === props.currentBranch ? (
              <>
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
                {props.currentUpstream ? (
                  <button
                    type="button"
                    class="inline-action-btn ref-action-btn"
                    title="Pull current branch · git pull --ff-only"
                    data-confirm-label="confirm pull"
                    data-confirm-busy-label="pulling…"
                    hx-post="/api/pull"
                    hx-target="#graph"
                    hx-swap="outerHTML"
                  >
                    pull
                  </button>
                ) : null}
              </>
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
  currentUpstream: string | null
  laneLayout: GraphLaneLayoutRow
  graphColumnWidth: number
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
  const laneColor = logicalLaneColor(props.laneLayout.nodeColor)
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
          columnWidth={props.graphColumnWidth}
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
          <CopyButton title="copy name" />
          {props.readonly ? null : branchPrefix === props.currentBranch ? (
            <>
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
              {props.currentUpstream ? (
                <button
                  type="button"
                  class="inline-action-btn branch-prefix-action"
                  title="Pull current branch · git pull --ff-only"
                  data-confirm-label="confirm pull"
                  data-confirm-busy-label="pulling…"
                  hx-post="/api/pull"
                  hx-target="#graph"
                  hx-swap="outerHTML"
                >
                  pull
                </button>
              ) : null}
            </>
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
        currentUpstream={props.currentUpstream}
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
          <CopyButton value={shaFull} title="copy full hash" />
        </span>
      </span>
    </div>
  )
}

type StashLanePath = {
  lane: number
  color: number
}

/** Use the first lanes and colors free at this base commit, not graph-wide. */
function stashLanePaths(
  layout: GraphLaneLayoutRow,
  count: number,
): StashLanePath[] {
  const occupiedLanes = new Set<number>([
    layout.lane,
    ...layout.incoming.map((edge) => edge.lane),
    ...layout.passThrough.map((edge) => edge.from),
  ])
  const occupiedColors = new Set<number>([
    layout.nodeColor,
    ...layout.incoming.map((edge) => edge.color),
    ...layout.passThrough.map((edge) => edge.color),
  ])
  const paths: StashLanePath[] = []
  for (let i = 0; i < count; i++) {
    let lane = 0
    while (occupiedLanes.has(lane)) lane++
    occupiedLanes.add(lane)

    let color = 0
    while (occupiedColors.has(color)) color++
    occupiedColors.add(color)
    paths.push({ lane, color })
  }
  return paths
}

function StashLaneSpans(props: {
  layout: GraphLaneLayoutRow
  priorStashPaths: StashLanePath[]
  stashPath: StashLanePath
  columnWidth: number
}) {
  const height = GRAPH_ROW_HEIGHT
  const mid = height / 2
  const activeByLane = new Map<number, number>()
  for (const edge of props.layout.incoming) {
    activeByLane.set(edge.lane, edge.color)
  }
  for (const edge of props.layout.passThrough) {
    activeByLane.set(edge.from, edge.color)
  }
  const passThrough = [
    ...[...activeByLane].map(([lane, color]) => ({ lane, color })),
    ...props.priorStashPaths,
  ].sort((a, b) => a.lane - b.lane)
  const stashX = physicalLaneX(props.stashPath.lane)
  const stashColor = logicalLaneColor(props.stashPath.color)
  return (
    <svg
      class="graph-lanes-svg graph-stash-lanes"
      viewBox={`0 0 ${props.columnWidth} ${height}`}
      style={`width:${props.columnWidth}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      {passThrough.map((edge) => {
        const x = physicalLaneX(edge.lane)
        return (
          <line
            key={edge.lane}
            x1={x}
            y1={-GRAPH_LINE_OVERLAP}
            x2={x}
            y2={height + GRAPH_LINE_OVERLAP}
            stroke={logicalLaneColor(edge.color)}
            stroke-width="1.8"
            stroke-linecap="round"
          />
        )
      })}
      <line
        x1={stashX}
        y1={mid}
        x2={stashX}
        y2={height + GRAPH_LINE_OVERLAP}
        stroke={stashColor}
        stroke-width="1.8"
        stroke-linecap="round"
      />
      <circle
        class="graph-node graph-stash-node"
        cx={stashX}
        cy={mid}
        r={GRAPH_NODE_RADIUS}
        fill="var(--bg)"
        stroke={stashColor}
        stroke-width="1.7"
      />
    </svg>
  )
}

function GraphStashLine(props: {
  stash: PreviewStashEntry
  laneLayout: GraphLaneLayoutRow
  priorStashPaths: StashLanePath[]
  stashPath: StashLanePath
  graphColumnWidth: number
}) {
  const ref = encodeURIComponent(props.stash.ref)
  const summaryUrl = `/api/stash?ref=${ref}`
  const laneColor = logicalLaneColor(props.stashPath.color)
  return (
    <div
      class="log-row log-row-commit log-row-stash"
      style={laneTintStyle(laneColor)}
    >
      <span class="graph-prefix">
        <StashLaneSpans
          layout={props.laneLayout}
          priorStashPaths={props.priorStashPaths}
          stashPath={props.stashPath}
          columnWidth={props.graphColumnWidth}
        />
      </span>
      <button
        type="button"
        class="stash-summary-btn"
        title={`View changes in ${props.stash.ref}`}
        aria-label={`View changes in ${props.stash.ref}`}
        hx-get={summaryUrl}
        hx-target="#diff"
        hx-swap="outerHTML"
      >
        <span class="ref-pill ref-pill-stash lane-tint">
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
        <span class="stash-msg">
          {props.stash.subject}
        </span>
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

/** Workspace ← repo wayfinding; `?repo=` restores card focus on the board. */
function GraphCrumb(props: { repoPath: string }) {
  const backHref = `/?repo=${encodeURIComponent(props.repoPath)}`
  return (
    <nav class="graph-crumb" aria-label="Location">
      <a class="graph-crumb-back" href={backHref} title="Back to workspace">
        ← workspace
      </a>
      <span class="graph-crumb-sep" aria-hidden="true">
        /
      </span>
      <span class="graph-repo-name" title={props.repoPath}>
        {path.basename(props.repoPath)}
      </span>
    </nav>
  )
}

export function GraphRows(props: {
  rows: GraphRow[]
  detached: boolean
  currentBranch: string | null
  currentUpstream: string | null
  stashes: PreviewStashEntry[]
  laneLayoutByRow: GraphLaneLayoutRow[]
  /** Tighter reserved graph column for multi-repository cards. */
  compact?: boolean
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

  const stashPathsByRow = props.rows.map((item, index) =>
    stashLanePaths(
      props.laneLayoutByRow[index]!,
      stashesByBase.get(item.row.shaFull)?.length ?? 0,
    )
  )
  const rightmostCommitLane = props.laneLayoutByRow.reduce(
    (max, layout) => Math.max(max, graphRowRightmostLane(layout)),
    0,
  )
  const rightmostStashLane = stashPathsByRow.reduce(
    (max, paths) =>
      paths.reduce((rowMax, path) => Math.max(rowMax, path.lane), max),
    0,
  )
  const rightmostVisibleLane = Math.max(
    rightmostCommitLane,
    rightmostStashLane,
  )
  const columnWidth = graphColumnWidth(
    rightmostVisibleLane,
    props.compact ?? false,
  )

  return (
    <>
      {props.rows.map((r, i) => {
        const laneLayout = props.laneLayoutByRow[i]
        if (!laneLayout) return null
        const stashes = stashesByBase.get(r.row.shaFull) ?? []
        const stashPaths = stashPathsByRow[i]!
        const commitLayout = stashPaths.length > 0
          ? {
              ...laneLayout,
              incoming: [...laneLayout.incoming, ...stashPaths],
            }
          : laneLayout
        return (
          <>
            {stashes.map((stash, stashIndex) => (
              <GraphStashLine
                key={stash.ref}
                stash={stash}
                laneLayout={laneLayout}
                priorStashPaths={stashPaths.slice(0, stashIndex)}
                stashPath={stashPaths[stashIndex]!}
                graphColumnWidth={columnWidth}
              />
            ))}
            <GraphCommitLine
              key={i}
              row={r.row}
              detached={props.detached}
              currentBranch={props.currentBranch}
              currentUpstream={props.currentUpstream}
              laneLayout={commitLayout}
              graphColumnWidth={columnWidth}
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
  nextLimit: number
  show: boolean
}) {
  if (!props.show) return null
  return (
    <button
      type="button"
      class="graph-load-more"
      title={`git log --date-order -n ${props.nextLimit}`}
      hx-get={`/fragment/graph?limit=${encodeURIComponent(String(props.nextLimit))}`}
      hx-target="#graph"
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
  currentUpstream: string | null
  stashes: PreviewStashEntry[]
  laneLayoutByRow: GraphLaneLayoutRow[]
  nextLimit: number
  showLoadMore: boolean
}) {
  return (
    <>
      <GraphRows
        rows={props.rows}
        detached={props.detached}
        currentBranch={props.currentBranch}
        currentUpstream={props.currentUpstream}
        stashes={props.stashes}
        laneLayoutByRow={props.laneLayoutByRow}
      />
      <GraphLoadMore
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
          <GraphCrumb repoPath={props.repoPath} />
        </div>
        <p class="msg">{props.stderr}</p>
      </div>
    )
  }

  const { head, rows, worktree } = props
  const detached = head.kind === 'detached'
  const currentBranch = head.kind === 'branch' ? head.name : null
  const currentUpstream = head.kind === 'branch' ? head.upstream ?? null : null
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
        <GraphCrumb repoPath={props.repoPath} />
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
              Switch to {head.previousBranch}
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
              currentUpstream={currentUpstream}
              stashes={props.previewStash.stashes}
              laneLayoutByRow={laneLayout.rows}
              nextLimit={props.graphNextLimit}
              showLoadMore={props.showLoadMore}
            />
          )}
        </div>
      </div>
    </div>
  )
}
