# dumbgit

A tiny self-use Git GUI for Mac. One Bun process, server-rendered HTML,
htmx for swaps. No build step, no app bundle.

Pick any repo from the bar at the top (recent paths + open-by-path), or
launch as `dumbgit /path/to/repo`; omit the path to use the cwd.

For the "why" and the deliberate non-features, see [`PLAN.md`](./PLAN.md).

## Install (once)

```bash
bun install
bun link
```

Requires Bun ≥ 1.0, `git` on `PATH`, and Bun's global bin directory on
`PATH`. Built and used on macOS.

## Run

```bash
dumbgit              # current repo
dumbgit /path/to/x   # explicit repo
dumbgit --stop       # stop the background server
```

`dumbgit` resolves the repo root, starts the local server in the background
if needed, switches an already-running server to that repo, then opens
<http://127.0.0.1:7777>. You usually don't need to stop it; use
`dumbgit --stop` when you want the port free or want a clean restart.

Use `bun run dev` when iterating on dumbgit itself. It runs the server in
the foreground with `bun --watch src/index.tsx`; reload the browser tab to
see your change.

If the cwd isn't a Git working tree, dumbgit prints a single `git` error
and exits with code 1.

One server, one current repo: switching the repo from any tab also
changes what every other tab sees on the next request. If you really
need two side-by-side, start a second instance on another port.

## What you get

- HEAD line, colored `git log --graph` (ANSI lanes from Git), last 50 commits
- Ref pills on each commit (`HEAD ->`, branches, remotes, tags) → `git switch <ref>`
- Click a commit message → changed-files panel (`git show --name-status` + line counts from `--numstat` when available)
- Click the changed-files block → full patch loads **below** the list (`git show`), without hiding the list
- Hover a graph row → `· <short hash>` + copy icon (copies full hash); detach checkout lives in the commit panel header
- `↑ push` button → `git push` (status shown inline; no graph re-render)
- Working tree panel: staged / unstaged / untracked file paths only
  (no hunks; open the file in your editor if you want the diff)

### Updates

- Branch / commit / tag changes (anything under `.git/refs` or `HEAD`)
  reflect in the page within ~100ms via `fs.watch` + SSE.
- Working-tree edits don't touch refs, so they're picked up by a 3s
  poll that runs only while the tab is visible.
- There is no refresh button. If something doesn't update, that's a bug.

### Keys

- `P` — push current branch
- `Esc` — close the diff panel

## Layout

```
bin/dumbgit     global launcher
src/
  index.tsx       Hono routes + server start
  git.ts          all git CLI calls live here
  watch.ts        fs.watch on .git/refs with debounce
  views/
    layout.tsx    page shell, css, htmx + SSE + poll bootstrap
    graph.tsx    colored graph log + ref pills + embedded #worktree
    worktree.tsx staged / unstaged / untracked lists
    diff.tsx     right-side commit diff panel
    status.tsx   small status / error fragment (oob swap)
```

Total ~500 lines. If you're tempted to add a feature, re-read the
"Out of scope" section in [`PLAN.md`](./PLAN.md) first.
