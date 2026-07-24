# dumbgit

A tiny Git GUI for one person on one Mac. It gives you the Git Graph view
back: branches, commits, local edits, and a few obvious actions, as a local
web app served by Bun, with `git` as the source of truth. It stays on your
machine.

## Install

```bash
bun install
bun link
```

Needs Bun, `git`, and Bun's global bin on your `PATH`. macOS only.

## Run

```bash
dumbgit          # open the repo in the current folder
dumbgit <dir>    # open a specific repo
dumbgit          # (outside a repo) open the Workspace with all your repos
```

The first run starts a small local server on `127.0.0.1:7777` and opens your
browser. Every repo you open is served by that one server and remembered
between runs.

Other commands:

```bash
dumbgit list        # show what's running and which repos are active
dumbgit stop <dir>  # stop watching one repo
dumbgit stop --all  # stop the server
dumbgit restart     # restart the server
```

## What it does

- Shows the repo graph: branches, remotes, tags, stashes, recent commits.
- Click a commit to see its files; click a file to see the diff.
- Stage, unstage, or discard changes from the diff panel.
- Copy a branch name, switch branches, create a branch, or checkout a commit.
- `Save aside` tucks all local edits into a stash; restore or drop it later.
- Refreshes on its own when things change. Quits after ~8h of no browser.

## What it won't do

No rebase, merge, cherry-pick, conflict resolution, settings, or themes. For
those, run `git` yourself or let your agent do it. It stays dumb on purpose.

## Notes

- It's built to stay open. Views update in real time from Git's own ref
  changes (via macOS FSEvents), so a single idle Bun process costs almost
  nothing.
- Open-file uses the system default app; open-terminal uses Terminal.app.
  Override with env vars (macOS app names):

  ```bash
  export DUMBGIT_EDITOR="Sublime Text"
  export DUMBGIT_TERMINAL="Ghostty"
  ```

- State lives in `~/Library/Application Support/dumbgit/repos.json`.
- Hacking on dumbgit itself: `bun run dev`.

## License

MIT. See [LICENSE](LICENSE).
