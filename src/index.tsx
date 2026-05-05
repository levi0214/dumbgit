/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  GitError,
  checkoutBranch,
  checkoutCommit,
  commitPatch,
  commitSummary,
  ensureGitRepo,
  gitDir,
  headInfo,
  logGraphRows,
  push,
  workTreeSummary,
} from './git'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel, DiffPatchBody } from './views/diff'
import { Layout } from './views/layout'
import { StatusOob } from './views/status'
import { watchGitRefs } from './watch'
import { WorkTreeFragment } from './views/worktree'

const PORT = 7777

async function loadGraph(): Promise<GraphFragmentProps> {
  try {
    const head = await headInfo()
    const rows = await logGraphRows(50)
    const worktree = await workTreeSummary()
    return { ok: true, head, rows, worktree }
  } catch (e) {
    const stderr =
      e instanceof GitError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e)
    return { ok: false, stderr }
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
  watchAttached: boolean
  server?: ReturnType<typeof Bun.serve>
}
const G = globalThis as { __dumbgit?: DumbgitState }
if (!G.__dumbgit) {
  G.__dumbgit = { lastChange: Date.now(), watchAttached: false }
}
const state = G.__dumbgit

try {
  await ensureGitRepo()
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`dumbgit: ${msg}`)
  console.error(`run dumbgit from inside a git working tree`)
  process.exit(1)
}

if (!state.watchAttached) {
  state.watchAttached = true
  const watchedDir = await gitDir()
  watchGitRefs(watchedDir, () => {
    state.lastChange = Date.now()
  })
}

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
  const graph = await loadGraph()
  return c.html(<GraphFragment {...graph} />, 200)
})

app.get('/fragment/worktree', async (c) => {
  const wt = await workTreeSummary()
  return c.html(<WorkTreeFragment {...wt} />, 200)
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
  const r = await commitSummary(sha)
  if (!r.ok) {
    return c.html(<DiffPanel state="error" sha={sha} stderr={r.stderr} />, 200)
  }
  return c.html(<DiffPanel state="summary" sha={sha} summary={r.value} />, 200)
})

app.get('/api/diff/:sha/patch', async (c) => {
  const sha = c.req.param('sha')
  const r = await commitPatch(sha)
  if (!r.ok) {
    return c.html(<pre class="diff-body diff-patch-error">{r.stderr}</pre>, 200)
  }
  if (!r.patch.trim()) {
    return c.html(
      <pre class="diff-body diff-patch-empty">(empty patch)</pre>,
      200,
    )
  }
  return c.html(<DiffPatchBody text={r.patch} />, 200)
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
