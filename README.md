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
dg
```

Run it from a Git repo to add or reactivate that repo and open the Workspace.
Run it anywhere else to open the Workspace with the repos already there. The
first run starts a small local server on `127.0.0.1:7777` and opens your
browser. After that, start and stop repos from the page.

## What it does

- See every repo's activity at once.
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

- To add a repo without changing directories, run `dg <dir>`.
- State lives in `~/Library/Application Support/dumbgit/repos.json`.
- Hacking on dumbgit itself: `bun run dev`.

## License

MIT. See [LICENSE](LICENSE).
