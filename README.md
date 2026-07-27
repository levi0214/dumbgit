# dumbgit

A tiny local Git GUI for macOS.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/levi0214/dumbgit/main/install.sh | sh
```

Or, if you already have Bun:

```bash
bun add -g dumbgit  # or: npm i -g dumbgit
```

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
- Refreshes on its own when things change.

## What it won't do

No rebase, merge, cherry-pick, conflict resolution. For those, just use `git`
or a coding agent. It stays dumb on purpose.

## Notes

- Everything stays on your machine at `127.0.0.1:7777`.
- Stop the server with `dg --stop`. With no browser open, it quits on its own
  after ~8h.
- You can also add a repo from anywhere with `dg <dir>`.
- State lives in `~/Library/Application Support/dumbgit/repos.json`.
- Open-file uses the default app. Override it with `DUMBGIT_EDITOR`.
- Check the installed version with `dg --version`.
- Uninstall the standalone binary with `dg --stop && rm ~/.local/bin/dg`.
  Package installs can use `bun remove --global dumbgit` or
  `npm uninstall --global dumbgit`.
- Hacking on dumbgit: run `bun install`, `bun link`, then `bun run dev`.
- Maintainers: see [RELEASING.md](RELEASING.md).

## License

MIT. See [LICENSE](LICENSE).
