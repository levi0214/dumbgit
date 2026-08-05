import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnGit } from '../src/git'

test('spawnGit times out a hanging network op and kills the whole group', async () => {
  // Silent TCP server: accepts the connection but never answers the HTTP
  // handshake, so git-remote-http blocks forever (no libcurl read timeout).
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      open() {},
      data() {},
      close() {},
      error() {},
    },
  })
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dumbgit-timeout-'))
  try {
    const r = await spawnGit(
      ['ls-remote', `http://127.0.0.1:${server.port}/x.git`],
      dir,
      { timeoutMs: 2000, name: 'ls-remote' },
    )
    expect(r.code).toBe(137)
    expect(r.stderr).toBe('git ls-remote timed out after 2s')

    // The whole process group must die — no orphaned remote helper left
    // holding the pipes open (Bun's own timeout only kills `git` itself).
    await Bun.sleep(300)
    const residual = Bun.spawnSync([
      'pgrep',
      '-f',
      'git-remote-http http://',
    ]).stdout.toString()
    expect(residual.trim()).toBe('')
  } finally {
    server.stop(true)
    rmSync(dir, { recursive: true, force: true })
  }
})
