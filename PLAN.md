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

- `src/git.ts`: `headInfo()`, `listBranches()`, `logGraph(limit = 50)` via `Bun.spawn`
- `src/views/layout.tsx`: full page shell (head, htmx script, css, dark monospace)
- `src/views/graph.tsx`: header showing `HEAD @ <branch>` or `HEAD detached @ <sha>`,
  branches list, and a `<pre>` of the parsed `git log --graph --oneline --all --decorate`
- `GET /` renders the whole page; `GET /fragment/graph` returns just the graph block (used by step 3)
- `R` key + a small "↻" button refresh the graph fragment

Decide here: `--color=never` and apply our own CSS classes from line content,
vs. `--color=always` plus a tiny ANSI→HTML converter. Lean toward the former.

### Step 3 — Navigator (the must-have actions)

After this step, clicking a branch or commit checks it out. This is the point
where dumbgit covers all three must-haves from the brief.

- Extend `src/git.ts`: `checkoutBranch(name)`, `checkoutCommit(sha)` returning `{ ok, stderr }`
- `POST /api/checkout/branch/:name`, `POST /api/checkout/commit/:sha`
- Each endpoint runs the action, then returns the re-rendered graph fragment for `hx-target="#graph"`
- Wire branches list and graph sha-elements with htmx (`hx-post`, `hx-target="#graph"`, `hx-swap="outerHTML"`)
- `src/views/status.tsx`: a small `#status` slot. Failures (e.g. dirty working tree)
  return the raw git stderr into this slot. No wrapping, no hand-holding.

Defer to AI agent: stash, force-checkout, anything beyond plain `git checkout`.

### Step 4 — Inspector & ship (diff, push, launcher)

After this step, dumbgit is feature-complete for the brief. Add diff viewing,
push, and a one-command launcher so you can actually use it day to day.

- Extend `src/git.ts`: `commitDetails(sha)` → `{ subject, author, date, files[], diff }`; `push()` → `{ ok, stderr }`
- `src/views/diff.tsx`: subject + meta line, file list, unified diff in a `<pre>`
- `GET /api/diff/:sha` returns the diff fragment; sha-elements in the graph fire `hx-get` with `hx-target="#diff"`
- `POST /api/push` runs `git push`, returns a status fragment (success or stderr)
- "Push" button in the header
- Launcher: `bun run dumbgit` (script in `package.json`) starts the server in `process.cwd()` and runs `open http://localhost:7777`. Prints one line: URL and "Ctrl-C to quit"
- On startup, check `git rev-parse --git-dir`; if not a repo, print a clear error and exit non-zero
- Optional polish if cheap: `Esc` clears the diff panel; press `P` to push
