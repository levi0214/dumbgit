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
import { app } from '../src/index'

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

test('Workspace owns repository activation and repository routing', async () => {
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
    const workspace = await app.request('/')
    expect(workspace.status).toBe(200)
    const workspacePage = await workspace.text()
    expect(workspacePage).toContain('<title>dumbgit</title>')
    expect(workspacePage).toContain('<h1>dumbgit</h1>')
    expect(workspacePage).toContain('1 repository · 1 active')
    expect(workspacePage).toContain(
      `/workspace/repo/terminal?repo=${encodeURIComponent(repo)}`,
    )
    expect(workspacePage).toContain(`Open terminal for example`)
    expect(
      (
        await app.request(
          '/workspace/repo/terminal?repo=/not/a/workspace/repo',
          { method: 'POST' },
        )
      ).status,
    ).toBe(404)

    const stopped = await app.request(
      `/workspace/repo/stop?${query}&limit=5`,
      { method: 'POST' },
    )
    expect(stopped.status).toBe(200)
    expect(await stopped.text()).toContain('>Start</button>')

    const inactiveRepo = await app.request(`/repo?${query}`)
    expect(inactiveRepo.status).toBe(302)
    expect(inactiveRepo.headers.get('location')).toBe('/')

    const started = await app.request(
      `/workspace/repo/start?${query}&limit=5`,
      { method: 'POST' },
    )
    expect(started.status).toBe(200)
    expect(await started.text()).toContain('>Stop</button>')

    const activeRepo = await app.request(`/repo?${query}`)
    expect(activeRepo.status).toBe(200)
    const page = await activeRepo.text()
    expect(page).toContain(`data-repo="${repo}"`)
    expect(page).toContain('hx-vals=')
    expect(page).toContain('class="graph-crumb"')
    expect(page).toContain(`href="/?repo=${encodeURIComponent(repo)}"`)
    expect(page).toContain('Back to workspace')

    expect((await app.request('/fragment/graph')).status).toBe(400)
    expect((await app.request(`/fragment/graph?${query}`)).status).toBe(200)

    const post = (url: string, fields: Record<string, string> = {}) =>
      app.request(url, {
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
    await app.request(
      `/workspace/repo/stop?repo=${encodeURIComponent(repo)}&limit=5`,
      { method: 'POST' },
    )
    if (previousHistoryFile === undefined) {
      delete process.env.DUMBGIT_HISTORY_FILE
    } else {
      process.env.DUMBGIT_HISTORY_FILE = previousHistoryFile
    }
    rmSync(root, { recursive: true, force: true })
  }
})
