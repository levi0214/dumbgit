/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import {
  GitError,
  checkoutBranch,
  checkoutCommit,
  commitDetails,
  ensureGitRepo,
  headInfo,
  listBranches,
  logGraph,
  push,
} from './git'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel } from './views/diff'
import { Layout, Toolbar } from './views/layout'
import { StatusOob } from './views/status'

const PORT = 7777

async function loadGraph(): Promise<GraphFragmentProps> {
  try {
    const head = await headInfo()
    const branches = await listBranches()
    const log = await logGraph(50)
    return { ok: true, head, branches, log }
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

try {
  await ensureGitRepo()
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`dumbgit: ${msg}`)
  console.error(`run dumbgit from inside a git working tree`)
  process.exit(1)
}

const app = new Hono()

app.get('/', async (c) => {
  const graph = await loadGraph()
  return c.html(
    <Layout>
      <div class="page">
        <Toolbar />
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

app.get('/api/diff/:sha', async (c) => {
  const sha = c.req.param('sha')
  const r = await commitDetails(sha)
  if (!r.ok) {
    return c.html(<DiffPanel state="error" sha={sha} stderr={r.stderr} />, 200)
  }
  return c.html(<DiffPanel state="loaded" sha={sha} details={r.value} />, 200)
})

app.post('/api/push', async (c) => {
  const r = await push()
  if (r.ok) {
    return c.html(<StatusOob info={r.message} />, 200)
  }
  return c.html(<StatusOob error={r.stderr} />, 200)
})

console.log(`dumbgit on http://localhost:${PORT}  (ctrl-c to quit)`)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
})

if (process.argv.includes('--open')) {
  setTimeout(() => {
    Bun.spawn(['open', `http://localhost:${PORT}`])
  }, 200)
}
