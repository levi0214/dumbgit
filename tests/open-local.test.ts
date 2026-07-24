import { describe, expect, test } from 'bun:test'
import { editorOpenArgs, terminalOpenArgs } from '../src/open-local'

describe('editorOpenArgs', () => {
  test('uses the system default app when unset', () => {
    expect(editorOpenArgs('/tmp/a.ts', {})).toEqual(['open', '/tmp/a.ts'])
  })

  test('uses DUMBGIT_EDITOR as an open -a app name', () => {
    expect(
      editorOpenArgs('/tmp/a.ts', { DUMBGIT_EDITOR: 'Sublime Text' }),
    ).toEqual(['open', '-a', 'Sublime Text', '/tmp/a.ts'])
  })

  test('ignores blank DUMBGIT_EDITOR', () => {
    expect(editorOpenArgs('/tmp/a.ts', { DUMBGIT_EDITOR: '  ' })).toEqual([
      'open',
      '/tmp/a.ts',
    ])
  })
})

describe('terminalOpenArgs', () => {
  test('defaults to Terminal.app', () => {
    expect(terminalOpenArgs('/tmp/repo', {})).toEqual([
      'open',
      '-a',
      'Terminal',
      '/tmp/repo',
    ])
  })

  test('uses DUMBGIT_TERMINAL as an open -a app name', () => {
    expect(
      terminalOpenArgs('/tmp/repo', { DUMBGIT_TERMINAL: 'Ghostty' }),
    ).toEqual(['open', '-a', 'Ghostty', '/tmp/repo'])
  })
})
