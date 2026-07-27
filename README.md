# dumbgit

A tiny local Git GUI for macOS.

## Install

Requires macOS (Apple Silicon or Intel) and Git.

```bash
curl --proto '=https' --tlsv1.2 -fsSL \
  https://raw.githubusercontent.com/levi0214/dumbgit/main/install.sh | sh
```

The installer downloads a checksum-verified binary to `~/.local/bin`. If that
is not on your `PATH`, it prints the command to add it. Re-run the installer to
update dumbgit.

Already have Bun? Install the small runtime bundle from npm instead:

```bash
bun add --global dumbgit
# or: npm install --global dumbgit  # still requires Bun to run
```

To inspect the standalone installer before running it:

```bash
curl --proto '=https' --tlsv1.2 -fsSLO \
  https://raw.githubusercontent.com/levi0214/dumbgit/main/install.sh
less install.sh
sh install.sh
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
- Open-file uses the default app; open-terminal uses Terminal.app. Override them
  with `DUMBGIT_EDITOR` and `DUMBGIT_TERMINAL`.
- Check the installed version with `dg --version`.
- Uninstall the standalone binary with `dg --stop && rm ~/.local/bin/dg`.
  Package installs can use `bun remove --global dumbgit` or
  `npm uninstall --global dumbgit`.
- Hacking on dumbgit: run `bun install`, `bun link`, then `bun run dev`.
- Maintainers: see [RELEASING.md](RELEASING.md).

## License

MIT. See [LICENSE](LICENSE).
