import { expect, test } from 'bun:test'
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { rememberRepo } from '../src/history'
import { app as honoApp } from '../src/index'

// Error-message assertions below expect git's English wording; the server's
// own git spawns inherit this locale too, so tests pass on any host locale.
process.env.LANG = 'C'
process.env.LC_ALL = 'C'

const LOCAL_ORIGIN = 'http://127.0.0.1:7777'
function request(input: string, init: RequestInit = {}) {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !headers.has('Origin')) {
    headers.set('Origin', LOCAL_ORIGIN)
  }
  return honoApp.request(`${LOCAL_ORIGIN}${input}`, { ...init, headers })
}

function git(cwd: string, args: string[]): string {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString())
  }
  return result.stdout.toString().trim()
}

test('rejects non-local hosts and cross-origin mutations', async () => {
  const rebound = await honoApp.request('http://evil.example:7777/healthz')
  expect(rebound.status).toBe(403)

  const crossOrigin = await honoApp.request(
    `${LOCAL_ORIGIN}/workspace/repo/reorder`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ repos: [] }),
    },
  )
  expect(crossOrigin.status).toBe(403)

  const missingOrigin = await honoApp.request(
    `${LOCAL_ORIGIN}/workspace/repo/reorder`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repos: [] }),
    },
  )
  expect(missingOrigin.status).toBe(403)
})

test('Workspace routes repository pages and guards git fragments', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-server-'))
  const repoDir = path.join(root, 'example')
  let repo = repoDir
  const historyFile = path.join(root, 'repos.json')
  const previousHistoryFile = process.env.DUMBGIT_HISTORY_FILE

  try {
    process.env.DUMBGIT_HISTORY_FILE = historyFile
    git(root, ['init', '-b', 'main', repoDir])
    repo = realpathSync(repoDir)
    git(repo, ['config', 'user.email', 'server@example.test'])
    git(repo, ['config', 'user.name', 'Server Test'])
    writeFileSync(path.join(repo, 'README.md'), 'example\n')
    git(repo, ['add', 'README.md'])
    git(repo, ['commit', '-m', 'test: initialize repository'])
    rememberRepo(repo)

    const query = `repo=${encodeURIComponent(repo)}`
    const workspace = await request('/')
    expect(workspace.status).toBe(200)
    const workspacePage = await workspace.text()
    expect(workspacePage).toContain('<title>dumbgit</title>')
    expect(workspacePage).toContain('<h1>dumbgit</h1>')
    expect(workspacePage).toContain('var htmx=function()')
    expect(workspacePage).not.toContain('unpkg.com')
    expect(workspacePage).toContain('1 repository')
    expect(workspacePage).toContain(`title="${repo}"`)
    expect(workspacePage).not.toContain('/workspace/repo/terminal')

    const repoPage = await request(`/repo?${query}`)
    expect(repoPage.status).toBe(200)
    const page = await repoPage.text()
    expect(page).toContain(`data-repo="${repo}"`)
    expect(page).toContain('hx-vals=')
    expect(page).toContain('class="graph-crumb"')
    expect(page).toContain(`href="/?repo=${encodeURIComponent(repo)}"`)
    expect(page).toContain('Back to workspace')

    expect((await request('/fragment/graph')).status).toBe(400)
    expect((await request(`/fragment/graph?${query}`)).status).toBe(200)
    const graphLogResponse = await request(
      `/fragment/graph/log?limit=100&${query}`,
    )
    expect(graphLogResponse.status).toBe(200)
    const graphLog = await graphLogResponse.text()
    expect(graphLog).toContain('id="graph-log"')
    expect(graphLog).toContain('data-graph-limit="100"')
    expect(graphLog).not.toContain('class="graph-root"')
    expect(graphLog).not.toContain('id="worktree"')

    const post = (url: string, fields: Record<string, string> = {}) =>
      request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ repo, ...fields }).toString(),
      })

    writeFileSync(path.join(repo, 'README.md'), 'changed\n')
    expect(
      (
        await post(
          '/api/worktree/action?op=stage&kind=unstaged&path=README.md',
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await post(
          '/api/worktree/action?op=unstage&kind=staged&path=README.md',
        )
      ).status,
    ).toBe(200)
    expect(
      (
        await post(
          '/api/worktree/action?op=discard&kind=unstaged&path=README.md',
        )
      ).status,
    ).toBe(200)
    expect(readFileSync(path.join(repo, 'README.md'), 'utf8')).toBe('example\n')

    writeFileSync(path.join(repo, 'scratch.txt'), 'temporary\n')
    expect(
      (
        await post(
          '/api/worktree/action?op=discard&kind=untracked&path=scratch.txt',
        )
      ).status,
    ).toBe(200)
    expect(
      Bun.file(path.join(repo, 'scratch.txt')).exists(),
    ).resolves.toBe(false)

    const head = git(repo, ['rev-parse', 'HEAD'])
    const outputProbe = path.join(root, 'git-output-probe')
    const injectedCommit = encodeURIComponent(`--output=${outputProbe}`)
    const injectedResponse = await request(
      `/api/commit/${injectedCommit}?${query}`,
    )
    expect(injectedResponse.status).toBe(200)
    expect(await injectedResponse.text()).toContain('invalid commit sha')
    expect(Bun.file(outputProbe).exists()).resolves.toBe(false)

    await post('/api/checkout/branch?name=--detach')
    await post('/api/checkout/commit?sha=--orphan')
    expect(git(repo, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')

    await post(`/api/branch/create?sha=${head}`, { name: '--help' })
    await post('/api/branch/create?sha=--help', {
      name: 'injected-start-point',
    })
    expect(git(repo, ['branch', '--list', 'injected-start-point'])).toBe('')

    expect(
      (
        await post(`/api/branch/create?sha=${head}`, {
          name: 'body-context',
        })
      ).status,
    ).toBe(200)
    expect(
      git(repo, ['rev-parse', '--verify', 'refs/heads/body-context']),
    ).toBe(head)
  } finally {
    if (previousHistoryFile === undefined) {
      delete process.env.DUMBGIT_HISTORY_FILE
    } else {
      process.env.DUMBGIT_HISTORY_FILE = previousHistoryFile
    }
    rmSync(root, { recursive: true, force: true })
  }
})

test('/api/pull is fast-forward only and surfaces errors', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-pull-'))
  const repoDir = path.join(root, 'example')
  const historyFile = path.join(root, 'repos.json')
  const previousHistoryFile = process.env.DUMBGIT_HISTORY_FILE
  let repo = repoDir
  const post = (url: string, fields: Record<string, string> = {}) =>
    request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ repo, ...fields }).toString(),
    })
  try {
    process.env.DUMBGIT_HISTORY_FILE = historyFile
    git(root, ['init', '-b', 'main', repoDir])
    repo = realpathSync(repoDir)
    git(repo, ['config', 'user.email', 'server@example.test'])
    git(repo, ['config', 'user.name', 'Server Test'])
    writeFileSync(path.join(repo, 'a.txt'), 'a\n')
    git(repo, ['add', 'a.txt'])
    git(repo, ['commit', '-m', 'test: initialize'])
    rememberRepo(repo)

    const bare = path.join(root, 'remote.git')
    // Explicit default branch: upstream git defaults a bare repo's HEAD to
    // master, while Apple's git defaults to main — the clone/push flow below
    // must not depend on the environment.
    git(root, ['init', '--bare', '-b', 'main', bare])
    git(repo, ['remote', 'add', 'origin', bare])

    // No upstream yet → clear refusal, working tree untouched.
    const noUpstream = await post('/api/pull')
    expect(noUpstream.status).toBe(200)
    expect(await noUpstream.text()).toContain('no tracking information')

    // Publish, advance the remote from a second clone, then pull it back.
    git(repo, ['push', '-u', 'origin', 'main'])
    const second = path.join(root, 'second')
    git(root, ['clone', bare, second])
    git(second, ['config', 'user.email', 'server@example.test'])
    git(second, ['config', 'user.name', 'Server Test'])
    writeFileSync(path.join(second, 'b.txt'), 'b\n')
    git(second, ['add', 'b.txt'])
    git(second, ['commit', '-m', 'feat: remote advance'])
    git(second, ['push'])
    const remoteHead = git(second, ['rev-parse', 'HEAD'])
    expect(git(repo, ['rev-parse', 'HEAD'])).not.toBe(remoteHead)

    const pulled = await post('/api/pull')
    expect(pulled.status).toBe(200)
    expect(await pulled.text()).toContain('class="graph-root"')
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(remoteHead)

    // Diverged: remote advances again, then a local commit forks the tip.
    writeFileSync(path.join(second, 'd.txt'), 'd\n')
    git(second, ['add', 'd.txt'])
    git(second, ['commit', '-m', 'feat: second remote advance'])
    git(second, ['push'])
    const newRemoteHead = git(second, ['rev-parse', 'HEAD'])

    writeFileSync(path.join(repo, 'c.txt'), 'c\n')
    git(repo, ['add', 'c.txt'])
    git(repo, ['commit', '-m', 'feat: local advance'])
    const localHead = git(repo, ['rev-parse', 'HEAD'])
    expect(localHead).not.toBe(newRemoteHead)

    const diverged = await post('/api/pull')
    expect(diverged.status).toBe(200)
    expect(await diverged.text()).toContain('Not possible to fast-forward')
    expect(git(repo, ['rev-parse', 'HEAD'])).toBe(localHead)
  } finally {
    if (previousHistoryFile === undefined) {
      delete process.env.DUMBGIT_HISTORY_FILE
    } else {
      process.env.DUMBGIT_HISTORY_FILE = previousHistoryFile
    }
    rmSync(root, { recursive: true, force: true })
  }
})
