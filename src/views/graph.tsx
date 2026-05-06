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
  if (isTagToken(tokenPlain)) return 'ref-tag'
  if (tokenPlain.includes('/')) return 'ref-pill ref-pill-remote'
  return 'ref-pill ref-pill-branch'
}

/**
 * Map a UTF-16 column in the stripped graph prefix to a logical lane index.
 * git draws lane chars at even columns (`|`, `*`) and slants at odd columns
 * (`/`, `\`). Slants connect adjacent lanes; we use the OUTER lane for odd
 * columns (same rule git tracing uses).
 */
function laneOf(col: number): number {
  return col % 2 === 0 ? col / 2 : (col + 1) / 2
}

function graphCommitIsHead(decorateRaw: string): boolean {
  const decoPlain = stripAnsi(decorateRaw)
  return (
    decoPlain.includes('HEAD ->') ||
    /(^|[(,\s])HEAD([),\s]|$)/.test(decoPlain)
  )
}

function starLane(graphAnsi: string): number | null {
  const text = stripAnsi(graphAnsi)
  const idx = text.indexOf('*')
  if (idx === -1) return null
  return laneOf(idx)
}

/**
 * Which logical lane(s) draw the “HEAD ancestry” spine on this row.
 * Bright commits (`inHistory`) tint their `*` column; connector rows between
 * them tint the union of the nearest reachable commits above and below so the
 * colored thread follows the whole ancestry, not a single fixed column.
 */
function highlightLanesForRow(rows: GraphRow[], i: number): Set<number> | null {
  const r = rows[i]
  if (r.kind === 'commit') {
    if (!r.row.inHistory) return null
    const L = starLane(r.row.graphAnsi)
    return L === null ? null : new Set([L])
  }
  if (!r.betweenInHistory) return null
  const lanes = new Set<number>()
  for (let j = i - 1; j >= 0; j--) {
    const x = rows[j]
    if (x.kind === 'commit' && x.row.inHistory) {
      const L = starLane(x.row.graphAnsi)
      if (L !== null) lanes.add(L)
      break
    }
  }
  for (let j = i + 1; j < rows.length; j++) {
    const x = rows[j]
    if (x.kind === 'commit' && x.row.inHistory) {
      const L = starLane(x.row.graphAnsi)
      if (L !== null) lanes.add(L)
      break
    }
  }
  return lanes.size === 0 ? null : lanes
}

function graphLaneHighlights(rows: GraphRow[]): Array<Set<number> | null> {
  return rows.map((_, i) => highlightLanesForRow(rows, i))
}

/**
 * Render the `git --graph` prefix. Git uses `*` for the commit node; we swap
 * it for `•`. Lanes on the HEAD-reachable spine use `--accent`; others use
 * `--graph-rail-muted`.
 */
function GraphLaneSpans(props: {
  ansi: string
  highlightLanes: Set<number> | null
}) {
  const text = stripAnsi(props.ansi)
  const lanes = props.highlightLanes
  const out: JSX.Element[] = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ') {
      out.push(<span key={i}> </span>)
      continue
    }
    const onSpine = lanes !== null && lanes.has(laneOf(i))
    if (ch === '*') {
      const color = onSpine ? 'var(--accent)' : 'var(--graph-rail-muted)'
      out.push(
        <span key={i} class="graph-node" style={`color:${color}`}>
          {'\u2022'}
        </span>,
      )
      continue
    }
    const styleStr = onSpine
      ? 'color:var(--accent);font-weight:600;opacity:0.52'
      : 'color:var(--graph-rail-muted);font-weight:600;opacity:0.62'
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
  currentBranch: string | null
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
            <span
              key={idx}
              class="ref-tag"
              title={`tag ${name}`}
            >
              {TAG_ICO}
              <span class="ref-tag-name">{name}</span>
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
            </span>
          )
        }
        return (
          <span
            key={idx}
            class={pillClass(t)}
            title={plain}
          >
            {plain}
            {ref === props.currentBranch ? (
              <button
                type="button"
                class="inline-action-btn ref-action-btn"
                title="git push"
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
}) {
  const { graphAnsi, shaFull, shaShort, decorateRaw, subject, date, inHistory } =
    props.row
  const isHead = graphCommitIsHead(decorateRaw)
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
        <GraphLaneSpans ansi={graphAnsi} highlightLanes={props.highlightLanes} />
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
          title={`branch: ${branchPrefix}`}
        >
          {branchPrefix}
          {branchPrefix === props.currentBranch ? (
            <button
              type="button"
              class="inline-action-btn branch-prefix-action"
              title="git push"
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
        <GraphLaneSpans ansi={props.ansi} highlightLanes={props.highlightLanes} />
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
      <span
        class="head-label"
        title={tip}
      >
        {label}
        {onBranch ? (
          <button
            type="button"
            class="inline-action-btn head-branch-action"
            title="git push"
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

function LogLines(props: {
  rows: GraphRow[]
  detached: boolean
  currentBranch: string | null
  laneHighlights: Array<Set<number> | null>
}) {
  if (props.rows.length === 0) {
    return <div class="log-lines empty">(no commits yet)</div>
  }

  return (
    <div class="log-lines">
      {props.rows.map((r, i) =>
        r.kind === 'commit' ? (
          <GraphCommitLine
            key={i}
            row={r.row}
            detached={props.detached}
            currentBranch={props.currentBranch}
            highlightLanes={props.laneHighlights[i] ?? null}
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
    </div>
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
        <LogLines
          rows={rows}
          detached={detached}
          currentBranch={currentBranch}
          laneHighlights={laneHighlights}
        />
        {props.showLoadMore ? (
          <button
            type="button"
            class="graph-load-more"
            title={`git log --graph -n ${props.graphNextLimit}`}
            hx-get={`/fragment/graph?limit=${encodeURIComponent(String(props.graphNextLimit))}`}
            hx-target="#graph"
            hx-swap="outerHTML"
          >
            load more
          </button>
        ) : null}
      </div>
    </div>
  )
}
