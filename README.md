# dumbgit

A tiny Git GUI for one person on one Mac.

It exists because sometimes you just want the Git Graph view back: branches,
commits, local edits, and a few obvious actions, without opening a full Git
client or turning the terminal into another UI.

dumbgit is a local web app. Bun serves plain HTML, Hono renders JSX on the
server, htmx swaps fragments, and `git` remains the source of truth. There is
no frontend build, no app bundle, no settings screen, no accounts, no cloud.

## Install

```bash
bun install
bun link
```

Requires Bun, `git` on `PATH`, and Bun's global bin directory on `PATH`.
Built and used on macOS.

## Run

```bash
dumbgit [dir]
dumbgit list
dumbgit stop [id|dir]
dumbgit stop --all
dumbgit restart
```

`dir` defaults to the current repo. `list` prints `id`, repo, and URL; pass the
id to `stop` to stop that server. `restart` stops every running instance and
starts each again on the same port (picks up source changes after `bun link`).

Each repo gets its own server. Starting the same repo again reopens it. Ports
come from `7777` to `7900`.

Open **workspace** from any repository view to see every currently running
dumbgit repo together. Workspace keeps a compact 5- or 10-commit timeline for
each repo and uses one shared inspector for commit and working-tree diffs.

Servers exit on their own about a minute after the last browser tab disconnects
(no SSE clients). `list` / `stop` / `restart` remain for stuck or stale
processes.

Use `bun run dev` when working on dumbgit itself. It disables idle exit and
runs with `bun --watch`; if `7777` is busy, it picks the next free port.

If the path is not inside a Git working tree, dumbgit prints the Git error and
exits.

## What It Does

- Shows the current repo, HEAD, local branches, remote refs, tags, stashes,
  and recent commits in a compact graph.
- Shows running repos side by side in Workspace, with short branch histories
  and one shared diff inspector.
- Shows `main | origin` when a local branch and `origin/main` point at the
  same commit.
- Copy a branch name by clicking it; hover to reveal switch or push when there
  is a useful action.
- Click a commit message to see changed files; click a file to load its patch.
- Hover a commit row to copy its full hash, create a branch, or checkout.
- Shows staged, unstaged, and untracked files. Click a file to inspect its
  patch, then stage, unstage, or discard from the diff panel.
- `Save aside` hides all local edits in a small preview stash; restore or drop
  it from the graph.
- Updates itself when refs move, and checks visible working-tree changes every
  few seconds.
- Shows a full-screen disconnected overlay if the local server goes away.

## Keys

- `P` pushes the current branch.
- `Esc` closes the diff panel or dismisses an error.

## What It Avoids

dumbgit does not try to be a complete Git client. Rebase, merge, cherry-pick,
conflict resolution, settings, themes, plugins, packaging, and auto-update are
out of scope. For those, use Git, your editor, or an agent.

The rule is simple: if the UI does not make the common case easier at a glance,
it does not belong here.

## Shape

```text
bin/dumbgit     launcher
src/index.tsx   Hono routes and server boot
src/git.ts      thin wrappers around the Git CLI
src/watch.ts     ref watcher
src/idle-exit.ts exit when no SSE clients remain
src/views/       server-rendered HTML fragments
```
