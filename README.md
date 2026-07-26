# dumbgit

A tiny local Git GUI for macOS.

## Install

```bash
bun install
bun link
```

Requires Bun and `git`.

## Run

```bash
dg  # start the server, add the current repo, and open the Workspace
```

Run it in each repo you want to add.

## What it does

- Shows all your repos in one page.
- Shows branches, remotes, tags, stashes, commits, and local edits.
- Opens diffs and stages, unstages, or discards changes.
- Switches and creates branches, checks out commits, and pushes.
- Saves local edits aside and restores them later.
- Refreshes on its own when things change. Quits after ~8h of no browser.

## What it won't do

No rebase, merge, cherry-pick, conflict resolution. For those, just use `git`
or a coding agent. It stays dumb on purpose.

## Notes

- Everything stays on your machine at `127.0.0.1:7777`.
- Stop the server with `dg --stop`.
- You can also add a repo from anywhere with `dg <dir>`.
- State lives in `~/Library/Application Support/dumbgit/repos.json`.
- Open-file uses the default app; open-terminal uses Terminal.app. Override them
  with `DUMBGIT_EDITOR` and `DUMBGIT_TERMINAL`.
- Hacking on dumbgit: `bun run dev`.

## License

MIT. See [LICENSE](LICENSE).
