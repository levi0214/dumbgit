# dumbgit — Plan

A tiny, self-use Git GUI for Mac. Local web app. Read-mostly viewer with a few action buttons.

## Why this exists

I (the user) work on a Mac in the Cursor IDE. The new agents window does not
load VSCode extensions, so my usual Git Graph is gone. lazygit is "a faster
CLI", not a GUI — it doesn't translate git's concepts into something I can
glance at. Existing GUIs (GitUp / Fork / Sublime Merge) are either too old
or too full of features I don't want.

So this is a single-user tool. Every design call should optimize for
"one person, one Mac, this one repo at a time". If a feature would help
strangers, that is not a reason to build it.

## What I actually want

Must have:
- See all branches and recent commits at a glance
- Click a branch → check it out
- Click a commit → check it out (detached HEAD is fine)

Nice to have (but typing the command is not painful):
- Push current branch to `origin`

Occasional:
- Click a commit → see which files changed and the diff

## Out of scope (do not add these)

- rebase / cherry-pick / merge / stash UI — these I delegate to an AI agent;
  keep them out of the GUI on purpose
- multi-repo management, settings panels, themes, plugins
- anything that requires a build step on the frontend
- anything that requires packaging / distribution / auto-update

## Stack

- **Runtime:** Bun (native TS + JSX, fast cold start, no toolchain ceremony)
- **Backend:** Hono with `hono/jsx` for server-rendered components
- **Interactivity:** htmx loaded from CDN (one `<script>` tag, no bundler)
- **Styling:** plain CSS in a single `<style>` block
- **Git access:** `Bun.spawn` shelling out to the system `git` binary
- **Distribution:** clone repo, `bun install`, `bun run dev`. No packaging.

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
    watch.ts        # fs.watch on .git/refs and HEAD with debounce
    views/
      layout.tsx    # full-page shell (htmx, css, SSE + worktree poll scripts)
      graph.tsx    # branches + log graph + embedded #worktree
      worktree.tsx # staged / unstaged / untracked file lists
      diff.tsx     # right-side diff panel for a selected commit
      status.tsx   # small status / error toast fragment
  README.md
```

Stay under ~500 lines total for the first cut.

## Steps

Steps are vertical slices, not layers. Every step ends with a working version
of dumbgit you can actually use. Stop at any step and you still have a tool.

Each step gets its own detailed execution plan when we start it.

### Step 1 — Skeleton ✅

`bun init`, Hono on `localhost:7777`, `src/index.tsx` SSR's a "hello dumbgit"
page that loads htmx. Verifies the entire toolchain (Bun, JSX, Hono, htmx CDN)
works end-to-end.

Done. Commit `17d6cbf`.

### Step 2 — Viewer (read-only)

After this step you can open `http://localhost:7777` and see your repo at a
glance. Pure viewer, no buttons. This already covers the most common use case
("just let me see what's going on").

- `src/git.ts`: `headInfo()`, `logGraphRows()` via `Bun.spawn` (ANSI `--graph`; `\x1f`-delimited fields)
- `src/views/layout.tsx`: full page shell (head, htmx script, css, dark monospace)
- `src/views/graph.tsx`: header showing `HEAD @ <branch>` or `HEAD detached @ <sha>`,
  colored `git log --graph` (ANSI lanes) with clickable SHA / message / ref pills
- `GET /` renders the whole page; `GET /fragment/graph` returns just the graph block (used by step 3)
- `R` key + a small "↻" button refresh the graph fragment

Decided (later iteration): `--color=always` plus a small ANSI→span mapper (~80 LOC).

### Step 3 — Navigator (the must-have actions)

After this step, clicking a branch or commit checks it out. This is the point
where dumbgit covers all three must-haves from the brief.

- Extend `src/git.ts`: `checkoutBranch(name)`, `checkoutCommit(sha)` returning `{ ok, stderr }`
- `POST /api/checkout/branch/:name`, `POST /api/checkout/commit/:sha`
- Each endpoint runs the action, then returns the re-rendered graph fragment for `hx-target="#graph"`
- Wire graph SHA buttons, message buttons, and ref pills with htmx (`hx-post`, `hx-target="#graph"`, `hx-swap="outerHTML"`)
- `src/views/status.tsx`: a small `#status` slot. Failures (e.g. dirty working tree)
  return the raw git stderr into this slot. No wrapping, no hand-holding.

Defer to AI agent: stash, force-checkout, anything beyond plain `git checkout`.

### Step 4 — Inspector & ship (diff, push, launcher) ✅

dumbgit is now feature-complete for the brief. Diff viewer on the right,
push from the toolbar, and a one-command launcher.

- `src/git.ts` adds `commitDetails(sha)`, `push()`, `ensureGitRepo()`
- `src/views/diff.tsx`: subject + meta line + file list + unified diff `<pre>`
- `GET /api/diff/:sha` → `DiffPanel`; the message portion of each log line
  triggers `hx-get` into `#diff` (the SHA itself stays as checkout from step 3,
  since "click commit → checkout" is the must-have)
- `POST /api/push` runs `git push` and returns only a `StatusOob` (info on
  success, error on failure). `hx-swap="none"` on the button lets the OOB do all the work.
- Toolbar: refresh + push side by side
- Launcher: `bun run dumbgit` starts the server and opens the browser; `dev`
  stays open-less for development. The opening uses an `--open` argv flag
  consumed by `index.tsx`.
- On startup, `ensureGitRepo()` runs `git rev-parse --git-dir` and exits 1
  with a single error line if the cwd is not inside a git working tree.
- Keyboard polish: `R` refresh, `P` push, `Esc` clears the diff panel
- Every JSX file carries a `/** @jsxImportSource hono/jsx */` pragma. Bun 1.0
  resolves `tsconfig.json` relative to the cwd, not the source file, so
  `bun run /path/to/dumbgit/src/index.tsx` from another repo would otherwise
  fall back to React. The pragma makes JSX runtime selection cwd-independent.

### Step 5 — Live updates ✅

Replace the manual refresh button with event-driven updates so the graph
reflects reality without polling.

- `src/git.ts` adds `gitDir()` returning the absolute `.git` path
- `src/watch.ts`: `watchGitRefs(gitDir, onChange)`, an `fs.watch` recursive
  watcher with an 80ms debounce. On macOS this rides FSEvents — kernel-level,
  ~0 idle CPU. Filter only fires on `HEAD`, `packed-refs`, and `refs/**`
  (so noise from `objects/`, `logs/`, `index`, `COMMIT_EDITMSG` is ignored).
- `index.tsx` keeps a `lastChangeTimestamp` updated by the watcher
- `GET /events`: SSE stream from `hono/streaming`. Inside the handler we
  poll `lastChangeTimestamp` every 100ms and emit a `changed` SSE event
  when it advances. Costs roughly 0.5ms of CPU per minute per open tab; far
  less than 2-second HTTP polling and noticeably more responsive.
- Layout adds bootstrap scripts: `EventSource('/events')` on `changed` calls
  `htmx.ajax('GET', '/fragment/graph', ...)` to swap `#graph`.
  Browser EventSource auto-reconnects on transient disconnects, so server
  restarts are self-healing.
- **Working tree file list** (staged / unstaged / untracked): `git.ts`
  adds `workTreeSummary()`; `views/worktree.tsx` renders `#worktree` under
  the HEAD banner. Plain file paths only — no hunks (use your editor for that).
  Working-copy edits do not touch `refs/**`, so they do not wake the FSEvents
  watcher; `WT_POLL_SCRIPT` refetches `/fragment/worktree` every 3s while the
  tab is visible only.
- Toolbar loses the refresh button and the `R` keybinding. `Esc` and `P` stay.
- Bun 1.0 quirk: `streamSSE` calls `c.newResponse(stream)` without a status,
  which hits the same status=0 error as `c.html(...)` did in step 1. Workaround
  is one line: `c.status(200)` before returning the SSE response.
