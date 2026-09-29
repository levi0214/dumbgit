/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import type { CompareResult } from '../compare'
import { parseDiff, type DiffRow } from './diff'

type CodeRow = Extract<DiffRow, { kind: 'ctx' | 'add' | 'del' }>
export type SplitRow = { left?: CodeRow; right?: CodeRow; changed: boolean }
export function splitRows(patch: string): SplitRow[] {
  const source = parseDiff(patch, true)
  const rows: SplitRow[] = []
  for (let i = 0; i < source.length;) {
    const row = source[i++]!
    if (row.kind === 'ctx') rows.push({ left: row, right: row, changed: false })
    else if (row.kind === 'del' || row.kind === 'add') {
      const dels: CodeRow[] = row.kind === 'del' ? [row] : []
      const adds: CodeRow[] = row.kind === 'add' ? [row] : []
      while (source[i]?.kind === 'del' && !adds.length) dels.push(source[i++] as CodeRow)
      while (source[i]?.kind === 'add') adds.push(source[i++] as CodeRow)
      for (let j = 0; j < Math.max(dels.length, adds.length); j++) rows.push({ left: dels[j], right: adds[j], changed: true })
    }
  }
  return rows
}
function Line({ row, side }: { row?: CodeRow; side: 'left' | 'right' }) {
  return <div class={`compare-code ${row?.kind ?? 'blank'}`}><span class="compare-ln">{side === 'left' ? row?.oldNo : row?.newNo}</span><code>{row?.word ? row.word.map(w => <span class={w.chg ? 'diff-word-chg' : undefined}>{w.t}</span>) : row?.text}</code></div>
}
function Row({ row, id }: { row: SplitRow; id?: string }) {
  return <div class="compare-row" id={id}><Line row={row.left} side="left" /><Line row={row.right} side="right" /></div>
}
function SplitDiff({ patch }: { patch: string }) {
  const rows = splitRows(patch)
  if (!rows.length) return <pre class="compare-message">{patch || 'No content changes.'}</pre>
  const blocks = []
  let change = 0
  for (let i = 0; i < rows.length;) {
    if (rows[i]!.changed) {
      const id = i === 0 || !rows[i - 1]?.changed ? `compare-change-${change++}` : undefined
      blocks.push(<Row row={rows[i++]!} id={id} />)
      continue
    }
    const start = i
    while (i < rows.length && !rows[i]!.changed) i++
    const end = i
    const visibleStart = start === 0 ? start : Math.min(start + 3, end)
    const visibleEnd = end === rows.length ? end : Math.max(visibleStart, end - 3)
    if (visibleEnd - visibleStart <= 6) {
      blocks.push(...rows.slice(start, end).map(row => <Row row={row} />))
    } else {
      blocks.push(...rows.slice(start, visibleStart).map(row => <Row row={row} />))
      blocks.push(<details class="compare-context"><summary>Show {visibleEnd - visibleStart} unchanged lines</summary>{rows.slice(visibleStart, visibleEnd).map(row => <Row row={row} />)}</details>)
      blocks.push(...rows.slice(visibleEnd, end).map(row => <Row row={row} />))
    }
  }
  return <div class="compare-scroll">{blocks}</div>
}
export function CompareView(props: { repo: string; name: string; scope: string; result?: CompareResult; error?: string }) {
  const { result: r } = props
  const url = (file: string) => '/compare?' + new URLSearchParams({ repo: props.repo, base: r!.base, target: r!.target, scope: props.scope, file })
  const label = (value: string) => value === 'worktree' ? 'Working tree' : r?.refs.find(ref => ref.value === value)?.label ?? value
  return <main class="compare-page">
    <header class="compare-toolbar"><a href="/">← Workspace</a><a href={'/repo?repo=' + encodeURIComponent(props.repo)}>{props.name}</a><strong>Compare</strong></header>
    <form class="compare-toolbar" action="/compare">
      <input type="hidden" name="repo" value={props.repo} />
      <label>Base <select name="base">{r?.refs.map(ref => <option value={ref.value} selected={ref.value === r.base}>{ref.label}</option>)}</select></label>
      <span>→</span><label>Target <select name="target">{r?.refs.map(ref => <option value={ref.value} selected={ref.value === r.target}>{ref.label}</option>)}<option value="worktree" selected={r?.target === 'worktree'}>Working tree</option></select></label>
      <label class="compare-scope">Path <input name="scope" value={props.scope} placeholder="All files, or contracts/src/" /></label><button>Compare</button>
    </form>
    <div class="compare-note">Direct comparison of two versions.{r?.target === 'worktree' ? ' Working tree includes staged and unstaged tracked changes; untracked files are excluded.' : ''} <a href="">Refresh</a></div>
    {props.error ? <pre class="compare-message" role="alert">{props.error}</pre> : <div class="compare-content">
      <aside class="compare-files"><div class="compare-files-heading">Changed files · {r?.files.length}</div>{r?.files.map(file => <a href={url(file.path)} hx-get={url(file.path)} hx-select="#compare-reader" hx-target="#compare-reader" hx-swap="outerHTML" hx-sync=".compare-files:replace" hx-push-url="true" aria-current={r.selected?.path === file.path ? 'true' : undefined} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}><span class={`file-status file-${file.status[0]}`}>{file.status[0]}</span><span>{file.path}</span></a>)}</aside>
      <section id="compare-reader" class="compare-reader" data-file={r?.selected?.path}>
        {r?.selected ? <><div class="compare-file-head"><span>{r.selected.oldPath ? `${r.selected.oldPath} → ` : ''}{r.selected.path}</span><button type="button" data-compare-jump="-1" aria-label="Previous change">↑</button><button type="button" data-compare-jump="1" aria-label="Next change">↓</button></div><div class="compare-row compare-labels"><span>{label(r.base)}</span><span>{label(r.target)}</span></div><SplitDiff patch={r.patch} /></> : <p class="compare-message">No differences{props.scope ? ' in this path' : ''}.</p>}
      </section>
    </div>}
    <script>{raw(`document.addEventListener('click', function(e) {
      var button = e.target.closest('[data-compare-jump]');
      if (!button) return;
      var reader = document.querySelector('#compare-reader');
      var changes = Array.from(reader.querySelectorAll('[id^="compare-change-"]'));
      var current = Number(reader.dataset.changeIndex || '-1');
      current = Math.max(0, Math.min(changes.length - 1, current + Number(button.dataset.compareJump)));
      if (changes[current]) { reader.dataset.changeIndex = current; changes[current].scrollIntoView({block:'center'}); }
    });
    document.addEventListener('htmx:afterSwap', function(e) {
      if (e.detail.target.id !== 'compare-reader') return;
      var selected = document.querySelector('#compare-reader').dataset.file;
      document.querySelectorAll('.compare-files a').forEach(function(a) {
        if (new URL(a.href).searchParams.get('file') === selected) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    });`)}</script>
  </main>
}
