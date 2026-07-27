import { describe, expect, test } from 'bun:test'
import { editorOpenArgs } from '../src/open-local'

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
