import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ACTIVITY_WINDOW_MS, initialActivityTime, isRepoActive, nextActivity, readLocalActivity } from '../src/activity'
import { workspaceRepoFingerprint } from '../src/git'
import { readRepoHistory, rememberRepo, reorderRepoHistory, saveRepoActivities } from '../src/history'
import { WorkspaceBoard } from '../src/views/workspace'

test('activity expires without extending on reads; a new change wakes it', () => {
  const now = Date.now()
  const initial = nextActivity(undefined, 'dirty', now - ACTIVITY_WINDOW_MS, now)
  expect(isRepoActive(initial.lastActiveAt, now)).toBe(false)
  expect(nextActivity(initial, 'dirty', now, now)).toEqual(initial)
  const edited = nextActivity(initial, 'edited again', 0, now)
  expect(isRepoActive(edited.lastActiveAt, now)).toBe(true)
  expect(isRepoActive(edited.lastActiveAt, now + ACTIVITY_WINDOW_MS)).toBe(false)
  expect(isRepoActive(0, now)).toBe(false)
})

test('local edits and HEAD count, remote refs do not; activity survives history reads', async () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'dumbgit-activity-'))
  const previous = process.env.DUMBGIT_HISTORY_FILE
  process.env.DUMBGIT_HISTORY_FILE = path.join(repo, '.git', 'dumbgit-history.json')
  const old = Math.floor((Date.now() - 3 * ACTIVITY_WINDOW_MS) / 1000)
  function git(...args: string[]) {
    const result = Bun.spawnSync(['git', ...args], { cwd: repo,
      env: { ...process.env, GIT_AUTHOR_DATE: `${old} +0000`, GIT_COMMITTER_DATE: `${old} +0000` } })
    if (result.exitCode) throw new Error(result.stderr.toString())
  }
  const token = async () => readLocalActivity(repo, await workspaceRepoFingerprint(repo))
  try {
    git('init', '-b', 'main')
    git('config', 'user.name', 'Test')
    git('config', 'user.email', 'test@example.test')
    writeFileSync(path.join(repo, 'note'), 'original')
    git('add', '.')
    git('commit', '-m', 'test: initial')
    const clean = await token()
    expect(isRepoActive(await initialActivityTime(repo, await workspaceRepoFingerprint(repo)))).toBe(false)
    git('update-ref', 'refs/remotes/origin/main', 'HEAD')
    expect(await token()).toBe(clean)
    writeFileSync(path.join(repo, 'note'), 'old dirty file')
    utimesSync(path.join(repo, 'note'), old, old)
    expect(isRepoActive(await initialActivityTime(repo, await workspaceRepoFingerprint(repo)))).toBe(false)
    const dirty = await token()
    expect(dirty).not.toBe(clean)
    writeFileSync(path.join(repo, 'note'), 'edited again with new content')
    expect(await token()).not.toBe(dirty)
    const edited = await token()
    git('add', 'note')
    expect(await token()).not.toBe(edited)
    git('commit', '-m', 'test: update')
    expect(await token()).not.toBe(clean)
    git('checkout', '-b', 'other')
    const other = await token()
    git('checkout', 'main')
    expect(await token()).not.toBe(other)
    rememberRepo(repo)
    const storedPath = readRepoHistory()[0]!.repoPath
    const activity = { token: await token(), lastActiveAt: Date.now() }
    saveRepoActivities(new Map([[storedPath, activity]]))
    rememberRepo(repo)
    reorderRepoHistory([storedPath])
    expect(readRepoHistory()[0]!.activity).toEqual(activity)
    expect(nextActivity(readRepoHistory()[0]!.activity, activity.token, 0)).toEqual(activity)
  } finally {
    if (previous === undefined) delete process.env.DUMBGIT_HISTORY_FILE
    else process.env.DUMBGIT_HISTORY_FILE = previous
    rmSync(repo, { recursive: true, force: true })
  }
})

test('puts active cards first while retaining order and unavailable repositories', () => {
  const html = WorkspaceBoard({ limit: 5, repos: [
    { ok: false, repoPath: '/quiet', stderr: 'Missing', lastActiveAt: 1 },
    { ok: false, repoPath: '/active-first', stderr: 'Missing', lastActiveAt: Date.now() - 1000 },
    { ok: false, repoPath: '/active-second', stderr: 'Missing', lastActiveAt: Date.now() },
  ] }).toString()
  expect(html.indexOf('data-workspace-repo="/active-first"')).toBeLessThan(html.indexOf('data-workspace-repo="/active-second"'))
  expect(html.indexOf('data-workspace-repo="/active-second"')).toBeLessThan(html.indexOf('data-workspace-repo="/quiet"'))
  expect(html).toContain('workspace-repo-inactive')
  expect(html).not.toContain('Show hidden')
})
