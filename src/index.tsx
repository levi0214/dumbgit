/** @jsxImportSource hono/jsx */
import { Fragment } from 'hono/jsx'
import { Hono, type Context, type Next } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
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
  gitDir,
  headInfo,
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
  workspaceRepoFingerprint,
} from './git'
import { createIdleExit } from './idle-exit'
import {
  readRepoHistory,
  reorderRepoHistory,
  setRepoActive,
} from './history'
import { watchGitRefs } from './watch'
import {
  GraphFragment,
  GraphTailFragment,
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
  workspaceSafeRepoText,
} from './views/workspace'

const LISTEN_HOST = '127.0.0.1'
/** Plain-text probe body for humans / curl. */
const HEALTH_BODY = 'dumbgit ok'

/** The single Workspace controller always owns one stable local port. */
const DEFAULT_PORT = 7777

/** Initial / expanded `git log -n` depth (ASCII graph needs full re-fetch each time). */
const GRAPH_COMMIT_DEFAULT = 50
const GRAPH_COMMIT_STEP = 50
const GRAPH_COMMIT_MAX = 500
const WORKSPACE_COMMIT_DEFAULT = 5
const WORKSPACE_COMMIT_MAX = 10

const GHOSTTY_NEW_WINDOW_SCRIPT = `
on run argv
  tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to item 1 of argv
    set win to new window with configuration cfg
    focus (terminal 1 of selected tab of win)
  end tell
end run
`

/** After last `/events` client leaves (or boot with none), exit. */
const IDLE_EXIT_GRACE_MS_DEFAULT = 8 * 60 * 60_000

function clampGraphCommitLimit(n: number): number {
  if (!Number.isFinite(n)) return GRAPH_COMMIT_DEFAULT
  const floored = Math.floor(n)
  return Math.min(GRAPH_COMMIT_MAX, Math.max(10, floored))
}

function parseServerArgv(): {
  /** null = use the single default port; number = explicit development override. */
  port: number | null
  open: boolean
  idleExit: boolean
  idleGraceMs: number
} {
  let port: number | null = null
  let open = false
  let idleExit = true
  let idleGraceMs = IDLE_EXIT_GRACE_MS_DEFAULT
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
  }
  return { port, open, idleExit, idleGraceMs }
}

const BOOT = parseServerArgv()

async function loadGraph(
  repoPath: string,
  limit?: number,
): Promise<GraphFragmentProps> {
  const graphCommitLimit = clampGraphCommitLimit(limit ?? GRAPH_COMMIT_DEFAULT)
  try {
    const [head, rows, worktree, previewStash] = await Promise.all([
      headInfo(repoPath),
      logGraphRows(graphCommitLimit, repoPath),
      workTreeSummary(repoPath),
      previewStashUiState(repoPath),
    ])
    const commitRows = rows.length
    const graphNextLimit = Math.min(
      graphCommitLimit + GRAPH_COMMIT_STEP,
      GRAPH_COMMIT_MAX,
    )
    return {
      ok: true,
      head,
      rows,
      worktree,
      previewStash,
      repoPath,
      serverPid: process.pid,
      graphCommitLimit,
      graphNextLimit,
      showLoadMore:
        commitRows >= graphCommitLimit &&
        commitRows > 0 &&
        graphCommitLimit < GRAPH_COMMIT_MAX,
    }
  } catch (e) {
    return {
      ok: false,
      stderr:
        e instanceof GitError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e),
      repoPath,
      serverPid: process.pid,
    }
  }
}

type WorkspaceRepoSource = {
  repoPath: string
  active: boolean
  revision?: number
}

function clampWorkspaceCommitLimit(raw?: string): number {
  return Number.parseInt(raw ?? '', 10) === WORKSPACE_COMMIT_MAX
    ? WORKSPACE_COMMIT_MAX
    : WORKSPACE_COMMIT_DEFAULT
}

async function syncRepoWatchers(): Promise<void> {
  const active = new Set(
    readRepoHistory()
      .filter((entry) => entry.active)
      .map((entry) => entry.repoPath),
  )
  for (const [repoPath, close] of state.repoWatchers) {
    if (active.has(repoPath)) continue
    close()
    state.repoWatchers.delete(repoPath)
  }
  await Promise.all(
    [...active].map(async (repoPath) => {
      if (state.repoWatchers.has(repoPath)) return
      try {
        const watchedDir = await gitDir(repoPath)
        state.repoWatchers.set(
          repoPath,
          watchGitRefs(watchedDir, () => bumpGitChange(repoPath)),
        )
      } catch {
        // The card's normal Git read reports unavailable repositories.
      }
    }),
  )
}

async function discoverWorkspaceRepos(): Promise<WorkspaceRepoSource[]> {
  const repos = readRepoHistory().map((entry) => ({
    repoPath: entry.repoPath,
    active: entry.active,
    revision: state.repoRevisions.get(entry.repoPath),
  }))
  await syncRepoWatchers()
  return repos
}

async function loadWorkspace(
  limit: number,
  options: {
    refreshInactive?: boolean
    forceRefresh?: boolean
  } = {},
): Promise<WorkspaceRepoSnapshot[]> {
  const repos = await discoverWorkspaceRepos()
  return Promise.all(
    repos.map(async (source): Promise<WorkspaceRepoSnapshot> => {
      const cached = state.workspaceSnapshots.get(source.repoPath)
      if (
        !source.active &&
        !options.refreshInactive &&
        cached?.limit === limit
      ) {
        return {
          ...cached.snapshot,
          repoPath: source.repoPath,
          active: false,
        }
      }

      let fingerprint: string | undefined
      if (source.active) {
        try {
          fingerprint = await workspaceRepoFingerprint(source.repoPath)
        } catch {
          // Fall through to the full read so its existing error UI is used.
        }
      }
      if (
        source.active &&
        !options.forceRefresh &&
        cached?.limit === limit &&
        cached.revision === source.revision &&
        cached.fingerprint === fingerprint &&
        cached.snapshot.ok
      ) {
        return {
          ...cached.snapshot,
          repoPath: source.repoPath,
          active: true,
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
          repoPath: source.repoPath,
          active: source.active,
          head,
          rows,
          worktree,
        }
      } catch (error) {
        snapshot = {
          ok: false,
          repoPath: source.repoPath,
          active: source.active,
          stderr: error instanceof Error ? error.message : String(error),
        }
      }
      state.workspaceSnapshots.set(source.repoPath, {
        limit,
        snapshot,
        revision: source.revision,
        fingerprint,
      })
      return snapshot
    }),
  )
}

/**
 * Pinned to globalThis so `bun --hot` reloads keep the watcher, the server
 * handle, and the bound port across module re-evaluation.
 */
type DumbgitState = {
  lastChange: number
  /** SSE waiters woken by `bumpGitChange` (replaces 100ms polling). */
  changeWaiters: Set<() => void>
  /** Last rendered snapshot; inactive repositories do not refresh on polling. */
  workspaceSnapshots: Map<
    string,
    {
      limit: number
      snapshot: WorkspaceRepoSnapshot
      revision?: number
      fingerprint?: string
    }
  >
  repoWatchers: Map<string, () => void>
  repoRevisions: Map<string, number>
  server?: ReturnType<typeof Bun.serve>
  listenPort?: number
}
const G = globalThis as { __dumbgit?: DumbgitState }
if (!G.__dumbgit) {
  G.__dumbgit = {
    lastChange: Date.now(),
    changeWaiters: new Set(),
    workspaceSnapshots: new Map(),
    repoWatchers: new Map(),
    repoRevisions: new Map(),
  }
}
const state = G.__dumbgit
if (!state.changeWaiters) state.changeWaiters = new Set()
if (!state.workspaceSnapshots) state.workspaceSnapshots = new Map()
if (!state.repoWatchers) state.repoWatchers = new Map()
if (!state.repoRevisions) state.repoRevisions = new Map()

/** Record a refs change and wake every idle `/events` stream. */
function bumpGitChange(repoPath?: string) {
  state.lastChange = Date.now()
  if (repoPath) state.repoRevisions.set(repoPath, state.lastChange)
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
  return (state.listenPort = BOOT.port ?? DEFAULT_PORT)
}

const idle = BOOT.idleExit
  ? createIdleExit({
      graceMs: BOOT.idleGraceMs,
      onIdle: () => {
        console.log('dumbgit: idle exit (no SSE clients)')
        process.exit(0)
      },
    })
  : null

type AppEnv = {
  Variables: {
    repoPath: string
  }
}

export const app = new Hono<AppEnv>()

app.get('/healthz', (c) => c.text(`${HEALTH_BODY}\n`))

/** Launcher finds the controller and its PID here. */
app.get('/healthz.json', (c) => {
  c.header('Cache-Control', 'no-store')
  const port = state.listenPort
  if (port === undefined) {
    return c.json({ ok: false, error: 'not_ready' }, 503)
  }
  return c.json({
    ok: true,
    name: 'dumbgit',
    kind: 'workspace',
    pid: process.pid,
    port,
  })
})

function resolveWorkspaceRepo(
  raw?: string,
  options: { requireActive?: boolean } = {},
): string | null {
  if (!raw) return null
  try {
    const repoPath = realpathSync(raw)
    const entry = readRepoHistory().find(
      (candidate) => candidate.repoPath === repoPath,
    )
    if (!entry || (options.requireActive && !entry.active)) return null
    return repoPath
  } catch {
    return null
  }
}

async function renderWorkspace(c: Context) {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repos = await loadWorkspace(limit, {
    refreshInactive: true,
    forceRefresh: true,
  })
  return c.html(
    <Layout title="dumbgit">
      <WorkspaceView repos={repos} limit={limit} />
    </Layout>,
    200,
  )
}

app.get('/', renderWorkspace)

app.get('/repo', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'), {
    requireActive: true,
  })
  if (!repoPath) return c.redirect('/')
  const graph = await loadGraph(repoPath)
  return c.html(
    <Layout title={`dumbgit: ${path.basename(repoPath)}`} repoPath={repoPath}>
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

app.get('/workspace', (c) => {
  const query = c.req.url.split('?')[1]
  return c.redirect(query ? `/?${query}` : '/')
})

app.get('/fragment/workspace', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repos = await loadWorkspace(limit)
  return c.html(
    <WorkspaceBoard repos={repos} limit={limit} />,
    200,
  )
})

app.post('/workspace/repo/reorder', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }
  const repoPaths =
    body &&
    typeof body === 'object' &&
    'repos' in body &&
    Array.isArray(body.repos)
      ? body.repos
      : null
  if (
    !repoPaths ||
    repoPaths.some((repoPath) => typeof repoPath !== 'string')
  ) {
    return c.json({ ok: false, error: 'invalid_repositories' }, 400)
  }

  const ordered = [...new Set(repoPaths as string[])]
  const known = new Set(readRepoHistory().map((repo) => repo.repoPath))
  if (ordered.some((repoPath) => !known.has(repoPath))) {
    return c.json({ ok: false, error: 'unknown_repository' }, 400)
  }
  reorderRepoHistory(ordered)
  return c.body(null, 204)
})

app.post('/workspace/repo/start', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
  const controlError =
    repoPath && setRepoActive(repoPath, true)
      ? undefined
      : 'Repository is not in Workspace history.'
  await syncRepoWatchers()
  const repos = await loadWorkspace(limit, { forceRefresh: true })
  return c.html(
    <WorkspaceBoard
      repos={repos}
      limit={limit}
      controlError={controlError}
    />,
    200,
  )
})

app.post('/workspace/repo/stop', async (c) => {
  c.header('Cache-Control', 'no-store')
  const limit = clampWorkspaceCommitLimit(c.req.query('limit'))
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
  const controlError =
    repoPath && setRepoActive(repoPath, false)
      ? undefined
      : 'Repository is not in Workspace history.'
  await syncRepoWatchers()
  const repos = await loadWorkspace(limit)
  return c.html(
    <WorkspaceBoard
      repos={repos}
      limit={limit}
      controlError={controlError}
    />,
    200,
  )
})

app.post('/workspace/repo/terminal', (c) => {
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
  if (!repoPath) {
    return c.text('Repository is not in Workspace history.', 404)
  }

  const result = spawnSync(
    'osascript',
    [
      '-e',
      GHOSTTY_NEW_WINDOW_SCRIPT,
      '--',
      repoPath,
    ],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim()
    return c.text(
      stderr ||
        `Failed to create Ghostty window (${result.status ?? 'unknown'}).`,
      500,
    )
  }

  return c.body(null, 204)
})

app.get('/workspace/commit', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
  const sha = c.req.query('sha') ?? ''
  if (!repoPath || !/^[a-f0-9]{7,40}$/i.test(sha)) {
    return c.html(
      <WorkspaceCommitInspector
        repoPath={repoPath ?? c.req.query('repo') ?? 'unknown'}
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
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
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
      <pre class="diff-body diff-patch-error">
        {workspaceSafeRepoText(summary.stderr, repoPath)}
      </pre>,
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
      <pre class="diff-body diff-patch-error">
        {workspaceSafeRepoText(patch.stderr, repoPath)}
      </pre>,
      200,
    )
  }
  return c.html(<WorkspacePatch patch={patch.patch} />, 200)
})

app.get('/workspace/worktree', async (c) => {
  c.header('Cache-Control', 'no-store')
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
  if (!repoPath) {
    return c.html(
      <WorkspaceCommitInspector
        repoPath={c.req.query('repo') ?? 'unknown'}
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
  const repoPath = resolveWorkspaceRepo(c.req.query('repo'))
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
      <pre class="diff-body diff-patch-error">
        {workspaceSafeRepoText(patch.stderr, repoPath)}
      </pre>,
      200,
    )
  }
  return c.html(<WorkspacePatch patch={patch.patch} />, 200)
})

async function requireActiveRepo(c: Context<AppEnv>, next: Next) {
  let rawRepo = c.req.query('repo')
  if (!rawRepo && c.req.method === 'POST') {
    try {
      const body = await c.req.parseBody()
      if (typeof body.repo === 'string') rawRepo = body.repo
    } catch {
      // Invalid request bodies fail through the normal missing-repository path.
    }
  }
  const repoPath = resolveWorkspaceRepo(rawRepo, {
    requireActive: true,
  })
  if (!repoPath) return c.text('missing, inactive, or unknown repository', 400)
  c.set('repoPath', repoPath)
  await next()
}

app.use('/fragment/graph', requireActiveRepo)
app.use('/fragment/graph/*', requireActiveRepo)
app.use('/fragment/worktree', requireActiveRepo)
app.use('/api/*', requireActiveRepo)

app.get('/fragment/graph', async (c) => {
  const repoPath = c.get('repoPath')
  c.header('Cache-Control', 'no-store')
  const q = c.req.query('limit')
  const parsed = q !== undefined ? Number.parseInt(q, 10) : NaN
  const graph = await loadGraph(
    repoPath,
    Number.isFinite(parsed) ? parsed : undefined,
  )
  return c.html(<GraphFragment {...graph} />, 200)
})

app.get('/fragment/graph/tail', async (c) => {
  const repoPath = c.get('repoPath')
  c.header('Cache-Control', 'no-store')
  const offset = Math.max(
    0,
    Number.parseInt(c.req.query('offset') ?? '0', 10) || 0,
  )
  const parsedLimit = Number.parseInt(c.req.query('limit') ?? '', 10)
  const graphCommitLimit = clampGraphCommitLimit(parsedLimit)
  try {
    const head = await headInfo(repoPath)
    const rows = await logGraphRows(graphCommitLimit, repoPath)
    const previewStash = await previewStashUiState(repoPath)
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
    const laneLayout = graphLaneLayout(rows)
    return c.html(
      <GraphTailFragment
        rows={rows.slice(rowOffset)}
        detached={head.kind === 'detached'}
        currentBranch={head.kind === 'branch' ? head.name : null}
        stashes={previewStash.stashes}
        laneLayoutByRow={laneLayout.rows.slice(rowOffset)}
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
  const repoPath = c.get('repoPath')
  c.header('Cache-Control', 'no-store')
  const wt = await workTreeSummary(repoPath)
  const head = await headInfo(repoPath)
  const previewStash = await previewStashUiState(repoPath)
  return c.html(
    <WorkTreeFragment
      {...wt}
      currentSha={head.sha}
      previewStash={previewStash}
      repoPath={repoPath}
    />,
    200,
  )
})

app.get('/api/worktree/file', async (c) => {
  const repoPath = c.get('repoPath')
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
  const r = await workTreeFilePatch(kind, filePath, repoPath)
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
  const repoPath = c.get('repoPath')
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

  const r = await applyWorkTreeAction(kind, op, filePath, repoPath)
  if (!r.ok) {
    return c.html(<StatusOob error={r.stderr} />, 200)
  }

  const next = await loadGraph(repoPath)
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
  const repoPath = c.get('repoPath')
  const kind = c.req.query('kind')
  const filePath = c.req.query('path') ?? ''
  if (
    (kind !== 'staged' && kind !== 'unstaged' && kind !== 'untracked') ||
    !filePath
  ) {
    return c.html(<StatusOob error="missing or invalid worktree file" />, 200)
  }

  const file = await workTreeFileAbsolutePath(kind, filePath, repoPath)
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
  const repoPath = c.get('repoPath')
  const r = await togglePreviewStash(repoPath)
  const next = await loadGraph(repoPath)
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
  const repoPath = c.get('repoPath')
  const r = await restorePreviewStash(c.req.query('ref'), repoPath)
  const next = await loadGraph(repoPath)
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
  const repoPath = c.get('repoPath')
  const r = await dropPreviewStash(c.req.query('ref'), repoPath)
  const next = await loadGraph(repoPath)
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
  const repoPath = c.get('repoPath')
  const name = c.req.query('name')
  if (!name) {
    const graph = await loadGraph(repoPath)
    return c.html(
      <Fragment>
        <GraphFragment {...graph} />
        <StatusOob error="missing branch name" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutBranch(name, repoPath)
  const next = await loadGraph(repoPath)
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/checkout/commit', async (c) => {
  const repoPath = c.get('repoPath')
  const sha = c.req.query('sha')
  if (!sha) {
    const graph = await loadGraph(repoPath)
    return c.html(
      <Fragment>
        <GraphFragment {...graph} />
        <StatusOob error="missing commit sha" />
      </Fragment>,
      200,
    )
  }
  const r = await checkoutCommit(sha, repoPath)
  const next = await loadGraph(repoPath)
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.get('/api/commit/:sha', async (c) => {
  const repoPath = c.get('repoPath')
  const sha = c.req.param('sha')
  const r = await commitSummary(sha, { includeTags: true }, repoPath)
  if (!r.ok) {
    return c.html(<DiffPanel state="error" sha={sha} stderr={r.stderr} />, 200)
  }
  return c.html(<DiffPanel state="summary" sha={sha} summary={r.value} />, 200)
})

app.get('/api/commit/:sha/file', async (c) => {
  const repoPath = c.get('repoPath')
  c.header('Cache-Control', 'no-store')
  const sha = c.req.param('sha')
  const filePath = c.req.query('path') ?? ''
  if (!filePath) {
    return c.html(
      <pre class="diff-body diff-patch-error">missing file path</pre>,
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
  const file = summary.value.files.find((f) => f.path === filePath)
  if (!file) {
    return c.html(
      <pre class="diff-body diff-patch-error">path not in commit file list</pre>,
      200,
    )
  }
  const r = await commitFilePatch(sha, filePath, summary.value.files, repoPath)
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
  const repoPath = c.get('repoPath')
  const ref = c.req.query('ref') ?? ''
  if (!ref) {
    return c.html(<DiffPanel state="error" sha="stash" stderr="missing stash ref" />, 200)
  }
  const r = await stashSummary(ref, repoPath)
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
  const repoPath = c.get('repoPath')
  c.header('Cache-Control', 'no-store')
  const ref = c.req.query('ref') ?? ''
  const filePath = c.req.query('path') ?? ''
  if (!ref || !filePath) {
    return c.html(
      <pre class="diff-body diff-patch-error">missing stash ref or file path</pre>,
      200,
    )
  }
  const summary = await stashSummary(ref, repoPath)
  if (!summary.ok) {
    return c.html(
      <pre class="diff-body diff-patch-error">{summary.stderr}</pre>,
      200,
    )
  }
  const r = await stashFilePatch(ref, filePath, summary.value.files, repoPath)
  if (!r.ok) {
    return c.html(<pre class="diff-body diff-patch-error">{r.stderr}</pre>, 200)
  }
  return c.html(<DiffPatchBody text={r.patch} compact />, 200)
})

app.post('/api/branch/create', async (c) => {
  const repoPath = c.get('repoPath')
  const sha = c.req.query('sha') ?? ''
  const body = await c.req.parseBody()
  let name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    name =
      (c.req.header('HX-Prompt') ?? c.req.header('hx-prompt') ?? '').trim()
  }
  if (!sha || !name) {
    const next = await loadGraph(repoPath)
    return c.html(
      <Fragment>
        <GraphFragment {...next} />
        <StatusOob error={!sha ? 'missing commit sha' : 'branch name required'} />
      </Fragment>,
      200,
    )
  }
  const r = await createBranchAt(sha, name, repoPath)
  const next = await loadGraph(repoPath)
  return c.html(
    <Fragment>
      <GraphFragment {...next} />
      <StatusOob error={r.ok ? undefined : r.stderr} />
    </Fragment>,
    200,
  )
})

app.post('/api/push', async (c) => {
  const repoPath = c.get('repoPath')
  const r = await push(repoPath)
  const next = await loadGraph(repoPath)
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

if (import.meta.main) {
  await syncRepoWatchers()
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
    console.log(`dumbgit workspace on ${base}/`)
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
}
