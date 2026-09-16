/** @jsxImportSource hono/jsx */
import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { commitFilePatch, workTreeFilePatch, stashFilePatch, DUMBGIT_PREVIEW_STASH_MSG } from '../src/git'
import { DiffPatchBody, WorkTreeDiffPanel } from '../src/views/diff'
import { WorkspacePatch } from '../src/views/workspace'

function git(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(['git', ...args], { cwd })
  if (result.exitCode) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

test('image previews follow worktree, index, commit, rename and deletion versions', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-image-'))
  const name = 'picture #1.svg'
  const old = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
  const staged = old.replace('10', '20')
  const current = old.replace('10', '30')
  const decode = (result: Awaited<ReturnType<typeof workTreeFilePatch>>) => {
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.stderr)
    return Buffer.from(result.image!.src!.split(',')[1]!, 'base64').toString()
  }
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'Test')
    writeFileSync(path.join(repo, name), old)
    expect(decode(await workTreeFilePatch('untracked', name, repo))).toBe(old)
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'test(image): add image')
    const sha = git(repo, 'rev-parse', 'HEAD')
    writeFileSync(path.join(repo, name), staged)
    git(repo, 'add', '.')
    writeFileSync(path.join(repo, name), current)
    expect(decode(await workTreeFilePatch('staged', name, repo))).toBe(staged)
    expect(decode(await workTreeFilePatch('unstaged', name, repo))).toBe(current)
    expect(decode(await commitFilePatch(sha, name, undefined, repo))).toBe(old)
    git(repo, 'reset', '--hard', 'HEAD')
    git(repo, 'mv', name, 'renamed.svg')
    expect(decode(await workTreeFilePatch('staged', `${name} → renamed.svg`, repo))).toBe(old)
    git(repo, 'commit', '-m', 'test(image): rename image')
    expect(decode(await commitFilePatch(git(repo, 'rev-parse', 'HEAD'), `${name} → renamed.svg`, undefined, repo))).toBe(old)
    rmSync(path.join(repo, 'renamed.svg'))
    const deleted = await workTreeFilePatch('unstaged', 'renamed.svg', repo)
    expect(decode(deleted)).toBe(old)
    expect(deleted.ok && deleted.image?.previous).toBe(true)
    git(repo, 'add', '.')
    expect(decode(await workTreeFilePatch('staged', 'renamed.svg', repo))).toBe(old)
    git(repo, 'commit', '-m', 'test(image): delete image')
    expect(decode(await commitFilePatch(git(repo, 'rev-parse', 'HEAD'), 'renamed.svg', undefined, repo))).toBe(old)
    symlinkSync('/etc/passwd', path.join(repo, 'linked.png'))
    const linked = await workTreeFilePatch('untracked', 'linked.png', repo)
    expect(linked.ok && linked.image?.src).toBeUndefined()
    writeFileSync(path.join(repo, 'large.png'), Buffer.alloc(10 * 1024 * 1024 + 1))
    const large = await workTreeFilePatch('untracked', 'large.png', repo)
    expect(large.ok && large.image?.message).toContain('10 MB')
    expect((await workTreeFilePatch('untracked', '../outside.png', repo)).ok).toBe(false)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('all file panels render SVG as an isolated image instead of inline markup', async () => {
  const image = { src: 'data:image/svg+xml;base64,PHN2Zy8+' }
  const panels = [
    <DiffPatchBody text="" image={image} />,
    <WorkspacePatch patch="" image={image} />,
    <WorkTreeDiffPanel ok={true} kind="staged" displayPath="image.svg" absolutePath="/repo/image.svg" patch="" image={image} />,
  ]
  for (const panel of panels) {
    const html = await panel.toString()
    expect(html).toContain('<img src="data:image/svg+xml;base64,PHN2Zy8+"')
    expect(html).not.toContain('(no diff)')
  }
})


test('binary image bytes survive index and saved-aside previews', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-image-bytes-'))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=', 'base64')
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'commit', '--allow-empty', '-m', 'test(image): initialize')
    writeFileSync(path.join(repo, 'staged.png'), png)
    git(repo, 'add', '.')
    const staged = await workTreeFilePatch('staged', 'staged.png', repo)
    expect(staged.ok && staged.image?.src).toBe(`data:image/png;base64,${png.toString('base64')}`)
    writeFileSync(path.join(repo, 'untracked.png'), png)
    git(repo, 'stash', 'push', '-u', '-m', DUMBGIT_PREVIEW_STASH_MSG)
    for (const name of ['staged.png', 'untracked.png']) {
      const saved = await stashFilePatch('stash@{0}', name, undefined, repo)
      expect(saved.ok && saved.image?.src).toBe(`data:image/png;base64,${png.toString('base64')}`)
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})


test('failed image loading hides the broken image and reveals the fallback', async () => {
  const html = await (<DiffPatchBody text="" image={{ src: 'data:image/svg+xml;base64,PHN2ZyBicm9rZW4=' }} />).toString()
  expect(html).toContain('role="status" hidden')
  expect(html).toContain('Unable to preview this image')
  const handler = html.match(/onerror="([^"]+)"/)?.[1]
  expect(handler).toBeDefined()
  const fallback = { hidden: true }
  const img = { style: { display: '' }, nextElementSibling: fallback }
  // Execute the emitted handler with the same element properties the browser supplies.
  new Function(handler!.replaceAll('&#39;', "'").replaceAll('&quot;', '"')).call(img)
  expect(img.style.display).toBe('none')
  expect(fallback.hidden).toBe(false)
})
