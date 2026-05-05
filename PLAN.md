# dumbgit — Plan

A tiny, self-use Git GUI for Mac. Local web app. Read-mostly viewer with a few action buttons.

## Stack

- **Runtime:** Bun (native TS + JSX, fast cold start, no toolchain ceremony)
- **Backend:** Hono with `hono/jsx` for server-rendered components
- **Interactivity:** htmx loaded from CDN (one `<script>` tag, no bundler)
- **Styling:** plain CSS in a single `<style>` block
- **Git access:** `Bun.spawn` shelling out to the system `git` binary
- **Distribution:** clone repo, `bun install`, `bun run dev`. No packaging.

Non-goals (carry over from product brief):
- No rebase / cherry-pick / merge / stash UI
- No multi-repo, no settings, no themes, no plugins

## Architecture (one paragraph)

A single Bun process. Hono serves `/` (the whole UI as one SSR'd page) plus a handful of `/api/*` routes that perform git actions and return HTML fragments. The browser uses htmx to swap those fragments into the page on click. There is no client-side state. The "current repo" is the directory `dumbgit` was started in (`process.cwd()`); a single repo, no picker.

## File layout

```
dumbgit/
  package.json
  tsconfig.json
  src/
    index.tsx       # Hono app + route registrations + server start (Bun needs .tsx for JSX)
    git.ts          # thin wrappers around `git` CLI; returns typed data
    views/
      layout.tsx    # full-page shell (head, htmx script, css)
      graph.tsx    # branches + colored `git log --graph` block
      diff.tsx     # right-side diff panel for a selected commit
      status.tsx   # small status / error toast fragment
  README.md
```

Stay under ~500 lines total for the first cut.

## Steps

Each step is small enough to plan and execute on its own. We will produce a separate detailed plan for each before doing the work.

### 1. Project skeleton

- `bun init`, add Hono, configure `tsconfig.json` for JSX (`jsxImportSource: "hono/jsx"`)
- `bun run dev` boots Hono on `localhost:7777`, prints the URL
- `/` returns a "hello dumbgit" SSR'd page so we can verify JSX + htmx loading (`src/index.tsx`; Bun only parses JSX in `.tsx`)

### 2. Git wrapper (`src/git.ts`)

Minimal surface, one function per question:

- `listBranches()` → `{ name, isCurrent, sha }[]`
- `headInfo()` → `{ kind: "branch" | "detached", name?, sha }`
- `logGraph(limit = 50)` → raw colored text from `git log --graph --oneline --all --decorate --color=always -n <limit>`, plus a parsed `{ sha, refs[] }` per line for click targets
- `commitDetails(sha)` → `{ subject, author, date, files: { path, status }[], diff: string }`
- `checkoutBranch(name)` / `checkoutCommit(sha)` / `push()` → `{ ok, stderr }`

All of these are `Bun.spawn` calls. No streaming, no progress bars. If git fails, return its stderr verbatim.

### 3. Main page (`/`) — graph + branches + empty diff panel

- Two-column layout: left = branches list + log graph; right = diff panel (empty placeholder until a commit is clicked)
- Header shows `HEAD @ <branch>` or `HEAD detached @ <sha>` so detached state is impossible to miss
- Graph rendered as a `<pre>` of the parsed log; each line wraps the sha in a clickable element
- Branches list: clicking a branch fires `hx-post="/api/checkout/branch/:name"` with `hx-target="#main"` to swap in a re-rendered page fragment
- A "↻ Refresh" button + `hx-trigger="visibilitychange from:document"` so focusing the window also refreshes

### 4. Action endpoints

- `POST /api/checkout/branch/:name` → run checkout, re-render graph + header, return as HTML fragment
- `POST /api/checkout/commit/:sha` → same, but to a sha (detached HEAD)
- `POST /api/push` → run `git push`, return a status toast fragment with stderr if non-zero
- All endpoints return HTML fragments (no JSON), since htmx swaps HTML directly

### 5. Diff panel

- `GET /api/diff/:sha` → renders `commitDetails(sha)` as: subject + meta line, file list, then a colorized `<pre>` of the unified diff
- Clicking a sha in the graph fires `hx-get="/api/diff/:sha"` with `hx-target="#diff"`
- ANSI color from git → HTML: tiny inline converter for the few escape codes git emits, or pass `--color=never` and apply CSS classes ourselves. Decide during this step.

### 6. Polish

- Error handling: any git error becomes a small red toast fragment swapped into a `#status` slot, showing raw stderr. No swallowing.
- Keyboard: `R` for refresh, `Esc` to clear diff panel selection. Optional, only if it's a few lines.
- Styling: monospace everywhere, dark default, ~3 colors total. No CSS framework.

### 7. Launcher

- `bun run dumbgit` starts the server in the cwd and runs `open http://localhost:7777` so a browser window pops up
- Print one line on stdout: the URL and how to quit (`Ctrl-C`)
- That's it — no daemon, no PID file, no menubar icon

## Open questions (defer to their step)

- Step 2: do we want `--color=always` and HTML-escape the ANSI, or `--color=never` and re-color in CSS? Probably the latter is cleaner, decide when we get there.
- Step 3: when checkout fails because the working tree is dirty, do we just show stderr, or do we offer a one-click "git stash && retry"? Initial answer: just show stderr. Stash is on the "AI agent does it" list.
- Step 7: detect "is this a git repo?" on startup and print a clear error if not. Trivial, do it in step 7.
