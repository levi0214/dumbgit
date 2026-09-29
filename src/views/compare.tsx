/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'
import type { CompareFile, CompareResult } from '../compare'
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
  return <div class={`compare-code ${row?.kind ?? 'blank'}`}><span class="compare-ln">{side === 'left' ? row?.oldNo : row?.newNo}</span><span class="compare-text"><code>{row?.word ? row.word.map(w => <span class={w.chg ? 'diff-word-chg' : undefined}>{w.t}</span>) : row?.text}</code></span></div>
}
function Row({ row, id }: { row: SplitRow; id?: string }) {
  return <div class="compare-row" id={id}><Line row={row.left} side="left" /><Line row={row.right} side="right" /></div>
}
function SplitDiff({ patch }: { patch: string }) {
  const rows = splitRows(patch)
  if (!rows.length) return <pre class="compare-message">{patch || 'No content changes.'}</pre>
  // Full DOM rendering becomes noticeably slow for very long files in Safari.
  if (rows.length > 5000) return <p class="compare-message">This diff exceeds the 5,000-row display limit. Open this file in your editor or inspect it with git.</p>
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
    blocks.push(<div id={id} class="compare-change">{group.map(row => <Row row={row} />)}</div>)
    markers.push(
      <button type="button" class="compare-marker" data-compare-change={index}
        style={`top:min(${start / rows.length * 100}%, calc(100% - 4px));height:${group.length / rows.length * 100}%`}
        title={label} aria-label={label} aria-controls={id}>
        <span class={deleted ? 'compare-marker-del' : ''} />
        <span class={added ? 'compare-marker-add' : ''} />
      </button>,
    )
  }
  return <><div class="compare-document" style={`--compare-line-digits: ${lineDigits}`}>
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
    scroll.closest('.compare-reader').style.setProperty('--compare-scrollbar-width', scrollbarWidth + 'px');
    markers.forEach(function(marker, i) {
      marker.style.top = 'min(' + positions[i].top + '%, calc(100% - 4px))';
      marker.style.height = positions[i].height + '%';
    });
    var reader = scroll.closest('.compare-reader');
    var bars = reader.querySelectorAll('.compare-x-scroll');
    var width = 0;
    scroll.querySelectorAll('.compare-code code').forEach(function(code) {
      width = Math.max(width, code.scrollWidth);
    });
    var gutter = scroll.querySelector('.compare-ln').getBoundingClientRect().width;
    bars.forEach(function(bar) {
      bar.firstElementChild.style.width = (width + gutter + 12) + 'px';
      bar.onscroll = function() {
        reader.style.setProperty('--compare-x', -bar.scrollLeft + 'px');
        bars.forEach(function(other) {
          if (other.scrollLeft !== bar.scrollLeft) other.scrollLeft = bar.scrollLeft;
        });
      };
    });
    if (bars.length) bars[0].onscroll();
    updateViewport();
  }
  function scheduleMeasure() {
    if (!frame) frame = requestAnimationFrame(measure);
  }
  function attach(reveal, restoreTop) {
    if (observer) observer.disconnect();
    if (scroll) scroll.removeEventListener('scroll', updateViewport);
    scroll = document.querySelector('.compare-scroll');
    viewport = document.querySelector('.compare-viewport');
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    if (!scroll) return;
    scroll.addEventListener('scroll', updateViewport, { passive: true });
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
    });
  }
  document.addEventListener('htmx:beforeRequest', function(e) {
    var elt = e.detail.elt;
    if (elt && elt.matches('[data-compare-refresh]') && scroll) {
      elt.dataset.scrollTop = String(scroll.scrollTop);
    }
  });
  document.addEventListener('click', function(e) {
    var button = e.target.closest('[data-compare-change]');
    if (!button) return;
    var target = document.getElementById(button.getAttribute('aria-controls'));
    if (target) target.scrollIntoView({ block: 'center' });
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
  document.addEventListener('htmx:afterSwap', function(e) {
    if (!['compare-reader', 'compare-results'].includes(e.detail.target.id)) return;
    var reader = document.querySelector('#compare-reader');
    if (reader) {
      var selected = reader.dataset.file;
      document.querySelector('.compare-toolbar input[name=file]').value = selected || '';
      document.querySelectorAll('.compare-files a').forEach(function(a) {
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

function FilePath({ path }: { path: string }) {
  const slash = path.lastIndexOf('/') + 1
  return <span class="compare-file-path">
    {slash > 0 && <span class="compare-file-directory">{path.slice(0, slash)}</span>}
    <span class="compare-file-name">{path.slice(slash)}</span>
  </span>
}

function compareFileTitle(file: CompareFile): string {
  const status = ({ A: 'Added', D: 'Deleted', R: 'Renamed', C: 'Copied', M: 'Modified', T: 'Type changed' } as Record<string, string>)[file.status[0]!] ?? file.status
  const path = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path
  return `${status} · ${path}`
}

export function CompareView(props: { repo: string; name: string; scope: string; result?: CompareResult; error?: string }) {
  const { result: r } = props
  const url = (file: string) => '/compare?' + new URLSearchParams({ repo: props.repo, base: r!.base, target: r!.target, scope: props.scope, file })
  const label = (value: string) => value === 'worktree' ? 'Working tree' : r?.refs.find(ref => ref.value === value)?.label ?? value
  return <main class="compare-page">
    <header class="compare-toolbar"><a href="/">← Workspace</a><a href={'/repo?repo=' + encodeURIComponent(props.repo)}>{props.name}</a><strong>Compare</strong></header>
    <form class="compare-toolbar" action="/compare"
      hx-get="/compare" hx-trigger="submit, change from:select, input changed delay:350ms from:input[name=scope]"
      hx-select="#compare-results" hx-target="#compare-results" hx-swap="outerHTML"
      hx-sync="closest .compare-page:replace" hx-push-url="true">
      <input type="hidden" name="file" value={r?.selected?.path ?? ''} />
      <input type="hidden" name="repo" value={props.repo} />
      <label>Base <select name="base">{r?.refs.map(ref => <option value={ref.value} selected={ref.value === r.base}>{ref.label}</option>)}</select></label>
      <span>→</span><label>Target <select name="target">{r?.refs.map(ref => <option value={ref.value} selected={ref.value === r.target}>{ref.label}</option>)}<option value="worktree" selected={r?.target === 'worktree'}>Working tree</option></select></label>
      <label class="compare-scope">Path <input name="scope" value={props.scope} placeholder="All files, or contracts/src/" /></label>
    </form>
    <div id="compare-results">
    <div class="compare-note">Direct comparison of two versions.{r?.target === 'worktree' ? ' Working tree includes staged and unstaged tracked changes; untracked files are excluded.' : ''} <a href={url(r?.selected?.path ?? '')} hx-get={url(r?.selected?.path ?? '')}
      hx-select="#compare-results" hx-target="#compare-results" hx-swap="outerHTML"
      hx-sync="closest .compare-page:replace" data-compare-refresh title="Reload this comparison manually">Refresh</a></div>
    {props.error ? <pre class="compare-message" role="alert">{props.error}</pre> : <div class="compare-content">
      <aside class="compare-files"><div class="compare-files-heading">Changed files · {r?.files.length}</div>{r?.files.map(file => <a href={url(file.path)} hx-get={url(file.path)} hx-select="#compare-reader" hx-target="#compare-reader" hx-swap="outerHTML" hx-sync="closest .compare-page:replace" hx-push-url="true" aria-current={r.selected?.path === file.path ? 'true' : undefined} title={compareFileTitle(file)}>
        <FilePath path={file.path} />
        <span class="compare-file-stats">{file.binary ? <span class="file-num-binary">binary</span> : <>
          {file.added !== undefined ? <span class="file-num-add">+{file.added}</span> : null}
          {file.deleted !== undefined ? <span class="file-num-del">−{file.deleted}</span> : null}
        </>}</span></a>)}</aside>
      <div class="compare-files-resizer" role="separator" aria-orientation="vertical"
        aria-label="Resize file list" tabindex={0} title="Drag to resize · double-click to reset" />
      <section id="compare-reader" class="compare-reader" data-file={r?.selected?.path}>
        {r?.selected ? <><div class="compare-file-head"><span>{r.selected.oldPath ? `${r.selected.oldPath} → ` : ''}{r.selected.path}</span></div><div class="compare-row compare-labels"><span>{label(r.base)}</span><span>{label(r.target)}</span></div><SplitDiff patch={r.patch} /></> : <p class="compare-message">No differences{props.scope ? ' in this path' : ''}.</p>}
      </section>
    </div>}
    </div>
    <script>{raw(COMPARE_SCRIPT)}</script>
  </main>
}
