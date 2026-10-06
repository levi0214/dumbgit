/** @jsxImportSource hono/jsx */
import type { JSX } from 'hono/jsx/jsx-runtime'
import { raw } from 'hono/html'
import type { CompareFile, CompareResult } from '../compare'
import { parseDiff, type DiffRow } from './diff'
import { highlightLines, syntaxSpans, type SyntaxToken } from './syntax'

type CodeRow = Extract<DiffRow, { kind: 'ctx' | 'add' | 'del' }>
const MAX_DISPLAY_ROWS = 5000
export type SplitRow = { left?: CodeRow; right?: CodeRow; changed: boolean; leftSyntax?: SyntaxToken[]; rightSyntax?: SyntaxToken[] }
export function splitRows(patch: string, maxRows = Infinity): SplitRow[] {
  const source = parseDiff(patch, true, maxRows)
  const rows: SplitRow[] = []
  for (let i = 0; i < source.length;) {
    const row = source[i++]!
    if (row.kind === 'ctx') rows.push({ left: row, right: row, changed: false })
    else if (row.kind === 'del' || row.kind === 'add') {
      const dels: CodeRow[] = row.kind === 'del' ? [row] : []
      const adds: CodeRow[] = row.kind === 'add' ? [row] : []
      while (source[i]?.kind === 'del' && !adds.length) dels.push(source[i++] as CodeRow)
      while (source[i]?.kind === 'add') adds.push(source[i++] as CodeRow)
      let d = 0
      let a = 0
      const appendUntil = (endD: number, endA: number) => {
        while (d < endD || a < endA) rows.push({ left: d < endD ? dels[d++] : undefined, right: a < endA ? adds[a++] : undefined, changed: true })
      }
      for (let j = 0; j < dels.length; j++) {
        const del = dels[j]!
        if (del.kind !== 'del' || del.pairedNewNo === undefined) continue
        const match = adds.findIndex(r => r.newNo === del.pairedNewNo)
        if (match < a) continue
        appendUntil(j, match)
        rows.push({ left: dels[d++], right: adds[a++], changed: true })
      }
      appendUntil(dels.length, adds.length)
    }
  }
  return rows
}
function Code({ row, syntax }: { row?: CodeRow; syntax?: SyntaxToken[] }) {
  return <>{syntax
    ? syntaxSpans(syntax, row?.word).map(s => <span style={!s.changed && s.color ? `color:${s.color}` : undefined} class={s.changed ? 'diff-word-chg' : undefined}>{s.text}</span>)
    : row?.word ? row.word.map(w => <span class={w.chg ? 'diff-word-chg' : undefined}>{w.t}</span>) : row?.text}</>
}
function Line({ row, side, syntax }: { row?: CodeRow; side: 'left' | 'right'; syntax?: SyntaxToken[] }) {
  return <div class={`compare-code ${row?.kind ?? 'blank'}`}><span class="compare-ln">{side === 'left' ? row?.oldNo : row?.newNo}</span><span class="compare-text"><code><Code row={row} syntax={syntax} /></code></span></div>
}
function colorRows(rows: SplitRow[], file: CompareFile, cachedOnly: boolean) {
  let pending = false
  for (const side of ['left', 'right'] as const) {
    const source = rows.filter(row => row[side])
    const lines = source.map(row => row[side]!.text)
    const path = side === 'left' ? file.oldPath ?? file.path : file.path
    const { tokens, pending: sidePending } = highlightLines(lines, path, cachedOnly)
    if (tokens) source.forEach((row, i) => { row[side === 'left' ? 'leftSyntax' : 'rightSyntax'] = tokens[i] })
    if (sidePending) pending = true
  }
  return pending
}
// The text accompanies HTML so a changed working tree cannot color stale lines.
export function compareColors(patch: string, file: CompareFile) {
  const rows = splitRows(patch, MAX_DISPLAY_ROWS)
  if (rows.length > MAX_DISPLAY_ROWS) return []
  colorRows(rows, file, false)
  return rows.flatMap(row => (['left', 'right'] as const).map(side => ({
    text: row[side]?.text ?? '',
    html: (<Code row={row[side]} syntax={row[side === 'left' ? 'leftSyntax' : 'rightSyntax']} />).toString(),
  })))
}
function Row({ row, id }: { row: SplitRow; id?: string }) {
  return <div class="compare-row" id={id}><Line row={row.left} side="left" syntax={row.leftSyntax} /><Line row={row.right} side="right" syntax={row.rightSyntax} /></div>
}
function SplitDiff({ patch, file }: { patch: string; file: CompareFile }) {
  const rows = splitRows(patch, MAX_DISPLAY_ROWS)
  if (!rows.length) return <pre class="compare-message">{patch || 'No content changes.'}</pre>
  // Full DOM rendering becomes noticeably slow for very long files in Safari.
  if (rows.length > MAX_DISPLAY_ROWS) return <p class="compare-message">This diff exceeds the 5,000-row display limit. Open this file in your editor or inspect it with git.</p>
  const pending = colorRows(rows, file, true)
  const maxLine = rows.reduce((max, row) => Math.max(max, row.left?.oldNo ?? 0, row.right?.newNo ?? 0), 1)
  const lineDigits = String(maxLine).length
  const blocks = []
  const markers = []
  for (let i = 0; i < rows.length;) {
    if (!rows[i]!.changed) {
      blocks.push(<Row row={rows[i++]!} />)
      continue
    }
    const start = i
    while (i < rows.length && rows[i]!.changed) i++
    const group = rows.slice(start, i)
    const index = markers.length
    const id = `compare-change-${index}`
    const deleted = group.some(row => row.left?.kind === 'del')
    const added = group.some(row => row.right?.kind === 'add')
    const label = `${deleted && added ? 'Modified' : deleted ? 'Deleted' : 'Added'} lines · change ${index + 1}`
    // Map each side's occupied runs, leaving alignment padding uncolored.
    const segments = (['left', 'right'] as const).flatMap(side => {
      const kind = side === 'left' ? 'del' : 'add'
      const spans = []
      for (let j = 0; j < group.length;) {
        if (group[j]![side]?.kind !== kind) { j++; continue }
        const start = j++
        while (j < group.length && group[j]![side]?.kind === kind) j++
        spans.push(<span class={`compare-marker-${kind}`}
          style={`top:min(${start / group.length * 100}%, calc(100% - 4px));height:${(j - start) / group.length * 100}%`} />)
      }
      return spans
    })
    blocks.push(<div id={id} class="compare-change">{group.map(row => <Row row={row} />)}</div>)
    markers.push(
      <button type="button" class="compare-marker" data-compare-change={index}
        style={`top:min(${start / rows.length * 100}%, calc(100% - 4px));height:${group.length / rows.length * 100}%`}
        title={label} aria-label={label} aria-controls={id}>
        {segments}
      </button>,
    )
  }
  return <><div class="compare-document" data-color-pending={pending ? 'true' : undefined} style={`--compare-line-digits: ${lineDigits}`}>
    <div class="compare-scroll">{blocks}</div>
    <nav class="compare-overview" aria-label="Changes in this file">
      <div class="compare-viewport" aria-hidden="true" />
      {markers}
    </nav>
  </div>
    <div class="compare-horizontal">
      {(['left', 'right'] as const).map(side => <div class="compare-x-scroll" data-side={side} tabindex={0} role="region" aria-label="Scroll both versions horizontally"><div /></div>)}
    </div>
  </>
}

const COMPARE_SCRIPT = `
(function () {
  // History restoration can reinsert this script. Install document handlers once.
  if (window.dumbgitCompareInstalled) return;
  window.dumbgitCompareInstalled = true;
  var observer;
  var scroll;
  var viewport;
  var frame;
  var paintFrame;
  var codes = [];
  var coloring;
  var colorFrame;
  var colorTimer;
  var rowHeight = 21;
  var horizontal = 0;
  function paintScroll() {
    paintFrame = null;
    if (!scroll || !scroll.isConnected) return;
    // Rows never wrap. Include one extra row at each edge for fractional scrolling.
    var start = Math.max(0, Math.floor(scroll.scrollTop / rowHeight) - 1) * 2;
    var end = Math.min(codes.length, (Math.ceil((scroll.scrollTop + scroll.clientHeight) / rowHeight) + 1) * 2);
    var transform = 'translateX(' + -horizontal + 'px)';
    for (var i = start; i < end; i++) {
      if (codes[i].style.transform !== transform) codes[i].style.transform = transform;
    }
    updateViewport();
  }
  function schedulePaint() {
    if (!paintFrame) paintFrame = requestAnimationFrame(paintScroll);
  }
  var closedFolders = new Set();
  function updateViewport() {
    if (!scroll || !viewport) return;
    viewport.style.top = (scroll.scrollTop / scroll.scrollHeight * 100) + '%';
    viewport.style.height = (scroll.clientHeight / scroll.scrollHeight * 100) + '%';
  }
  function measure() {
    frame = null;
    if (!scroll || !scroll.isConnected) return;
    var top = scroll.getBoundingClientRect().top - scroll.scrollTop;
    var height = scroll.scrollHeight;
    var scrollbarWidth = scroll.offsetWidth - scroll.clientWidth;
    var groups = scroll.querySelectorAll('.compare-change');
    var markers = document.querySelectorAll('.compare-marker');
    // Read all geometry before writing styles.
    var positions = Array.from(groups, function(group) {
      var rect = group.getBoundingClientRect();
      return { top: (rect.top - top) / height * 100, height: rect.height / height * 100 };
    });
    var reader = scroll.closest('.compare-reader');
    var bars = reader.querySelectorAll('.compare-x-scroll');
    var width = 0;
    codes.forEach(function(code) {
      width = Math.max(width, code.scrollWidth);
    });
    var gutter = scroll.querySelector('.compare-ln').getBoundingClientRect().width;
    rowHeight = scroll.querySelector('.compare-code').getBoundingClientRect().height;
    reader.style.setProperty('--compare-scrollbar-width', scrollbarWidth + 'px');
    markers.forEach(function(marker, i) {
      marker.style.top = 'min(' + positions[i].top + '%, calc(100% - 4px))';
      marker.style.height = positions[i].height + '%';
    });
    bars.forEach(function(bar) {
      bar.firstElementChild.style.width = (width + gutter + 12) + 'px';
      bar.onscroll = function() {
        var left = bar.scrollLeft;
        // The other scrollbar emits an event too; don't feed it back.
        if (left === horizontal) return;
        horizontal = left;
        bars.forEach(function(other) {
          if (other !== bar) other.scrollLeft = left;
        });
        schedulePaint();
      };
    });
    if (bars.length) bars[0].onscroll();
    schedulePaint();
    updateViewport();
  }
  function scheduleMeasure() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  function deferColors() {
    var reader = scroll.closest('.compare-reader');
    var content = reader.querySelector('.compare-document');
    if (!content || content.dataset.colorPending !== 'true') return;
    coloring = new AbortController();
    var signal = coloring.signal;
    var nodes = codes.slice();
    var url = new URL(reader.dataset.colorUrl, location.href);
    // Give the plain content a paint before requesting and applying colors.
    colorFrame = requestAnimationFrame(function() {
      colorFrame = requestAnimationFrame(function() {
        colorFrame = null;
        fetch(url, { signal: signal }).then(function(response) {
          if (!response.ok) throw new Error('Color request failed');
          return response.json();
        }).then(function(cells) {
          if (signal.aborted || !reader.isConnected || cells.length !== nodes.length) return;
          if (cells.some(function(cell, i) { return cell.text !== nodes[i].textContent; })) return;
          var start = Math.max(0, Math.floor(scroll.scrollTop / rowHeight) - 1) * 2;
          var order = nodes.map(function(_, i) { return (start + i) % nodes.length; });
          var next = 0;
          function apply() {
            colorFrame = null;
            if (signal.aborted || !reader.isConnected) return;
            var selection = window.getSelection();
            // Replacing text inside an active selection would destroy it.
            if (selection && !selection.isCollapsed &&
                (reader.contains(selection.anchorNode) || reader.contains(selection.focusNode))) {
              colorTimer = setTimeout(function() { colorFrame = requestAnimationFrame(apply); }, 100);
              return;
            }
            var until = performance.now() + 6;
            do {
              var i = order[next++];
              if (nodes[i].innerHTML !== cells[i].html) nodes[i].innerHTML = cells[i].html;
            } while (next < order.length && performance.now() < until);
            if (next < order.length) colorFrame = requestAnimationFrame(apply);
            else {
              delete content.dataset.colorPending;
              scheduleMeasure();
            }
          }
          if (order.length) colorFrame = requestAnimationFrame(apply);
        }).catch(function() { /* Plain content remains readable on failure. */ });
      });
    });
  }
  function detach() {
    if (coloring) coloring.abort();
    coloring = null;
    if (colorFrame) cancelAnimationFrame(colorFrame);
    colorFrame = null;
    if (colorTimer) clearTimeout(colorTimer);
    colorTimer = null;
    if (observer) observer.disconnect();
    observer = null;
    if (scroll) scroll.removeEventListener('scroll', schedulePaint);
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    if (paintFrame) cancelAnimationFrame(paintFrame);
    paintFrame = null;
    codes = [];
    horizontal = 0;
    scroll = null;
    viewport = null;
  }
  function attach(reveal, restoreTop) {
    detach();
    scroll = document.querySelector('.compare-scroll');
    viewport = document.querySelector('.compare-viewport');
    if (!scroll) return;
    codes = Array.from(scroll.querySelectorAll('.compare-code code'));
    scroll.addEventListener('scroll', schedulePaint, { passive: true });
    observer = new ResizeObserver(scheduleMeasure);
    observer.observe(scroll);
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(function() {
      measure();
      if (restoreTop != null) {
        scroll.scrollTop = restoreTop;
      } else if (reveal) {
        var first = scroll.querySelector('.compare-change');
        if (first) {
          var view = scroll.getBoundingClientRect();
          var changeTop = first.getBoundingClientRect().top;
          var lineHeight = parseFloat(getComputedStyle(first.querySelector('.compare-code')).lineHeight) || 21;
          if (changeTop < view.top || changeTop + lineHeight > view.bottom) {
            scroll.scrollTop += changeTop - view.top - 3 * lineHeight;
          }
        }
      }
      updateViewport();
      deferColors();
    });
  }
  document.addEventListener('htmx:beforeRequest', function(e) {
    var elt = e.detail.elt;
    if (elt && elt.matches('[data-compare-refresh]') && scroll) {
      elt.dataset.scrollTop = String(scroll.scrollTop);
    }
  });
  document.addEventListener('click', function(e) {
    var overview = e.target.closest('.compare-overview');
    if (!overview || !scroll) return;
    var button = e.target.closest('[data-compare-change]');
    // Keyboard activation keeps change navigation; pointer clicks map to the document.
    if (e.detail === 0) {
      if (button) {
        var target = document.getElementById(button.getAttribute('aria-controls'));
        if (target) target.scrollIntoView({ block: 'center' });
      }
      return;
    }
    var rect = overview.getBoundingClientRect();
    if (!rect.height) return;
    var position = (e.clientY - rect.top) / rect.height;
    scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight,
      position * scroll.scrollHeight - scroll.clientHeight / 2));
  });
  document.addEventListener('wheel', function(e) {
    var cell = e.target.closest('.compare-code');
    if (!cell || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    var side = cell.matches(':first-child') ? 'left' : 'right';
    var bar = cell.closest('.compare-reader').querySelector('.compare-x-scroll[data-side=' + side + ']');
    if (!bar) return;
    bar.scrollLeft += e.deltaX * (e.deltaMode === 1 ? 21 : e.deltaMode === 2 ? bar.clientWidth : 1);
    e.preventDefault();
  }, { passive: false });
  function resizeFiles(handle, width) {
    var content = handle.closest('.compare-content');
    width = Math.max(160, Math.min(width, content.clientWidth / 2));
    handle.closest('.compare-page').style.setProperty('--compare-files-width', width + 'px');
  }
  document.addEventListener('pointerdown', function(e) {
    var handle = e.target.closest('.compare-files-resizer');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    var left = handle.closest('.compare-content').getBoundingClientRect().left;
    handle.setPointerCapture(e.pointerId);
    handle.closest('.compare-page').classList.add('compare-resizing');
    handle.onpointermove = function(move) { resizeFiles(handle, move.clientX - left); };
    handle.onlostpointercapture = function() {
      handle.onpointermove = null;
      handle.closest('.compare-page').classList.remove('compare-resizing');
    };
  });
  document.addEventListener('keydown', function(e) {
    var handle = e.target.closest('.compare-files-resizer');
    if (!handle || !['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return;
    e.preventDefault();
    var width = handle.previousElementSibling.getBoundingClientRect().width;
    resizeFiles(handle, e.key === 'Home' ? 320 : width + (e.key === 'ArrowRight' ? 20 : -20));
  });
  document.addEventListener('dblclick', function(e) {
    var handle = e.target.closest('.compare-files-resizer');
    if (handle) handle.closest('.compare-page').style.removeProperty('--compare-files-width');
  });
  document.addEventListener('htmx:beforeSwap', function(e) {
    if (!e.detail.target || e.detail.target.id !== 'compare-results') return;
    closedFolders = new Set(Array.from(document.querySelectorAll('.compare-folder:not([open])'), function(folder) {
      return folder.dataset.directory;
    }));
  });
  document.addEventListener('htmx:beforeCleanupElement', function(e) {
    var reader = e.detail.elt;
    if (reader.id !== 'compare-reader') return;
    detach();
    // History has already been saved. This subtree has no htmx controls;
    // remove it directly instead of dispatching cleanup events for every token.
    var content = reader.querySelector('.compare-document');
    if (content) content.remove();
  });
  document.addEventListener('htmx:afterSwap', function(e) {
    if (!e.detail.target || !['compare-reader', 'compare-results'].includes(e.detail.target.id)) return;
    if (e.detail.target.id === 'compare-results') {
      document.querySelectorAll('.compare-folder').forEach(function(folder) {
        if (closedFolders.has(folder.dataset.directory)) folder.open = false;
      });
    }
    var reader = document.querySelector('#compare-reader');
    if (reader) {
      var selected = reader.dataset.file;
      document.querySelector('.compare-form input[name=file]').value = selected || '';
      document.querySelectorAll('.compare-file-link').forEach(function(a) {
        if (new URL(a.href).searchParams.get('file') === selected) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
    var source = e.detail.requestConfig && e.detail.requestConfig.elt;
    var refreshing = source && source.matches('[data-compare-refresh]');
    attach(!refreshing, refreshing ? Number(source.dataset.scrollTop || 0) : undefined);
  });
  document.addEventListener('htmx:historyRestore', function() { attach(false); });
  window.addEventListener('pagehide', function() {
    if (!scroll) return;
    try { sessionStorage.setItem('compare-reading-position', JSON.stringify({ url: location.href, top: scroll.scrollTop })); } catch (_) {}
  });
  var navigation = performance.getEntriesByType('navigation')[0];
  var restoring = navigation && ['reload', 'back_forward'].includes(navigation.type);
  var saved;
  try { saved = JSON.parse(sessionStorage.getItem('compare-reading-position')); } catch (_) {}
  attach(!restoring, restoring && saved && saved.url === location.href ? saved.top : undefined);
})();
`

function compareFileTitle(file: CompareFile): string {
  const status = ({ A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', M: 'Modified', T: 'Type changed' } as Record<string, string>)[file.status[0]!] ?? file.status
  const path = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
  return `${status} · ${path}`
}

type CompareViewProps = { repo: string; name: string; scope: string; result?: CompareResult; error?: string }

export function CompareReader(props: CompareViewProps) {
  const { result: r } = props
  function branchOptions(selected: string | undefined, workingTree = false) {
    const refs = r?.refs ?? []
    const option = (ref: CompareResult['refs'][number]) => <option value={ref.value} selected={ref.value === selected}>{ref.label}{ref.current ? ' (current)' : ''}</option>
    const local = refs.filter(ref => !ref.current && ref.value.startsWith('refs/heads/'))
    const remote = refs.filter(ref => ref.value.startsWith('refs/remotes/'))
    return <>
      {refs.filter(ref => ref.current).map(option)}
      {workingTree && <option value="worktree" selected={selected === 'worktree'}>Working tree</option>}
      {local.length > 0 && <optgroup label="Local branches · recent commits">{local.map(option)}</optgroup>}
      {remote.length > 0 && <optgroup label="Remote branches · recent commits">{remote.map(option)}</optgroup>}
      {refs.filter(ref => !ref.current && ref.value === 'HEAD').map(option)}
    </>
  }
  return (
    <section id="compare-reader" class="compare-reader" data-file={r?.selected?.path}
      data-color-url={r?.selected && r.versions ? '/compare/colors?' + new URLSearchParams({ repo: props.repo, ...r.versions, file: r.selected.path, ...(r.selected.oldPath ? { oldPath: r.selected.oldPath } : {}) }) : undefined}>
      <div class="compare-row compare-labels">
        <label><select name="base" aria-label="Base version">{branchOptions(r?.base)}</select></label>
        <label><select name="target" aria-label="Target version" title="Working tree includes staged and unstaged tracked changes; untracked files are excluded.">{branchOptions(r?.target, true)}</select></label>
      </div>
      {props.error ? <pre class="compare-message" role="alert">{props.error}</pre> : r?.selected ? <><div class="compare-file-head"><span>{r.selected.oldPath ? `${r.selected.oldPath} → ` : ''}{r.selected.path}</span></div><SplitDiff patch={r.patch} file={r.selected} /></> : <p class="compare-message">No differences{props.scope ? ' in this path' : ''}.</p>}
    </section>
  )
}

export function CompareView(props: CompareViewProps) {
  const { result: r } = props
  type Directory = { path: string; name: string; directories: Map<string, Directory>; files: CompareFile[] }
  const root: Directory = { path: '', name: '', directories: new Map(), files: [] }
  for (const file of r?.files ?? []) {
    const parts = file.path.split('/')
    let parent = root
    for (const name of parts.slice(0, -1)) {
      if (!parent.directories.has(name)) parent.directories.set(name, {
        name, path: parent.path ? parent.path + '/' + name : name, directories: new Map(), files: [],
      })
      parent = parent.directories.get(name)!
    }
    parent.files.push(file)
  }
  const url = (file: string, scope = props.scope) => '/compare?' + new URLSearchParams({ repo: props.repo, base: r!.base, target: r!.target, scope, file })
  function renderChildren(node: Directory, depth: number): JSX.Element {
    return <>{[...node.directories.values()].map(child => {
      let directory = child
      let label = child.name
      while (!directory.files.length && directory.directories.size === 1) {
        directory = directory.directories.values().next().value!
        label += '/' + directory.name
      }
      const href = url(r?.selected?.path ?? '', directory.path + '/')
      return <details class="compare-folder" data-directory={directory.path} open>
        <summary class="compare-directory" style={`padding-left: ${12 + depth * 14}px`}>
          <span title={directory.path}>{label}</span>
          <a class="compare-directory-filter" title={`Show changes in ${directory.path}/`} aria-label={`Filter to ${directory.path}/`}
            href={href} hx-get={href}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>
          </a>
        </summary>
        {renderChildren(directory, depth + 1)}
      </details>
    })}{node.files.map(file => <a class="compare-file-link" style={`padding-left: ${12 + depth * 14}px`} href={url(file.path)} hx-get={url(file.path)} hx-select="#compare-reader" hx-target="#compare-reader" hx-swap="outerHTML" hx-sync="closest .compare-page:replace" hx-push-url="true" aria-current={r?.selected?.path === file.path ? 'true' : undefined} title={compareFileTitle(file)}>
        <span class="compare-file-path" data-status={file.status[0]}>{file.path.slice(file.path.lastIndexOf('/') + 1)}</span>
        <span class="compare-file-stats">{file.binary ? <span class="file-num-binary">binary</span> : <>
          {file.added !== undefined ? <span class="file-num-add">+{file.added}</span> : null}
          {file.deleted !== undefined ? <span class="file-num-del">−{file.deleted}</span> : null}
        </>}</span></a>)}</>
  }
  return <main class="compare-page">
    <form class="compare-form" action="/compare"
      hx-get="/compare" hx-trigger="submit, change[event.target.tagName === 'SELECT']"
      hx-select="#compare-results" hx-target="#compare-results" hx-swap="outerHTML"
      hx-sync="closest .compare-page:replace" hx-push-url="true">
    <header class="compare-toolbar"><a href="/">← Workspace</a><a href={'/repo?repo=' + encodeURIComponent(props.repo)}>{props.name}</a><strong title="Direct comparison of two versions, using their tips rather than a merge base.">Compare</strong>
      <button type="button" class="compare-refresh" hx-get="/compare" hx-trigger="click" hx-include="closest form"
        data-compare-refresh title="Reload this comparison manually">Refresh</button>
    </header>
      <input type="hidden" name="file" value={r?.selected?.path ?? ''} />
      <input type="hidden" name="repo" value={props.repo} />
    <div id="compare-results">
    <input type="hidden" name="scope" value={props.scope} />
    <div class="compare-content">
      <aside class="compare-files">
        <div class="compare-files-controls"><div class="compare-files-heading">Changed files · {r?.files.length ?? 0}</div>
          {props.scope && <div class="compare-scope">
            <span title={props.scope}>{props.scope}</span>
            <a href={url(r?.selected?.path ?? '', '')} hx-get={url(r?.selected?.path ?? '', '')}>All files</a>
          </div>}
        </div><div class="compare-file-list">{renderChildren(root, 0)}</div></aside>
      <div class="compare-files-resizer" role="separator" aria-orientation="vertical"
        aria-label="Resize file list" tabindex={0} title="Drag to resize · double-click to reset" />
      <CompareReader {...props} />
    </div>
    </div>
    </form>
    <script>{raw(COMPARE_SCRIPT)}</script>
  </main>
}
