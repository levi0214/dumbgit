/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawnSync } from 'node:child_process'
import net from 'node:net'
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
  dropPreviewStash,
  getCurrentRepo,
  gitDir,
  headInfo,
  initRepo,
  logGraphRows,
  previewStashUiState,
  push,
  restorePreviewStash,
  stashFilePatch,
  stashSummary,
  togglePreviewStash,
  workTreeFileAbsolutePath,
  workTreeFilePatch,
  workTreeSummary,
} from './git'
import { createIdleExit } from './idle-exit'
import { watchGitRefs } from './watch'
import {
  GraphFragment,
  GraphTailFragment,
  graphBrightCols,
  graphGutterCols,
  graphRowMeta,
} from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel, DiffPatchBody, WorkTreeDiffPanel } from './views/diff'
import { Layout } from './views/layout'
import { StatusOob } from './views/status'
import { WorkTreeFragment } from './views/worktree'

const LISTEN_HOST = '127.0.0.1'
/** Plain-text probe body for humans / curl. */
const HEALTH_BODY = 'dumbgit ok'

/** Same scan range as `bin/dumbgit` allocatePort (implicit port only). */
const PORT_PROBE_LO = 7777
const PORT_PROBE_HI = 7900

/** Initial / expanded `git log -n` depth (ASCII graph needs full re-fetch each time). */
const GRAPH_COMMIT_DEFAULT = 50
const GRAPH_COMMIT_STEP = 50
const GRAPH_COMMIT_MAX = 500

/** After last `/events` client leaves (or boot with none), exit. */
const IDLE_EXIT_GRACE_MS_DEFAULT = 60_000

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

function parseServerArgv(): {
  /** null = scan PORT_PROBE_LO..HI; number = pin to that port. */
  port: number | null
  open: boolean
  idleExit: boolean
  idleGraceMs: number
  repoAbs: string
} {
  let port: number | null = null
  let open = false
  let idleExit = true
  let idleGraceMs = IDLE_EXIT_GRACE_MS_DEFAULT
  const pos: string[] = []
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]
    if (a === '--open') {
      open = true
      continue
    }
    if (a === '--no-idle-exit') {
      idleExit = false
      continue
    }
    if (a === '--idle-grace-ms') {
      const n = Number(process.argv[++i])
      if (!Number.isFinite(n) || n < 1) {
        console.error(`dumbgit: bad --idle-grace-ms value`)
        process.exit(2)
      }
      idleGraceMs = Math.floor(n)
      continue
    }
    if (a === '--port') {
      const n = Number(process.argv[++i])
      if (!Number.isFinite(n) || n < 1 || n > 65535) {
        console.error(`dumbgit: bad --port value`)
        process.exit(2)
      }
      port = Math.floor(n)
      continue
    }
    if (!a || a.startsWith('-')) continue
    pos.push(a)
  }
  const raw = pos[0]
  const repoAbs = raw ? path.resolve(expandUser(raw)) : path.resolve(process.cwd())
  return { port, open, idleExit, idleGraceMs, repoAbs }
}

function portLooksFree(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.listen(p, LISTEN_HOST, () => {
      s.close(() => resolve(true))
    })
  })
}

const BOOT = parseServerArgv()

async function loadGraph(limit?: number): Promise<GraphFragmentProps> {
  const graphCommitLimit = clampGraphCommitLimit(limit ?? GRAPH_COMMIT_DEFAULT)
  try {
    const head = await headInfo()
    const rows = await logGraphRows(graphCommitLimit)
    const worktree = await workTreeSummary()
    const previewStash = await previewStashUiState()
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
      previewStash,
      repoPath: getCurrentRepo(),
      serverPid: process.pid,
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
      repoPath: getCurrentRepo(),
      serverPid: process.pid,
    }
  }
}

/**
 * Pinned to globalThis so `bun --hot` reloads keep the watcher, the server
 * handle, and the bound port across module re-evaluation.
 */
type DumbgitState = {
  lastChange: number
  /** SSE waiters woken by `bumpGitChange` (replaces 100ms polling). */
  changeWaiters: Set<() => void>
  closeWatch?: () => void
  server?: ReturnType<typeof Bun.serve>
  repoInitialized?: boolean
  listenPort?: number
}
const G = globalThis as { __dumbgit?: DumbgitState }
if (!G.__dumbgit) {
  G.__dumbgit = {
    lastChange: Date.now(),
    changeWaiters: new Set(),
  }
}
const state = G.__dumbgit
if (!state.changeWaiters) state.changeWaiters = new Set()

/** Record a refs change and wake every idle `/events` stream. */
function bumpGitChange() {
  state.lastChange = Date.now()
  for (const wake of state.changeWaiters) wake()
}

/**
 * Resolve when `state.lastChange` advances past `after`, or when `isDone`.
 * No timers while idle — avoids per-tab 10Hz `setTimeout` churn that grew
 * the JS heap over multi-day runs.
 */
function waitForGitChange(
  after: number,
  opts: { isDone: () => boolean; signal: AbortSignal },
): Promise<'change' | 'done'> {
  if (opts.isDone()) return Promise.resolve('done')
  if (state.lastChange > after) return Promise.resolve('change')

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: 'change' | 'done') => {
      if (settled) return
      settled = true
      state.changeWaiters.delete(wake)
      opts.signal.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const wake = () =>
      finish(state.lastChange > after ? 'change' : 'done')
    const onAbort = () => finish('done')
    state.changeWaiters.add(wake)
    opts.signal.addEventListener('abort', onAbort)
    // Close the notify→register race.
    if (opts.isDone()) {
      finish('done')
      return
    }
    if (state.lastChange > after) finish('change')
  })
}

/** Cached on state to survive `bun --watch` reloads. */
async function listenPort(): Promise<number> {
  if (state.listenPort !== undefined) return state.listenPort
  if (BOOT.port !== null) return (state.listenPort = BOOT.port)
  for (let p = PORT_PROBE_LO; p <= PORT_PROBE_HI; p++) {
    if (await portLooksFree(p)) return (state.listenPort = p)
  }
  console.error(`dumbgit: no free TCP port ${PORT_PROBE_LO}-${PORT_PROBE_HI}`)
  process.exit(1)
}

if (!state.repoInitialized) {
  try {
    await initRepo(BOOT.repoAbs)
    state.repoInitialized = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`dumbgit: ${msg}`)
    console.error(`run dumbgit from inside a git working tree`)
    process.exit(1)
  }
}

async function attachWatcher() {
  state.closeWatch?.()
  state.closeWatch = undefined
  const watchedDir = await gitDir()
  state.closeWatch = watchGitRefs(watchedDir, () => {
    bumpGitChange()
  })
}

await attachWatcher()

const idle = BOOT.idleExit
  ? createIdleExit({
      graceMs: BOOT.idleGraceMs,
      onIdle: () => {
        console.log('dumbgit: idle exit (no SSE clients)')
        process.exit(0)
      },
    })
  : null

const app = new Hono()

app.get('/healthz', (c) => c.text(`${HEALTH_BODY}\n`))

/** Launcher discovers running servers via this endpoint (JSON). */
app.get('/healthz.json', (c) => {
  c.header('Cache-Control', 'no-store')
  const port = state.listenPort
  if (port === undefined) {
    return c.json({ ok: false, error: 'not_ready' }, 503)
  }
  return c.json(
    {
      ok: true,
      name: 'dumbgit',
      repo: getCurrentRepo(),
      pid: process.pid,
      port,
    },
    200,
  )
})

app.get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  const graph = await loadGraph()
  const tabTitle = `dumbgit: ${path.basename(graph.repoPath)}`
  return c.html(
    <Layout title={tabTitle}>
      <div class="page">
        <div id="status" class="status-slot"></div>
        <div class="main-grid">
          <GraphFragment {...graph} />
          <div
            class="main-resizer"
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize · double-click to reset"
          ></div>
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

app.get('/fragment/graph/tail', async (c) => {
  c.header('Cache-Control', 'no-store')
  const offset = Math.max(
    0,
    Number.parseInt(c.req.query('offset') ?? '0', 10) || 0,
  )
  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '', 10)
  const graphCommitLimit = clampGraphCommitLimit(parsedLimit)
  const priorGutter = Number.parseInt(c.req.query('gutter') ?? '', 10)
  try {
    const head = await headInfo()
    const rows = await logGraphRows(graphCommitLimit)
    const previewStash = await previewStashUiState()
    const commitRows = rows.filter((r) => r.kind === 'commit').length
    const graphNextLimit = Math.min(
      graphCommitLimit + GRAPH_COMMIT_STEP,
      GRAPH_COMMIT_MAX,
    )
    const showLoadMore =
      commitRows >= graphCommitLimit &&
      commitRows > 0 &&
      graphCommitLimit < GRAPH_COMMIT_MAX
    const rowOffset = Math.min(offset, rows.length)
    // Appended rows keep at least the gutter already on screen so the
    // message column stays aligned across "load more" chunks.
    const gutterCols = Math.max(
      graphGutterCols(rows),
      Number.isFinite(priorGutter) ? priorGutter : 0,
    )
    return c.html(
      <GraphTailFragment
        rows={rows.slice(rowOffset)}
        detached={head.kind === 'detached'}
        currentBranch={head.kind === 'branch' ? head.name : null}
        stashes={previewStash.stashes}
        brightColsByRow={graphBrightCols(rows).slice(rowOffset)}
        rowMeta={graphRowMeta(rows).slice(rowOffset)}
        gutterCols={gutterCols}
        offset={rows.length}
        nextLimit={graphNextLimit}
        showLoadMore={showLoadMore}
      />,
      200,
    )
  } catch (e) {
    const stderr =
      e instanceof GitError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e)
    return c.html(<span class="graph-load-more-error">{stderr}</span>, 200)
  }
})

app.get('/fragment/worktree', async (c) => {
  c.header('Cache-Control', 'no-store')
  const wt = await workTreeSummary()
  const head = await headInfo()
  const previewStash = await previewStashUiState()
  return c.html(
    <WorkTreeFragment
      {...wt}
      currentSha={head.sha}
      previewStash={previewStash}
      repoPath={getCurrentRepo()}
    />,
    200,
  )
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
  const op = c.req.query('op')
  const filePath = c.req.query('path') ?? ''
  if (
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    (op !== 'stage' && op !== 'unstage' && op !== 'discard') ||
    !filePath
  ) {
    return c.html(<StatusOob error="missing or invalid worktree action" />, 200)
  }

  const r = await applyWorkTreeAction(kind, op, filePath)
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

app.post('/api/worktree/open', async (c) => {
  const kind = c.req.query('kind')
  const filePath = c.req.query('path') ?? ''
  if (
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    !filePath
  ) {
    return c.html(<StatusOob error="missing or invalid worktree file" />, 200)
  }

  const file = await workTreeFileAbsolutePath(kind, filePath)
  if (!file.ok) {
    return c.html(<StatusOob error={file.stderr} />, 200)
  }

  const r = spawnSync('open', ['-a', 'Sublime Text', file.path], {
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    const stderr = String(r.stderr ?? '').trim()
    return c.html(
      <StatusOob
        error={stderr || `open in Sublime failed (${r.status ?? 'unknown'})`}
      />,
      200,
    )
  }

  return c.html(<StatusOob />, 200)
})

app.post('/api/worktree/stash-toggle', async (c) => {
  const r = await togglePreviewStash()
  const next = await loadGraph()
  if (!next.ok) {
    return c.html(
      <Fragment>
        <GraphFragment {...next} />
        <StatusOob error={r.ok ? undefined : r.stderr} />
      </Fragment>,
      200,
    )
  }
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <DiffPanel state="empty" swapOob />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/worktree/stash-restore', async (c) => {
  const r = await restorePreviewStash(c.req.query('ref'))
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <DiffPanel state="empty" swapOob />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/worktree/stash-drop', async (c) => {
  const r = await dropPreviewStash(c.req.query('ref'))
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <DiffPanel state="empty" swapOob />
      <StatusOob error={r.ok ? undefined : r.stderr} />
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

app.get('/api/stash', async (c) => {
  const ref = c.req.query('ref') ?? ''
  if (!ref) {
    return c.html(<DiffPanel state="error" sha="stash" stderr="missing stash ref" />, 200)
  }
  const r = await stashSummary(ref)
  if (!r.ok) {
    return c.html(<DiffPanel state="error" sha={ref} stderr={r.stderr} />, 200)
  }
  return c.html(
    <DiffPanel
      state="summary"
      sha={ref}
      summary={r.value}
      fileUrlBase={`/api/stash/file?ref=${encodeURIComponent(ref)}`}
    />,
    200,
  )
})

app.get('/api/stash/file', async (c) => {
  c.header('Cache-Control', 'no-store')
  const ref = c.req.query('ref') ?? ''
  const filePath = c.req.query('path') ?? ''
  if (!ref || !filePath) {
    return c.html(
      <pre class="diff-body diff-patch-error">missing stash ref or file path</pre>,
      200,
    )
  }
  const summary = await stashSummary(ref)
  if (!summary.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{summary.stderr}</pre>,
      200,
    )
  }
  const r = await stashFilePatch(ref, filePath, summary.value.files)
  if (!r.ok) {
    return c.html(<pre class="diff-body diff-patch-error">{r.stderr}</pre>, 200)
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
  const next = await loadGraph()
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.get('/events', (c) => {
  c.status(200)
  return streamSSE(c, async (stream) => {
    idle?.clientEnter()
    let lastSent = state.lastChange
    const signal = c.req.raw.signal
    const isDone = () =>
      stream.aborted || stream.closed || signal.aborted

    // Always abort the Hono stream when the client drops (Hono only wires
    // this automatically on Bun 0.x/1.0/1.1).
    const onAbort = () => {
      if (!stream.aborted) stream.abort()
    }
    signal.addEventListener('abort', onAbort)
    stream.onAbort(() => {
      signal.removeEventListener('abort', onAbort)
    })

    try {
      await stream.writeSSE({ event: 'ready', data: String(lastSent) })
      while (!isDone()) {
        const result = await waitForGitChange(lastSent, { isDone, signal })
        if (result === 'done' || isDone()) break
        lastSent = state.lastChange
        await stream.writeSSE({
          event: 'changed',
          data: String(lastSent),
        })
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      idle?.clientLeave()
    }
  })
})

const port = await listenPort()

if (state.server) {
  state.server.reload({
    hostname: LISTEN_HOST,
    port,
    fetch: app.fetch,
  })
} else {
  state.server = Bun.serve({
    hostname: LISTEN_HOST,
    port,
    fetch: app.fetch,
  })
  const base = `http://${LISTEN_HOST}:${port}`
  console.log(`dumbgit on ${base}  (repo: ${getCurrentRepo()})`)
  if (idle) {
    idle.start()
    console.log(
      `exits after ${Math.round(BOOT.idleGraceMs / 1000)}s with no browser`,
    )
  } else {
    console.log('ctrl-c to quit, or `dumbgit stop --all`')
  }
  if (BOOT.open) {
    setTimeout(() => {
      Bun.spawn(['open', base])
    }, 200)
  }
}
