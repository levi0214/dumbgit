/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import type {
  CommitFile,
  CommitSummary,
  TagInfo,
  WorkTreeActionOp,
  WorkTreeChangeKind,
} from '../git'
import { CopyButton } from './copy'

const TAG_ICO = raw(
  `<svg class="tag-ico" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
)

export type DiffPanelProps =
  | { state: 'empty'; swapOob?: boolean }
  | {
      state: 'summary'
      sha: string
      summary: CommitSummary
      fileUrlBase?: string
      patchPlaceholder?: string
    }
  | { state: 'error'; sha: string; stderr: string }

export type DiffRow =
  | { kind: 'hunk'; range: string; text: string; first: boolean; n: number }
  | { kind: 'meta'; text: string }
  | {
      kind: 'ctx'
      oldNo?: number
      newNo?: number
      text: string
      /** Word-level split; `chg` marks the tokens that actually changed within this line (never set for ctx). */
      word?: { t: string; chg: boolean }[]
    }
  | {
      kind: 'add'
      oldNo?: number
      newNo?: number
      text: string
      /** Word-level split; `chg` marks the tokens that actually changed within this line. */
      word?: { t: string; chg: boolean }[]
    }
  | {
      kind: 'del'
      oldNo?: number
      newNo?: number
      text: string
      /** Word-level split; `chg` marks the tokens that actually changed within this line. */
      word?: { t: string; chg: boolean }[]
    }

/** Unified-diff framing git emits around a single file's patch — redundant when the UI already shows the path. */
const NOISE_RE =
  /^(?:diff --git |index |(?:old|new|deleted) file mode |similarity index |dissimilarity index |rename (?:from|to) |copy (?:from|to) |--- |\+\+\+ |\\ No newline)/

/** `@@ -A[,B] +C[,D] @@ ctx` → captures the old/new ranges and the hunk's section header. */
const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: (.*))?$/

function tokenize(s: string): string[] {
  return s.match(/[^\s]+|\s+/g) ?? []
}

/**
 * Above this many tokens per line, word-level LCS (O(n·m)) can stall on
 * minified or embedded-data lines; the pair then renders plain line colors.
 * Hand-written lines are typically 5–50 tokens.
 */
const WORD_DIFF_MAX_TOKENS = 500

/** Render tabs as three spaces so column alignment survives display (pi does the same). */
function replaceTabs(s: string): string {
  return s.replace(/\t/g, '   ')
}

/** Word-level diff of two strings via LCS. Tokens matched on both sides are `same`; everything else is `chg`. */
export function diffWords(a: string, b: string): {
  a: { t: string; same: boolean }[]
  b: { t: string; same: boolean }[]
} {
  const A = tokenize(a)
  const B = tokenize(b)
  const n = A.length
  const m = B.length
  const dp: number[][] = Array.from(
    { length: n + 1 },
    () => new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const ra: { t: string; same: boolean }[] = []
  const rb: { t: string; same: boolean }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ra.push({ t: A[i]!, same: true })
      rb.push({ t: B[j]!, same: true })
      i++
      j++
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ra.push({ t: A[i]!, same: false })
      i++
    } else {
      rb.push({ t: B[j]!, same: false })
      j++
    }
  }
  while (i < n) {
    ra.push({ t: A[i]!, same: false })
    i++
  }
  while (j < m) {
    rb.push({ t: B[j]!, same: false })
    j++
  }
  return { a: ra, b: rb }
}

/** Consecutive `-`/`+` runs inside a hunk. Only a clean 1:1 replacement gets a word-level diff (pi's rule) — pairing more than one line per side misaligns and reads as noise. */
function annotateWordDiffs(rows: DiffRow[]): void {
  let i = 0
  while (i < rows.length) {
    if (rows[i]!.kind !== 'del') {
      i++
      continue
    }
    const dels: Extract<DiffRow, { kind: 'del' }>[] = []
    while (i < rows.length && rows[i]!.kind === 'del') {
      dels.push(rows[i]! as Extract<DiffRow, { kind: 'del' }>)
      i++
    }
    const adds: Extract<DiffRow, { kind: 'add' }>[] = []
    while (i < rows.length && rows[i]!.kind === 'add') {
      adds.push(rows[i]! as Extract<DiffRow, { kind: 'add' }>)
      i++
    }
    if (dels.length !== 1 || adds.length !== 1) continue
    if (
      tokenize(dels[0]!.text).length > WORD_DIFF_MAX_TOKENS ||
      tokenize(adds[0]!.text).length > WORD_DIFF_MAX_TOKENS
    ) {
      continue
    }
    const wd = diffWords(dels[0]!.text, adds[0]!.text)
    dels[0]!.word = wd.a.map((t) => ({ t: t.t, chg: !t.same }))
    adds[0]!.word = wd.b.map((t) => ({ t: t.t, chg: !t.same }))
  }
}

/** Parse a unified diff into rows with old/new line numbers; del/add runs are paired for word-level highlighting. */
export function parseDiff(text: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo: number | undefined
  let newNo: number | undefined
  let hunks = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const m = HUNK_RE.exec(line)
      const range = m
        ? `-${m[1]}${m[2] ? `,${m[2]}` : ''} +${m[3]}${m[4] ? `,${m[4]}` : ''}`
        : ''
      oldNo = m && m[1] !== '0' ? Number(m[1]) : undefined
      newNo = m && m[3] !== '0' ? Number(m[3]) : undefined
      rows.push({
        kind: 'hunk',
        range,
        text: replaceTabs(m?.[5]?.trim() ?? ''),
        first: hunks === 0,
        n: hunks,
      })
      hunks++
      continue
    }
    if (NOISE_RE.test(line)) continue
    const head = line[0]
    if (head === ' ') {
      rows.push({ kind: 'ctx', oldNo, newNo, text: replaceTabs(line.slice(1)) })
      if (oldNo !== undefined) oldNo++
      if (newNo !== undefined) newNo++
    } else if (head === '-') {
      rows.push({ kind: 'del', oldNo, newNo, text: replaceTabs(line.slice(1)) })
      if (oldNo !== undefined) oldNo++
    } else if (head === '+') {
      rows.push({ kind: 'add', oldNo, newNo, text: replaceTabs(line.slice(1)) })
      if (newNo !== undefined) newNo++
    } else {
      rows.push({ kind: 'meta', text: line })
    }
  }
  const isBlank = (r: DiffRow) => r.text.trim() === '' && (r.kind === 'ctx' || r.kind === 'meta')
  while (rows.length > 0 && isBlank(rows[0]!)) rows.shift()
  while (rows.length > 0 && isBlank(rows[rows.length - 1]!)) rows.pop()
  annotateWordDiffs(rows)
  return rows
}

function DiffRowView({ row }: { row: DiffRow }) {
  if (row.kind === 'hunk') {
    return (
      <div
        class={`diff-row diff-row-hunk${row.first ? ' diff-hunk-first' : ''}`}
        id={`diff-hunk-${row.n}`}
      >
        <span class="diff-ln diff-ln-old" />
        <span class="diff-ln diff-ln-new" />
        <span class="diff-ln-text">
          {row.range ? <span class="diff-hunk-range">@@ {row.range} @@</span> : null}
          {row.text ? <span class="diff-hunk-ctx"> {row.text}</span> : null}
        </span>
      </div>
    )
  }
  if (row.kind === 'meta') {
    return (
      <div class="diff-row diff-row-meta">
        <span class="diff-ln diff-ln-old" />
        <span class="diff-ln diff-ln-new" />
        <span class="diff-ln-text">{row.text}</span>
      </div>
    )
  }
  return (
    <div class={`diff-row diff-row-${row.kind}`}>
      <span class="diff-ln diff-ln-old">{row.kind === 'add' ? '' : (row.oldNo ?? '')}</span>
      <span class="diff-ln diff-ln-new">{row.kind === 'del' ? '' : (row.newNo ?? '')}</span>
      <span class="diff-ln-text">
        {row.word
          ? row.word.map((w, j) =>
              w.chg && !/^\s+$/.test(w.t) ? (
                <span key={j} class="diff-word-chg">{w.t}</span>
              ) : (
                w.t
              ),
            )
          : row.text}
      </span>
    </div>
  )
}

function FileNums(props: { file: CommitFile }) {
  const { file: f } = props
  if (f.binary) {
    return <span class="file-num file-num-binary">binary</span>
  }
  if (
    f.added === undefined ||
    f.deleted === undefined ||
    !Number.isFinite(f.added) ||
    !Number.isFinite(f.deleted)
  ) {
    return null
  }
  return (
    <span class="file-num">
      <span class="file-num-add">+{f.added}</span>
      <span class="file-num-del"> −{f.deleted}</span>
    </span>
  )
}

type CommitLineStats = {
  added: number
  deleted: number
}

export type CommitStats = {
  total: CommitLineStats
  nonTest: CommitLineStats
  tests: CommitLineStats
  testFiles: number
}

/** Tests are the only special case; everything else stays "non-test". */
export function isTestFile(displayPath: string): boolean {
  const renamed = displayPath.split(' → ')
  const filePath = (renamed[renamed.length - 1] ?? displayPath)
    .trim()
    .replaceAll('\\', '/')
  const basename = filePath.split('/').pop() ?? ''
  return (
    /(^|\/)(__tests__|tests?|specs?|e2e|cypress|playwright)(\/|$)/i.test(
      filePath,
    ) ||
    /(?:^|[._-])(?:test|tests|spec)(?:[._-]|$)/i.test(basename) ||
    /(?:Test|Tests|Spec)\.[^.]+$/.test(basename)
  )
}

function emptyLineStats(): CommitLineStats {
  return { added: 0, deleted: 0 }
}

export function summarizeCommitFiles(files: CommitFile[]): CommitStats {
  const stats: CommitStats = {
    total: emptyLineStats(),
    nonTest: emptyLineStats(),
    tests: emptyLineStats(),
    testFiles: 0,
  }

  for (const file of files) {
    const test = isTestFile(file.path)
    const bucket = test ? stats.tests : stats.nonTest
    if (test) stats.testFiles += 1

    const added =
      file.added !== undefined && Number.isFinite(file.added) ? file.added : 0
    const deleted =
      file.deleted !== undefined && Number.isFinite(file.deleted)
        ? file.deleted
        : 0
    stats.total.added += added
    stats.total.deleted += deleted
    bucket.added += added
    bucket.deleted += deleted
  }

  return stats
}

function CommitLineCounts(props: { stats: CommitLineStats }) {
  const { stats } = props
  return (
    <span
      class="commit-line-counts"
      title={`${stats.added} additions, ${stats.deleted} deletions`}
    >
      <span class="file-num-add">+{stats.added}</span>
      <span class="file-num-del">−{stats.deleted}</span>
    </span>
  )
}

function shortCommitDate(raw: string): string {
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function DiffTag(props: { tag: TagInfo }) {
  const { tag } = props
  return (
    <div class="diff-tag">
      <span class="diff-tag-name" title={tag.name}>
        {TAG_ICO}
        {tag.name}
      </span>
      {tag.message ? <pre class="diff-tag-message">{tag.message}</pre> : null}
    </div>
  )
}

/** Unified diff body: line numbers plus word-level highlights on changed lines. */
export function DiffPatchBody(props: { text: string }) {
  const rows = parseDiff(props.text)
  if (rows.length === 0) {
    return <pre class="diff-body diff-patch-empty">(no diff)</pre>
  }
  const hunks = rows.filter(
    (r): r is Extract<DiffRow, { kind: 'hunk' }> => r.kind === 'hunk',
  )
  return (
    <div class="diff-body diff-patch-pre">
      {hunks.length > 1 ? (
        <div class="diff-hunk-nav" aria-label="jump to hunk">
          {hunks.map((h) => (
            <button
              type="button"
              class="diff-hunk-jump"
              data-hunk={h.n}
              title={`@@ ${h.range} @@${h.text ? ` ${h.text}` : ''}`}
            >
              {h.range}
            </button>
          ))}
        </div>
      ) : null}
      {rows.map((row, i) => (
        <DiffRowView key={i} row={row} />
      ))}
    </div>
  )
}

export type WorkTreeDiffPanelProps =
  | {
      ok: true
      kind: WorkTreeChangeKind
      displayPath: string
      absolutePath: string
      patch: string
    }
  | { ok: false; stderr: string }

export function WorkTreeDiffPanel(props: WorkTreeDiffPanelProps) {
  if (!props.ok) {
    return (
      <div id="diff" class="diff-panel diff-error diff-worktree-file">
        <div class="diff-head">
          <div class="diff-subject">could not load diff</div>
        </div>
        <pre class="diff-body">{props.stderr}</pre>
      </div>
    )
  }

  const actionUrl = (op: WorkTreeActionOp) =>
    `/api/worktree/action?op=${op}&kind=${props.kind}&path=${encodeURIComponent(props.displayPath)}`
  const primary =
    props.kind === 'staged'
      ? {
          op: 'unstage' as const,
          label: 'unstage',
          title: `git restore --staged -- ${props.displayPath}`,
        }
      : {
          op: 'stage' as const,
          label: 'stage',
          title: `git add -- ${props.displayPath}`,
        }

  const patch = props.patch.trim()

  return (
    <div
      id="diff"
      class="diff-panel diff-summary diff-worktree-file"
      data-worktree-kind={props.kind}
      data-worktree-path={props.displayPath}
    >
      <div class="diff-head">
        <div
          class="diff-subject"
          data-copy={props.absolutePath}
          title={props.absolutePath}
        >
          <span class="diff-subject-path">{props.displayPath}</span>
          <CopyButton title={`copy path for ${props.displayPath}`} />
        </div>
        <div class="worktree-head-actions">
          <button
            type="button"
            class="worktree-action-btn"
            title={primary.title}
            hx-post={actionUrl(primary.op)}
            hx-swap="none"
          >
            {primary.label}
          </button>
          {props.kind === 'staged' ? null : (
            <button
              type="button"
              class="worktree-action-btn worktree-action-danger"
              title={`Discard changes to ${props.displayPath}? This cannot be undone.`}
              data-confirm-label="confirm discard"
              hx-post={actionUrl('discard')}
              hx-swap="none"
            >
              discard
            </button>
          )}
        </div>
      </div>
      <div id="diff-patch-slot" class="diff-patch-slot diff-patch-slot-inline">
        {patch ? (
          <DiffPatchBody text={props.patch} />
        ) : (
          <pre class="diff-body diff-patch-empty">(no diff)</pre>
        )}
      </div>
    </div>
  )
}

export function DiffPanel(props: DiffPanelProps) {
  if (props.state === 'empty') {
    const oob = props.swapOob ? ({ 'hx-swap-oob': 'true' } as const) : {}
    return (
      <div id="diff" class="diff-panel diff-empty" {...oob}>
        (click a commit message to see changed files)
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

  const { sha, summary } = props
  const stats = summarizeCommitFiles(summary.files)

  return (
    <div id="diff" class="diff-panel diff-summary">
      <input type="hidden" id="viewing-sha" value={sha} autocomplete="off" />
      <div class="diff-head">
        <div class="diff-subject">{summary.subject}</div>
        <div class="diff-meta" title={summary.date}>
          {summary.author} · {shortCommitDate(summary.date)}
        </div>
        {summary.body ? (
          <pre class="diff-message-body">{summary.body}</pre>
        ) : null}
        {summary.tags.length > 0 ? (
          <div class="diff-tags">
            {summary.tags.map((tag) => (
              <DiffTag tag={tag} />
            ))}
          </div>
        ) : null}
      </div>

      <div
        id="diff-files-trigger"
        class="diff-files-block"
      >
        <div class="diff-files-head">
          <span>
            changed files{' '}
            <span class="diff-files-count">({summary.files.length})</span>
          </span>
          <CommitLineCounts stats={stats.total} />
        </div>
        {stats.testFiles > 0 ? (
          <div class="commit-stats-breakdown">
            <span class="commit-stats-kind">
              <span class="commit-stats-label">non-test</span>
              <CommitLineCounts stats={stats.nonTest} />
            </span>
            <span class="commit-stats-separator" aria-hidden="true">
              ·
            </span>
            <span class="commit-stats-kind">
              <span class="commit-stats-label">tests</span>
              <CommitLineCounts stats={stats.tests} />
            </span>
          </div>
        ) : null}
        {summary.files.length > 0 ? (
          <ul class="diff-files">
            {summary.files.map((f) => {
              const fileUrl = props.fileUrlBase
                ? `${props.fileUrlBase}&path=${encodeURIComponent(f.path)}`
                : `/api/commit/${encodeURIComponent(sha)}/file?path=${encodeURIComponent(f.path)}`
              return (
                <li>
                  <button
                    type="button"
                    class="diff-file-btn"
                    title={f.path}
                    hx-get={fileUrl}
                    hx-target="#diff-patch-slot"
                    hx-swap="innerHTML"
                  >
                    <span class={`file-status file-${f.status[0] ?? '_'}`}>
                      {f.status}
                    </span>
                    <span class="file-path">{f.path}</span>
                    <FileNums file={f} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div class="diff-files-empty">(no file changes)</div>
        )}
      </div>

      <div id="diff-patch-slot" class="diff-patch-slot">
        {props.patchPlaceholder ? (
          <div class="diff-patch-placeholder">
            {props.patchPlaceholder}
          </div>
        ) : null}
      </div>
    </div>
  )
}
