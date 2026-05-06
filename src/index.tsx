/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import os from 'node:os'
import path from 'node:path'
import {
  GitError,
  applyWorkTreeAction,
  checkoutBranch,
  checkoutCommit,
  commitFilePatch,
  commitSummary,
  createBranchAt,
  ensureGitRepo,
  getCurrentRepo,
  gitDir,
  headInfo,
  isGitRepo,
  logGraphRows,
  push,
  setCurrentRepo,
  workTreeFilePatch,
  workTreeSummary,
} from './git'
import { bumpRecent, loadRecents } from './recents'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel, DiffPatchBody, WorkTreeDiffPanel } from './views/diff'
import { Layout } from './views/layout'
import { StatusOob } from './views/status'
import { watchGitRefs } from './watch'
import { WorkTreeFragment } from './views/worktree'

const PORT = 7777

/** Initial / expanded `git log -n` depth (ASCII graph needs full re-fetch each time). */
const GRAPH_COMMIT_DEFAULT = 50
const GRAPH_COMMIT_STEP = 50
const GRAPH_COMMIT_MAX = 500

function clampGraphCommitLimit(n: number): number {
  if (!Number.isFinite(n)) return GRAPH_COMMIT_DEFAULT
  const floored = Math.floor(n)
  return Math.min(GRAPH_COMMIT_MAX, Math.max(10, floored))
}

function expandUser(p: string): string {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  if (p === '~') return os.homedir()
  return p
}

/** First non-flag argv after script (skip `--open`, etc.). */
function initialRepoFromArgv(): string {
  const skip = new Set(['--open'])
  const pos: string[] = []
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!
    if (a.startsWith('-')) continue
    if (skip.has(a)) continue
    pos.push(a)
  }
  const raw = pos[0]
  if (!raw) return process.cwd()
  return path.resolve(expandUser(raw))
}

async function loadGraph(limit?: number): Promise<GraphFragmentProps> {
  const graphCommitLimit = clampGraphCommitLimit(limit ?? GRAPH_COMMIT_DEFAULT)
  try {
    const head = await headInfo()
    const rows = await logGraphRows(graphCommitLimit)
    const worktree = await workTreeSummary()
    const commitRows = rows.filter((r) => r.kind === 'commit').length
    const graphNextLimit = Math.min(
      graphCommitLimit + GRAPH_COMMIT_STEP,
      GRAPH_COMMIT_MAX,
    )
    const showLoadMore =
      commitRows >= graphCommitLimit &&
      commitRows > 0 &&
      graphCommitLimit < GRAPH_COMMIT_MAX
    return {
      ok: true,
      head,
      rows,
      worktree,
      repoPath: getCurrentRepo(),
      repoPickerRoot: getCurrentRepo(),
      repoPickerRecents: loadRecents(),
      graphCommitLimit,
      graphNextLimit,
      showLoadMore,
    }
  } catch (e) {
    const stderr =
      e instanceof GitError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e)
    return {
      ok: false,
      stderr,
      repoPickerRoot: getCurrentRepo(),
      repoPickerRecents: loadRecents(),
    }
  }
}

/**
 * `bun --hot` re-evaluates this module on every save. We pin one-shot state
 * (the fs.watch handle, the change timestamp, the Bun.serve handle) onto
 * globalThis so reloads update fetch handlers without rebinding the port
 * and without leaking watchers.
 */
type DumbgitState = {
  lastChange: number
  closeWatch?: () => void
  server?: ReturnType<typeof Bun.serve>
  repoInitialized?: boolean
}
const G = globalThis as { __dumbgit?: DumbgitState }
if (!G.__dumbgit) {
  G.__dumbgit = { lastChange: Date.now() }
}
const state = G.__dumbgit

if (!state.repoInitialized) {
  setCurrentRepo(initialRepoFromArgv())
  state.repoInitialized = true
}

try {
  await ensureGitRepo()
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`dumbgit: ${msg}`)
  console.error(`run dumbgit from inside a git working tree`)
  process.exit(1)
}

bumpRecent(getCurrentRepo())

async function attachWatcher() {
  state.closeWatch?.()
  state.closeWatch = undefined
  const watchedDir = await gitDir()
  state.closeWatch = watchGitRefs(watchedDir, () => {
    state.lastChange = Date.now()
  })
}

await attachWatcher()

const app = new Hono()

app.get('/', async (c) => {
  const graph = await loadGraph()
  return c.html(
    <Layout>
      <div class="page">
        <div id="status" class="status-slot"></div>
        <div class="main-grid">
          <GraphFragment {...graph} />
          <DiffPanel state="empty" />
        </div>
      </div>
    </Layout>,
    200,
  )
})

app.get('/fragment/graph', async (c) => {
  c.header('Cache-Control', 'no-store')
  const q = c.req.query('limit')
  const parsed = q !== undefined ? Number.parseInt(q, 10) : NaN
  const graph = await loadGraph(
    Number.isFinite(parsed) ? parsed : undefined,
  )
  return c.html(<GraphFragment {...graph} />, 200)
})

app.get('/fragment/worktree', async (c) => {
  c.header('Cache-Control', 'no-store')
  const wt = await workTreeSummary()
  return c.html(<WorkTreeFragment {...wt} repoPath={getCurrentRepo()} />, 200)
})

app.get('/api/worktree/file', async (c) => {
  c.header('Cache-Control', 'no-store')
  const kind = c.req.query('kind')
  const filePath = c.req.query('path') ?? ''
  if (
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    !filePath
  ) {
    return c.html(
      <WorkTreeDiffPanel ok={false} stderr="missing or invalid kind/path" />,
      200,
    )
  }
  const r = await workTreeFilePatch(kind, filePath)
  if (!r.ok) {
    return c.html(<WorkTreeDiffPanel ok={false} stderr={r.stderr} />, 200)
  }
  return c.html(
    <WorkTreeDiffPanel
      ok={true}
      kind={kind}
      displayPath={filePath}
      patch={r.patch}
    />,
    200,
  )
})

app.post('/api/worktree/action', async (c) => {
  const kind = c.req.query('kind')
  const filePath = c.req.query('path') ?? ''
  if (
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    !filePath
  ) {
    return c.html(<StatusOob error="missing or invalid kind/path" />, 200)
  }

  const r = await applyWorkTreeAction(kind, filePath)
  if (!r.ok) {
    return c.html(<StatusOob error={r.stderr} />, 200)
  }

  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} swapOob />
      <DiffPanel state="empty" swapOob />
      <StatusOob />
    </Fragment>,
    200,
  )
})

app.post('/api/repo', async (c) => {
  let raw = c.req.query('path')?.trim() ?? ''
  if (!raw) {
    const body = await c.req.parseBody()
    const p = body.path
    raw = typeof p === 'string' ? p.trim() : ''
  }
  if (!raw) {
    return c.html(<StatusOob error="path required" />, 200)
  }
  const candidate = path.resolve(expandUser(raw))
  const ok = await isGitRepo(candidate)
  if (!ok) {
    return c.html(
      <StatusOob error={`not a git repo: ${candidate}`} />,
      200,
    )
  }

  setCurrentRepo(candidate)
  await attachWatcher()
  bumpRecent(candidate)
  const graph = await loadGraph()

  return c.html(
    <Fragment>
      <GraphFragment {...graph} swapOob />
      <DiffPanel state="empty" swapOob />
      <StatusOob />
    </Fragment>,
    200,
  )
})

app.post('/api/checkout/branch', async (c) => {
  const name = c.req.query('name')
  if (!name) {
    const graph = await loadGraph()
    return c.html(
      <Fragment>
        <GraphFragment {...graph} />
        <StatusOob error="missing branch name" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutBranch(name)
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/checkout/commit', async (c) => {
  const sha = c.req.query('sha')
  if (!sha) {
    const graph = await loadGraph()
    return c.html(
      <Fragment>
        <GraphFragment {...graph} />
        <StatusOob error="missing commit sha" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutCommit(sha)
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.get('/api/commit/:sha', async (c) => {
  const sha = c.req.param('sha')
  const r = await commitSummary(sha, { includeTags: true })
  if (!r.ok) {
    return c.html(<DiffPanel state="error" sha={sha} stderr={r.stderr} />, 200)
  }
  return c.html(<DiffPanel state="summary" sha={sha} summary={r.value} />, 200)
})

app.get('/api/commit/:sha/file', async (c) => {
  c.header('Cache-Control', 'no-store')
  const sha = c.req.param('sha')
  const filePath = c.req.query('path') ?? ''
  if (!filePath) {
    return c.html(
      <pre class="diff-body diff-patch-error">missing file path</pre>,
      200,
    )
  }
  const summary = await commitSummary(sha)
  if (!summary.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{summary.stderr}</pre>,
      200,
    )
  }
  const file = summary.value.files.find((f) => f.path === filePath)
  if (!file) {
    return c.html(
      <pre class="diff-body diff-patch-error">path not in commit file list</pre>,
      200,
    )
  }
  const r = await commitFilePatch(sha, filePath, summary.value.files)
  if (!r.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{r.stderr}</pre>,
      200,
    )
  }
  if (!r.patch.trim()) {
    return c.html(
      <pre class="diff-body diff-patch-empty">(no diff)</pre>,
      200,
    )
  }
  return c.html(<DiffPatchBody text={r.patch} compact />, 200)
})

app.post('/api/branch/create', async (c) => {
  const sha = c.req.query('sha') ?? ''
  const body = await c.req.parseBody()
  let name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    name =
      (c.req.header('HX-Prompt') ?? c.req.header('hx-prompt') ?? '').trim()
  }
  if (!sha || !name) {
    const next = await loadGraph()
    return c.html(
      <Fragment>
        <GraphFragment {...next} />
        <StatusOob error={!sha ? 'missing commit sha' : 'branch name required'} />
      </Fragment>,
      200,
    )
  }
  const r = await createBranchAt(sha, name)
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/push', async (c) => {
  const r = await push()
  if (r.ok) {
    return c.html(<StatusOob info={r.message} />, 200)
  }
  return c.html(<StatusOob error={r.stderr} />, 200)
})

app.get('/events', (c) => {
  c.status(200)
  return streamSSE(c, async (stream) => {
    let lastSent = state.lastChange
    await stream.writeSSE({ event: 'ready', data: String(lastSent) })

    while (!stream.aborted && !stream.closed) {
      if (state.lastChange > lastSent) {
        lastSent = state.lastChange
        await stream.writeSSE({ event: 'changed', data: String(lastSent) })
      }
      await stream.sleep(100)
    }
  })
})

if (state.server) {
  state.server.reload({ fetch: app.fetch })
} else {
  state.server = Bun.serve({ port: PORT, fetch: app.fetch })
  console.log(`dumbgit on http://localhost:${PORT}  (ctrl-c to quit)`)
  if (process.argv.includes('--open')) {
    setTimeout(() => {
      Bun.spawn(['open', `http://localhost:${PORT}`])
    }, 200)
  }
}
