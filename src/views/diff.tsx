/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import type {
  CommitFile,
  CommitSummary,
  TagInfo,
  WorkTreeActionOp,
  WorkTreeChangeKind,
} from '../git'

const TAG_ICO = raw(
  `<svg class="tag-ico" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
)

const OPEN_ICO = raw(
  `<svg class="open-ico" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
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

function diffLineClass(line: string): string {
  if (line.startsWith('+++ ') || line.startsWith('--- ')) return 'diff-meta-line'
  if (line.startsWith('@@')) return 'diff-hunk'
  if (line.startsWith('+')) return 'diff-add'
  if (line.startsWith('-')) return 'diff-del'
  return 'diff-ctx'
}

function diffLineContent(line: string, cls: string): string {
  if (cls === 'diff-add' || cls === 'diff-del') return line.slice(1)
  if (cls === 'diff-ctx' && line.startsWith(' ')) return line.slice(1)
  return line
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

/** Per-file boilerplate (`diff --git`, blob hashes, `---`/`+++`, no-newline marker) — useless when caller already shows the file path. */
function isCompactNoiseLine(line: string): boolean {
  return (
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('\\ No newline')
  )
}

/** Capture the section blurb after `@@ -X,Y +A,B @@ ` (function name / header) — the only useful bit of a hunk header. */
const HUNK_RE = /^@@\s+-\d+(?:,\d+)?\s+\+\d+(?:,\d+)?\s+@@\s*(.*)$/
function compactHunkContext(line: string): string {
  const m = HUNK_RE.exec(line)
  return m && m[1] ? m[1].trim() : ''
}

/** Unified diff body. `compact` strips patch framing and replaces hunk headers (`@@ … @@ ctx`) with just `ctx` (or omits them). */
export function DiffPatchBody(props: { text: string; compact?: boolean }) {
  let lines = props.text.split('\n')
  if (props.compact) {
    lines = lines.filter((l) => !isCompactNoiseLine(l))
    while (lines.length > 0 && lines[0]!.trim() === '') lines.shift()
    while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
  }
  let hunksSeen = 0
  return (
    <pre class="diff-body diff-patch-pre">
      {lines.map((line, i) => {
        if (props.compact && line.startsWith('@@')) {
          const ctx = compactHunkContext(line)
          const isFirst = hunksSeen === 0
          hunksSeen++
          if (isFirst && !ctx) return null
          const cls = `diff-hunk diff-hunk-compact${isFirst ? ' diff-hunk-first' : ''}`
          return (
            <span key={i} class={cls}>
              {ctx}
              {'\n'}
            </span>
          )
        }
        const cls = diffLineClass(line)
        return (
          <span key={i} class={cls}>
            {diffLineContent(line, cls)}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}

export type WorkTreeDiffPanelProps =
  | {
      ok: true
      kind: WorkTreeChangeKind
      displayPath: string
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
  const openUrl = `/api/worktree/open?kind=${props.kind}&path=${encodeURIComponent(props.displayPath)}`
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
        <div class="diff-subject" title={props.displayPath}>
          <button
            type="button"
            class="diff-subject-open"
            title={`Open ${props.displayPath} in Sublime`}
            aria-label={`Open ${props.displayPath} in Sublime`}
            hx-post={openUrl}
            hx-swap="none"
          >
            <span class="diff-subject-path">{props.displayPath}</span>
            {OPEN_ICO}
          </button>
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
          <DiffPatchBody text={props.patch} compact />
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
