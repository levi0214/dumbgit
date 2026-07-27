import { expect, test } from 'bun:test'
import path from 'node:path'

const cli = path.join(import.meta.dir, '..', 'bin', 'dg.js')

function run(...args: string[]) {
  return Bun.spawnSync([process.execPath, cli, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
}

test('CLI reports its development version', () => {
  const result = run('--version')
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toBe('dg dev\n')
  expect(result.stderr.toString()).toBe('')
})

test('CLI help lists release-facing commands', () => {
  const result = run('--help')
  expect(result.exitCode).toBe(0)
  expect(result.stdout.toString()).toContain('dg --version')
})
