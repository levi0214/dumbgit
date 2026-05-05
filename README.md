# dumbgit

A tiny self-use Git GUI for Mac. One Bun process, server-rendered HTML,
htmx for swaps. No build step, no packaging, no installer. Reads the repo
in whatever directory you started it from.

For the "why" and the deliberate non-features, see [`PLAN.md`](./PLAN.md).

## Install (once)

```bash
bun install
```

Requires Bun ≥ 1.0 and `git` on `PATH`. Built and used on macOS.

## Run

`dumbgit` always operates on the current working directory.

```bash
cd /path/to/some/repo
bun run --cwd /Users/zhangluyao/dev/2025/dumbgit dumbgit
```

That starts the server on <http://localhost:7777> and opens the browser.
`Ctrl-C` to stop. Use `dev` instead of `dumbgit` for the same thing
without auto-opening the browser.

If you're going to use it, put a shell alias somewhere:

```bash
alias dumbgit='bun run --cwd /Users/zhangluyao/dev/2025/dumbgit dumbgit'
```

Then it's just `cd repo && dumbgit`.

If the cwd isn't a Git working tree, dumbgit prints a single `git` error
and exits with code 1.

## What you get

- HEAD line, branch list, `git log --graph` of the last 50 commits
- Click a branch → `git switch <branch>`
- Click a commit SHA → `git switch --detach <sha>`
- Click a commit message → diff panel on the right
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
src/
  index.tsx       Hono routes + server start
  git.ts          all git CLI calls live here
  watch.ts        fs.watch on .git/refs with debounce
  views/
    layout.tsx    page shell, css, htmx + SSE + poll bootstrap
    graph.tsx    branches + log + embedded #worktree
    worktree.tsx staged / unstaged / untracked lists
    diff.tsx     right-side commit diff panel
    status.tsx   small status / error fragment (oob swap)
```

Total ~500 lines. If you're tempted to add a feature, re-read the
"Out of scope" section in [`PLAN.md`](./PLAN.md) first.
