import { Hono } from 'hono'
import { GitError, headInfo, listBranches, logGraph } from './git'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { Layout, RefreshToolbar } from './views/layout'

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

console.log(`http://localhost:${PORT}`)
Bun.serve({
  port: PORT,
  fetch: app.fetch,
})
