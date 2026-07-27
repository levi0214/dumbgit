#!/usr/bin/env bun
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, mkdirSync, openSync, realpathSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { rememberRepo } from '../src/history'
import { startServer } from '../src/index'
import { VERSION } from '../src/version'

const LISTEN_HOST = '127.0.0.1'
const PORT = 7777
const INTERNAL_SERVER_ARG = '--internal-server'
const logPath = path.join(os.homedir(), 'Library', 'Logs', 'dumbgit.log')

function usage(code = 0) {
  const text = `usage: dg [dir]
       dg --stop
       dg --version`
  if (code === 0) console.log(text)
  else console.error(text)
  process.exit(code)
}

function die(message) {
  console.error(`dg: ${message}`)
  usage(2)
}

function expandUser(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return value
}

function tryRepoRoot(raw) {
  const dir = path.resolve(expandUser(raw))
  const result = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    return {
      ok: false,
      error: String(result.stderr ?? '').trim() || `not a git repo: ${dir}`,
    }
  }
  return { ok: true, repo: realpathSync(result.stdout.trim()) }
}

function repoRoot(raw) {
  const result = tryRepoRoot(raw)
  if (result.ok) return result.repo
  console.error(`dg: ${result.error}`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchController() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 500)
  try {
    const response = await fetch(
      `http://${LISTEN_HOST}:${PORT}/healthz.json`,
      { signal: controller.signal },
    )
    if (!response.ok) return null
    const data = await response.json()
    if (
      data?.ok !== true ||
      data?.name !== 'dumbgit' ||
      data?.kind !== 'workspace' ||
      data?.port !== PORT
    ) {
      return null
    }
    if (typeof data?.pid !== 'number') return null
    return {
      pid: data.pid,
      url: `http://${LISTEN_HOST}:${PORT}`,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function stopController() {
  const instance = await fetchController()
  if (!instance) return 'not-running'
  try {
    process.kill(instance.pid, 'SIGTERM')
  } catch {
    // It may have exited between the health check and the signal.
  }
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (!(await fetchController())) return 'stopped'
    await sleep(50)
  }
  return 'timed-out'
}

function startController() {
  mkdirSync(path.dirname(logPath), { recursive: true })
  const log = openSync(logPath, 'a')
  const args = Bun.main.startsWith('/$bunfs/')
    ? [INTERNAL_SERVER_ARG, '--port', String(PORT)]
    : [Bun.main, INTERNAL_SERVER_ARG, '--port', String(PORT)]
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  closeSync(log)
}

async function waitForController(msTotal = 10000) {
  const deadline = Date.now() + msTotal
  while (Date.now() < deadline) {
    const instance = await fetchController()
    if (instance) return instance
    await sleep(100)
  }
  return null
}

function openBrowser(url) {
  spawnSync('open', [url], { stdio: 'ignore' })
}

async function ensureWorkspace(focusRepo) {
  let instance = await fetchController()
  if (!instance) {
    startController()
    instance = await waitForController()
  }
  if (!instance) {
    console.error(`dg: workspace did not start on port ${PORT}; see ${logPath}`)
    process.exit(1)
  }
  const pathname = focusRepo
    ? `/?repo=${encodeURIComponent(focusRepo)}`
    : '/'
  const url = `${instance.url}${pathname}`
  openBrowser(url)
  console.log(url)
}

async function activateRepo(rawDir) {
  const repo = repoRoot(rawDir)
  rememberRepo(repo, true)
  await ensureWorkspace(repo)
}

const argv = process.argv.slice(2)

if (argv[0] === INTERNAL_SERVER_ARG) {
  await startServer()
} else if (
  argv.length === 1 &&
  (argv[0] === '-h' || argv[0] === '--help')
) {
  usage(0)
} else if (argv.length === 1 && (argv[0] === '-v' || argv[0] === '--version')) {
  console.log(`dg ${VERSION}`)
} else if (argv.length === 1 && argv[0] === '--stop') {
  const result = await stopController()
  if (result === 'timed-out') die('server did not stop')
  console.log(result === 'stopped' ? 'dg: stopped' : 'dg: not running')
  process.exit(0)
} else {
  for (const arg of argv) {
    if (arg.startsWith('-')) die(`unknown option: ${arg}`)
  }
  if (argv.length > 1) die('too many arguments')

  if (argv[0]) {
    await activateRepo(argv[0])
  } else {
    const cwdRepo = tryRepoRoot(process.cwd())
    if (cwdRepo.ok) await activateRepo(cwdRepo.repo)
    else await ensureWorkspace()
  }
}
