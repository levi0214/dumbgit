import { raw } from 'hono/html'

const CSS = `
:root {
  --bg: #1e1e1e;
  --fg: #d4d4d4;
  --muted: #858585;
  --accent: #569cd6;
  --border: #333;
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 16px 24px;
}
.toolbar {
  margin-bottom: 12px;
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
  color: #f48771;
}
.graph-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: #2d2d30;
  color: var(--accent);
}
.graph-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 200px;
  max-height: calc(100vh - 120px);
}
.branch-list {
  margin: 0;
  padding: 8px 0;
  list-style: none;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.branch-list li {
  padding: 4px 12px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.branch-list li.current {
  background: #094771;
}
.branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-sha { color: var(--muted); flex-shrink: 0; }
.log-lines {
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  white-space: pre;
  font-family: inherit;
  font-size: 12px;
  color: var(--fg);
}
.log-lines.empty {
  color: var(--muted);
}
`

const REFRESH_KEY_SCRIPT = `
document.addEventListener('keydown', function (e) {
  if (e.target.closest('input, textarea')) return;
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    document.getElementById('refresh-btn')?.click();
  }
});
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
        <script>{raw(REFRESH_KEY_SCRIPT)}</script>
      </body>
    </html>
  )
}

export function RefreshToolbar() {
  return (
    <div class="toolbar">
      <button
        type="button"
        id="refresh-btn"
        title="Refresh (R)"
        hx-get="/fragment/graph"
        hx-target="#graph"
        hx-swap="outerHTML"
      >
        ↻ refresh
      </button>
    </div>
  )
}
