/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import os from 'node:os'
import path from 'node:path'
import {
  GitError,
  checkoutBranch,
  checkoutCommit,
  commitPatch,
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
  workTreeSummary,
} from './git'
import { bumpRecent, loadRecents } from './recents'
import { GraphFragment } from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel, DiffPatchBody } from './views/diff'
import { Layout } from './views/layout'
import { RepoBar } from './views/repo'
import { StatusOob } from './views/status'
import { watchGitRefs } from './watch'
import { WorkTreeFragment } from './views/worktree'

const PORT = 7777

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
        <RepoBar root={getCurrentRepo()} recents={loadRecents()} />
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
      <RepoBar root={candidate} recents={loadRecents()} oob />
      <GraphFragment {...graph} swapOob />
      <DiffPanel state="empty" swapOob />
      <StatusOob info={`opened ${path.basename(candidate)}`} />
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

app.post('/api/branch/create', async (c) => {
  const sha = c.req.query('sha') ?? ''
  const name = (c.req.header('HX-Prompt') ?? '').trim()
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
      <StatusOob
        error={r.ok ? undefined : r.stderr}
        info={r.ok ? `created and switched to ${name}` : undefined}
      />
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
