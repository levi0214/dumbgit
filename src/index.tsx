/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
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
import { readRepoHistory, rememberRepo } from './history'
import { watchGitRefs } from './watch'
import {
  GraphFragment,
  GraphTailFragment,
  graphLaneGutterCols,
  graphLaneLayout,
} from './views/graph'
import type { GraphFragmentProps } from './views/graph'
import { DiffPanel, DiffPatchBody, WorkTreeDiffPanel } from './views/diff'
import { Layout } from './views/layout'
import { StatusOob } from './views/status'
import { WorkTreeFragment } from './views/worktree'
import {
  WorkspaceBoard,
  WorkspaceCommitInspector,
  WorkspacePatch,
  WorkspaceView,
  WorkspaceWorktreeInspector,
  type WorkspaceRepoSnapshot,
} from './views/workspace'

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
const WORKSPACE_COMMIT_DEFAULT = 5
const WORKSPACE_COMMIT_MAX = 10
const APP_ROOT = path.resolve(import.meta.dir, '..')
const LAUNCHER_PATH = path.join(APP_ROOT, 'bin', 'dumbgit')

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
  workspace: boolean
  repoAbs: string
} {
  let port: number | null = null
  let open = false
  let idleExit = true
  let idleGraceMs = IDLE_EXIT_GRACE_MS_DEFAULT
  let workspace = false
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
    if (a === '--workspace') {
      workspace = true
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
  return { port, open, idleExit, idleGraceMs, workspace, repoAbs }
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
    const commitRows = rows.length
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

type WorkspaceRepoSource = {
  repoPath: string
  running: boolean
  isHost: boolean
  port?: number
  url?: string
}

function clampWorkspaceCommitLimit(raw?: string): number {
  return Number.parseInt(raw ?? '', 10) === WORKSPACE_COMMIT_MAX
    ? WORKSPACE_COMMIT_MAX
    : WORKSPACE_COMMIT_DEFAULT
}

async function probeWorkspaceInstance(
  port: number,
): Promise<WorkspaceRepoSource | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 300)
  try {
    const response = await fetch(
      `http://${LISTEN_HOST}:${port}/healthz.json`,
      {
        cache: 'no-store',
        signal: controller.signal,
      },
    )
    if (!response.ok) return null
    const data = (await response.json()) as {
      ok?: unknown
      name?: unknown
      repo?: unknown
      port?: unknown
    }
    if (
      data.ok !== true ||
      data.name !== 'dumbgit' ||
      typeof data.repo !== 'string' ||
      data.port !== port
    ) {
      return null
    }
    return {
      repoPath: realpathSync(data.repo),
      running: true,
      isHost: port === state.listenPort,
      port,
      url: `http://${LISTEN_HOST}:${port}`,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function discoverWorkspaceRepos(): Promise<WorkspaceRepoSource[]> {
  const ports = Array.from(
    { length: PORT_PROBE_HI - PORT_PROBE_LO + 1 },
    (_, index) => PORT_PROBE_LO + index,
  )
  const live = (await Promise.all(ports.map(probeWorkspaceInstance))).filter(
    (repo): repo is WorkspaceRepoSource => repo !== null,
  )
  const history = readRepoHistory()
  const rememberedPaths = new Set(history.map((entry) => entry.repoPath))
  const byPath = new Map<string, WorkspaceRepoSource>()
  for (const entry of history) {
    byPath.set(entry.repoPath, {
      repoPath: entry.repoPath,
      running: false,
      isHost: false,
    })
  }
  for (const repo of live) {
    byPath.set(repo.repoPath, repo)
    if (!rememberedPaths.has(repo.repoPath)) rememberRepo(repo.repoPath)
  }

  const currentPort = state.listenPort
  if (!BOOT.workspace && currentPort !== undefined) {
    const repoPath = getCurrentRepo()
    byPath.set(repoPath, {
      repoPath,
      running: true,
      isHost: true,
      port: currentPort,
      url: `http://${LISTEN_HOST}:${currentPort}`,
    })
  }

  state.workspaceRepos.clear()
  for (const source of byPath.values()) {
    state.workspaceRepos.set(source.repoPath, source)
  }

  return [...byPath.values()].sort((a, b) => {
    const byName = path
      .basename(a.repoPath)
      .localeCompare(path.basename(b.repoPath))
    return byName || a.repoPath.localeCompare(b.repoPath)
  })
}

async function loadWorkspace(
  limit: number,
  options: { refreshStopped?: boolean } = {},
): Promise<WorkspaceRepoSnapshot[]> {
  const repos = await discoverWorkspaceRepos()
  return Promise.all(
    repos.map(async (source): Promise<WorkspaceRepoSnapshot> => {
      const cached = state.workspaceSnapshots.get(source.repoPath)
      if (
        !source.running &&
        !options.refreshStopped &&
        cached?.limit === limit
      ) {
        return {
          ...cached.snapshot,
          repoPath: source.repoPath,
          url: source.url,
          running: false,
          isHost: source.isHost,
        }
      }

      let snapshot: WorkspaceRepoSnapshot
      try {
        const [head, rows, worktree] = await Promise.all([
          headInfo(source.repoPath),
          logGraphRows(limit, source.repoPath),
          workTreeSummary(source.repoPath),
        ])
        snapshot = {
          ok: true,
          ...source,
          head,
          rows,
          worktree,
        }
      } catch (error) {
        snapshot = {
          ok: false,
          repoPath: source.repoPath,
          running: source.running,
          isHost: source.isHost,
          url: source.url,
          stderr:
            error instanceof Error ? error.message : String(error),
        }
      }
      state.workspaceSnapshots.set(source.repoPath, { limit, snapshot })
      return snapshot
    }),
  )
}

async function runDumbgitLauncher(
  args: string[],
): Promise<
  { ok: true; stdout: string } | { ok: false; stderr: string }
> {
  const child = Bun.spawn([process.execPath, LAUNCHER_PATH, ...args], {
    cwd: APP_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code === 0) return { ok: true, stdout: stdout.trim() }
  return {
    ok: false,
    stderr:
      stderr.trim() ||
      stdout.trim() ||
      `dumbgit launcher exited with status ${code}`,
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
  /** Repositories seen through local dumbgit instances during this process. */
  workspaceRepos: Map<string, WorkspaceRepoSource>
  /** Last rendered snapshot; stopped repositories do not refresh on polling. */
  workspaceSnapshots: Map<
    string,
    { limit: number; snapshot: WorkspaceRepoSnapshot }
  >
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
    workspaceRepos: new Map(),
    workspaceSnapshots: new Map(),
  }
}
const state = G.__dumbgit
if (!state.changeWaiters) state.changeWaiters = new Set()
if (!state.workspaceRepos) state.workspaceRepos = new Map()
if (!state.workspaceSnapshots) state.workspaceSnapshots = new Map()

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

if (!BOOT.workspace && !state.repoInitialized) {
  try {
    await initRepo(BOOT.repoAbs)
    rememberRepo(getCurrentRepo())
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

if (!BOOT.workspace) await attachWatcher()

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
    BOOT.workspace
      ? {
          ok: true,
          name: 'dumbgit',
          kind: 'workspace',
          pid: process.pid,
          port,
        }
      : {
          ok: true,
          name: 'dumbgit',
          kind: 'repo',
          repo: getCurrentRepo(),
          pid: process.pid,
          port,
        },
    200,
  )
})

app.get('/', async (c) => {
  if (BOOT.workspace) return c.redirect('/workspace')
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

function workspaceRepoFromQuery(raw?: string): string | null {
  if (!raw) return null
  try {
    const repoPath = realpathSync(raw)
    if (
      (!BOOT.workspace && repoPath === getCurrentRepo()) ||
      state.workspaceRepos.has(repoPath)
    ) {
      return repoPath
    }
  } catch {
    // Invalid or no longer available path.
  }
  return null
}

app.get('/workspace', async (c) => {
  c.header('Cache-Control', 'no-store')
  if (!BOOT.workspace) {
    const result = await runDumbgitLauncher(['workspace', '--no-open'])
    if (!result.ok) return c.text(result.stderr, 500)
    const url = result.stdout
      .split(/\s+/)
      .find((value) => /^http:\/\/127\.0\.0\.1:\d+\/workspace$/.test(value))
    if (!url) return c.text('dumbgit: workspace URL not found', 500)
    return c.redirect(url)
  }
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repos = await loadWorkspace(limit, { refreshStopped: true })
  return c.html(
    <Layout title="dumbgit: Workspace">
      <WorkspaceView
        repos={repos}
        currentRepo={BOOT.workspace ? '' : getCurrentRepo()}
        limit={limit}
      />
    </Layout>,
    200,
  )
})

app.get('/fragment/workspace', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repos = await loadWorkspace(limit)
  return c.html(
    <WorkspaceBoard
      repos={repos}
      currentRepo={BOOT.workspace ? '' : getCurrentRepo()}
      limit={limit}
    />,
    200,
  )
})

app.post('/workspace/repo/start', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  let controlError: string | undefined
  if (!repoPath) {
    controlError = 'Repository is not in Workspace history.'
  } else {
    const source = state.workspaceRepos.get(repoPath)
    if (!source?.running) {
      const result = await runDumbgitLauncher([
        '--no-open',
        repoPath,
      ])
      if (!result.ok) controlError = result.stderr
    }
  }
  const repos = await loadWorkspace(limit)
  return c.html(
    <WorkspaceBoard
      repos={repos}
      currentRepo={BOOT.workspace ? '' : getCurrentRepo()}
      limit={limit}
      controlError={controlError}
    />,
    200,
  )
})

app.post('/workspace/repo/stop', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  let controlError: string | undefined
  if (!repoPath) {
    controlError = 'Repository is not in Workspace history.'
  } else {
    const source = state.workspaceRepos.get(repoPath)
    if (source?.isHost) {
      controlError =
        'This repository is hosting the current Workspace. Run `dumbgit workspace` to use the independent controller.'
    } else if (source?.running) {
      const result = await runDumbgitLauncher(['stop', repoPath])
      if (!result.ok) controlError = result.stderr
    }
  }
  const repos = await loadWorkspace(limit)
  return c.html(
    <WorkspaceBoard
      repos={repos}
      currentRepo={BOOT.workspace ? '' : getCurrentRepo()}
      limit={limit}
      controlError={controlError}
    />,
    200,
  )
})

app.get('/workspace/commit', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  const sha = c.req.query('sha') ?? ''
  if (!repoPath || !/^[a-f0-9]{7,40}$/i.test(sha)) {
    return c.html(
      <WorkspaceCommitInspector
        repoPath={repoPath ?? getCurrentRepo()}
        sha={sha || 'invalid'}
        summary={{ ok: false, stderr: 'missing or invalid repo/commit' }}
      />,
      200,
    )
  }
  const summary = await commitSummary(
    sha,
    { includeTags: true },
    repoPath,
  )
  return c.html(
    <WorkspaceCommitInspector
      repoPath={repoPath}
      sha={sha}
      summary={summary}
    />,
    200,
  )
})

app.get('/workspace/commit/file', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  const sha = c.req.query('sha') ?? ''
  const filePath = c.req.query('path') ?? ''
  if (
    !repoPath ||
    !/^[a-f0-9]{7,40}$/i.test(sha) ||
    !filePath
  ) {
    return c.html(
      <pre class="diff-body diff-patch-error">
        missing or invalid repo/commit/path
      </pre>,
      200,
    )
  }
  const summary = await commitSummary(sha, {}, repoPath)
  if (!summary.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{summary.stderr}</pre>,
      200,
    )
  }
  const patch = await commitFilePatch(
    sha,
    filePath,
    summary.value.files,
    repoPath,
  )
  if (!patch.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{patch.stderr}</pre>,
      200,
    )
  }
  return c.html(<WorkspacePatch patch={patch.patch} />, 200)
})

app.get('/workspace/worktree', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  if (!repoPath) {
    return c.html(
      <WorkspaceCommitInspector
        repoPath={getCurrentRepo()}
        sha="worktree"
        summary={{ ok: false, stderr: 'missing or invalid repository' }}
      />,
      200,
    )
  }
  const worktree = await workTreeSummary(repoPath)
  return c.html(
    <WorkspaceWorktreeInspector
      repoPath={repoPath}
      worktree={worktree}
    />,
    200,
  )
})

app.get('/workspace/worktree/file', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = workspaceRepoFromQuery(c.req.query('repo'))
  const kind = c.req.query('kind')
  const filePath = c.req.query('path') ?? ''
  if (
    !repoPath ||
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    !filePath
  ) {
    return c.html(
      <pre class="diff-body diff-patch-error">
        missing or invalid repo/kind/path
      </pre>,
      200,
    )
  }
  const patch = await workTreeFilePatch(kind, filePath, repoPath)
  if (!patch.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{patch.stderr}</pre>,
      200,
    )
  }
  return c.html(<WorkspacePatch patch={patch.patch} />, 200)
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
    const commitRows = rows.length
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
    const laneLayout = graphLaneLayout(rows)
    const gutterCols = Math.max(
      graphLaneGutterCols(laneLayout.laneCount),
      Number.isFinite(priorGutter) ? priorGutter : 0,
    )
    return c.html(
      <GraphTailFragment
        rows={rows.slice(rowOffset)}
        detached={head.kind === 'detached'}
        currentBranch={head.kind === 'branch' ? head.name : null}
        stashes={previewStash.stashes}
        laneLayoutByRow={laneLayout.rows.slice(rowOffset)}
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
  // Wait/notify SSE is quiet between ref changes. Bun.serve's default
  // idleTimeout (10s) would kill the stream and flash the disconnect overlay.
  state.server?.timeout(c.req.raw, 0)
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
    // Long-lived /events streams; process lifetime is owned by idle-exit.
    idleTimeout: 0,
  })
} else {
  state.server = Bun.serve({
    hostname: LISTEN_HOST,
    port,
    fetch: app.fetch,
    idleTimeout: 0,
  })
  const base = `http://${LISTEN_HOST}:${port}`
  console.log(
    BOOT.workspace
      ? `dumbgit workspace on ${base}/workspace`
      : `dumbgit on ${base}  (repo: ${getCurrentRepo()})`,
  )
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
      Bun.spawn(['open', BOOT.workspace ? `${base}/workspace` : base])
    }, 200)
  }
}
