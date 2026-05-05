/** @jsxImportSource hono/jsx */
import { raw } from 'hono/html'

const CSS = `
:root {
  --bg: #1e1e1e;
  --fg: #d4d4d4;
  --muted: #858585;
  --accent: #569cd6;
  --border: #333;
  --error: #f48771;
  --success: #6a9955;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
  font-size: 13px;
  line-height: 1.45;
  background: var(--bg);
  color: var(--fg);
}
.page {
  max-width: 1700px;
  margin: 0 auto;
  padding: 12px 16px 24px;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
.toolbar button {
  font: inherit;
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #2d2d2d;
  color: var(--fg);
}
.toolbar button:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.main-grid {
  display: grid;
  grid-template-columns: minmax(420px, 1fr) minmax(420px, 1fr);
  gap: 12px;
  align-items: start;
}
@media (max-width: 1000px) {
  .main-grid { grid-template-columns: 1fr; }
}
.graph-root {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  background: #252526;
}
.graph-root.graph-error {
  padding: 12px 16px;
}
.graph-root.graph-error .msg {
  margin: 0;
  white-space: pre-wrap;
  color: var(--error);
}
.graph-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
  color: var(--accent);
}
.worktree-panel {
  border-bottom: 1px solid var(--border);
  font-size: 11px;
  background: #252526;
}
.worktree-head {
  padding: 4px 12px;
  background: #2a2a2a;
  color: var(--muted);
}
.worktree-clean {
  padding: 6px 12px 8px;
  color: var(--muted);
}
.worktree-body {
  padding: 0 12px 8px;
  max-height: 26vh;
  overflow-y: auto;
}
.wt-section {
  margin-top: 6px;
}
.wt-section-title {
  color: var(--accent);
  margin-bottom: 2px;
}
.wt-count {
  color: var(--muted);
}
.wt-list {
  margin: 0;
  padding: 0 0 0 6px;
  list-style: none;
}
.wt-list li {
  display: flex;
  gap: 6px;
}
.wt-mark {
  flex-shrink: 0;
  width: 2.2em;
  color: var(--muted);
}
.wt-path {
  word-break: break-all;
}
.graph-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 200px;
  max-height: calc(100vh - 260px);
}
.branch-list {
  margin: 0;
  padding: 8px 0;
  list-style: none;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.branch-list li {
  padding: 0;
}
.branch-list li.current {
  background: #094771;
}
.branch-row-btn {
  all: unset;
  display: flex;
  width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
}
.branch-row-btn:hover .branch-name {
  color: var(--accent);
}
.branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-sha { color: var(--muted); flex-shrink: 0; }
.log-lines {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  font-family: inherit;
  font-size: 12px;
  color: var(--fg);
}
.log-line {
  display: block;
  white-space: pre;
}
.sha-btn {
  font: inherit;
  border: none;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.sha-btn:hover {
  color: #9cdcfe;
}
.msg-btn {
  font: inherit;
  border: none;
  background: transparent;
  color: var(--fg);
  cursor: pointer;
  padding: 0;
  text-align: left;
  white-space: pre;
}
.msg-btn:hover {
  color: var(--accent);
}
.log-lines.empty {
  color: var(--muted);
}
.status-slot {
  margin-bottom: 8px;
}
.status-inner {
  margin: 0;
  padding: 8px 12px;
  border-radius: 4px;
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 12px;
}
.status-error {
  border: 1px solid var(--error);
  background: #3c2020;
  color: var(--error);
}
.status-info {
  border: 1px solid var(--success);
  background: #1f2d1f;
  color: var(--success);
}
.diff-panel {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #252526;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 260px);
}
.diff-empty {
  padding: 16px;
  color: var(--muted);
}
.diff-panel.diff-error .diff-body {
  color: var(--error);
}
.diff-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
}
.diff-subject {
  color: var(--accent);
  word-break: break-word;
}
.diff-meta {
  color: var(--muted);
  font-size: 11px;
}
.diff-files {
  margin: 0;
  padding: 8px 12px;
  list-style: none;
  border-bottom: 1px solid var(--border);
  max-height: 30vh;
  overflow-y: auto;
}
.diff-files li {
  display: flex;
  gap: 8px;
}
.file-status {
  display: inline-block;
  width: 1.5em;
  flex-shrink: 0;
  color: var(--muted);
}
.file-A { color: var(--success); }
.file-D { color: var(--error); }
.file-M { color: #dcdcaa; }
.file-R { color: var(--accent); }
.file-path { word-break: break-all; }
.diff-body {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  white-space: pre;
  font-family: inherit;
  font-size: 12px;
  flex: 1;
  min-height: 0;
}
`

const EMPTY_DIFF_HTML =
  '<div id="diff" class="diff-panel diff-empty">(select a commit message to see its diff)</div>'

const KEY_SCRIPT =
  `const EMPTY_DIFF = ${JSON.stringify(EMPTY_DIFF_HTML)};` +
  `
document.addEventListener('keydown', function (e) {
  if (e.target.closest('input, textarea')) return;
  const k = e.key;
  if (k === 'p' || k === 'P') {
    e.preventDefault();
    document.getElementById('push-btn')?.click();
  } else if (k === 'Escape') {
    const d = document.getElementById('diff');
    if (d) d.outerHTML = EMPTY_DIFF;
  }
});
`

const SSE_SCRIPT = `
(function () {
  function start() {
    if (typeof htmx === 'undefined') { setTimeout(start, 50); return; }
    var es = new EventSource('/events');
    es.addEventListener('changed', function () {
      htmx.ajax('GET', '/fragment/graph', { target: '#graph', swap: 'outerHTML' });
    });
  }
  start();
})();
`

const WT_POLL_SCRIPT = `
setInterval(function () {
  if (document.visibilityState !== 'visible') return;
  if (typeof htmx === 'undefined') return;
  var w = document.getElementById('worktree');
  if (w) {
    htmx.ajax('GET', '/fragment/worktree', { target: '#worktree', swap: 'outerHTML' });
  }
}, 3000);
`

export function Layout(props: { children: JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>dumbgit</title>
        <script
          src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js"
          defer
        ></script>
        <style>{raw(CSS)}</style>
      </head>
      <body>
        {props.children}
        <script>{raw(KEY_SCRIPT)}</script>
        <script>{raw(SSE_SCRIPT)}</script>
        <script>{raw(WT_POLL_SCRIPT)}</script>
      </body>
    </html>
  )
}

export function Toolbar() {
  return (
    <div class="toolbar">
      <button
        type="button"
        id="push-btn"
        title="Push current branch to origin (P)"
        hx-post="/api/push"
        hx-swap="none"
      >
        ↑ push
      </button>
    </div>
  )
}
