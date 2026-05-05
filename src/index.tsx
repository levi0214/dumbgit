import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import {
  GitError,
  checkoutBranch,
  checkoutCommit,
  headInfo,
  listBranches,
  logGraph,
} from './git'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { Layout, RefreshToolbar } from './views/layout'
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

const app = new Hono()

app.get('/', async (c) => {
  const graph = await loadGraph()
  return c.html(
    <Layout>
      <div class="page">
        <RefreshToolbar />
        <div id="status" class="status-slot"></div>
        <GraphFragment {...graph} />
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
        <StatusOob stderr="missing branch name" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutBranch(name)
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob stderr={r.ok ? undefined : r.stderr} />
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
        <StatusOob stderr="missing commit sha" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutCommit(sha)
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob stderr={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

console.log(`http://localhost:${PORT}`)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
})
