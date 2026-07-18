import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { renderToString } from 'hono/jsx/dom/server'
import {
  commitSummary,
  headInfo,
  logGraphRows,
  workTreeFilePatch,
  workTreeSummary,
} from '../src/git'
import {
  WorkspaceCommitInspector,
  WorkspaceView,
  workspaceRepoParentLabel,
  workspaceSafeRepoText,
} from '../src/views/workspace'

const roots: string[] = []

function git(cwd: string, args: string[]): void {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString())
  }
}

function tempRepo(subject: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'dumbgit-workspace-'))
  roots.push(root)
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'workspace@example.test'])
  git(root, ['config', 'user.name', 'Workspace Test'])
  writeFileSync(path.join(root, 'note.txt'), `${subject}\n`)
  git(root, ['add', 'note.txt'])
  git(root, ['commit', '-m', subject])
  return root
}

describe('workspace git reads', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('read an explicit repository without rebinding the process', async () => {
    const first = tempRepo('first repository')
    const second = tempRepo('second repository')
    writeFileSync(path.join(second, 'note.txt'), 'changed in second\n')

    const [firstHead, secondHead, secondRows, secondWorktree] =
      await Promise.all([
        headInfo(first),
        headInfo(second),
        logGraphRows(5, second),
        workTreeSummary(second),
      ])

    expect(firstHead.kind).toBe('branch')
    expect(secondHead.kind).toBe('branch')
    expect(secondRows[0]?.row.subject).toBe('second repository')
    expect(secondWorktree.unstaged.map((entry) => entry.path)).toEqual([
      'note.txt',
    ])

    const summary = await commitSummary(secondHead.sha, {}, second)
    expect(summary.ok).toBe(true)
    if (summary.ok) expect(summary.value.subject).toBe('second repository')

    const patch = await workTreeFilePatch('unstaged', 'note.txt', second)
    expect(patch.ok).toBe(true)
    if (patch.ok) expect(patch.patch).toContain('+changed in second')
  })
})

describe('workspace states', () => {
  test('uses screenshot-safe repository path labels', () => {
    const privateRepo = path.join(
      os.homedir(),
      'dev',
      '2025',
      'secret-repo',
    )
    expect(
      workspaceRepoParentLabel(privateRepo),
    ).toBe('~/dev/2025')
    expect(
      workspaceRepoParentLabel('/Volumes/company/projects/secret-repo'),
    ).toBe('…/company/projects')
    expect(
      workspaceSafeRepoText(
        `fatal: ${privateRepo}/.git is unavailable`,
        privateRepo,
      ),
    ).toBe('fatal: ~/dev/2025/secret-repo/.git is unavailable')
  })

  test('renders inactive repositories without status labels', () => {
    const html = renderToString(
      WorkspaceView({
        repos: [
          {
            ok: false,
            repoPath: '/tmp/example',
            running: false,
            isHost: false,
            stderr: 'unavailable',
          },
        ],
        currentRepo: '',
        limit: 5,
      }),
    )

    expect(html).toContain('workspace-repo-stopped')
    expect(html).toContain('workspace-drag-handle')
    expect(html).toContain('workspace-instance-toggle is-start')
    expect(html).toContain('>Start</button>')
    expect(html).toContain('class="workspace-depth-toggle"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Show 10 commits in all repositories')
    expect(html).toContain('hx-get="/fragment/workspace?limit=10"')
    expect(html).not.toContain('class="workspace-depth"')
    expect(html).not.toContain('>running<')
    expect(html).not.toContain('>stopped<')
  })

  test('collapses every repository from each expanded card footer', () => {
    const html = renderToString(
      WorkspaceView({
        repos: [
          {
            ok: false,
            repoPath: '/tmp/example',
            running: false,
            isHost: false,
            stderr: 'unavailable',
          },
        ],
        currentRepo: '',
        limit: 10,
      }),
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Show 5 commits in all repositories')
    expect(html).toContain('hx-get="/fragment/workspace?limit=5"')
    expect(html).toContain('hx-push-url="/workspace?limit=5"')
  })

  test('keeps the inspector hidden until requested and makes it closable', () => {
    const page = renderToString(
      WorkspaceView({ repos: [], currentRepo: '', limit: 5 }),
    )
    expect(page).toContain(
      'id="workspace-inspector" class="workspace-inspector" hidden',
    )
    expect(page).not.toContain('Shared inspector')

    const inspector = renderToString(
      WorkspaceCommitInspector({
        repoPath: '/tmp/example',
        sha: 'a'.repeat(40),
        summary: { ok: false, stderr: 'unavailable' },
      }),
    )
    expect(inspector).toContain('workspace-inspector-close')
    expect(inspector).toContain('workspace-inspector-label')
    expect(inspector).toContain('>Diff</span>')
  })

  test('gives the workspace inspector a file-detail split view', () => {
    const inspector = renderToString(
      WorkspaceCommitInspector({
        repoPath: '/tmp/example',
        sha: 'a'.repeat(40),
        summary: {
          ok: true,
          value: {
            subject: 'show a useful diff',
            author: 'Test Author',
            date: '2026-07-18T12:00:00+08:00',
            tags: [],
            files: [
              {
                status: 'M',
                path: 'src/example.ts',
                added: 2,
                deleted: 1,
              },
            ],
          },
        },
      }),
    )

    expect(inspector).toContain('class="diff-files-block"')
    expect(inspector).toContain('id="diff-patch-slot"')
    expect(inspector).toContain('Select a file to view its diff')
    expect(inspector.indexOf('diff-files-block')).toBeLessThan(
      inspector.indexOf('diff-patch-slot'),
    )
  })
})
