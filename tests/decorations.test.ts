import { describe, expect, test } from 'bun:test'
import { decorationTokens } from '../src/decorations'

describe('decorationTokens', () => {
  test('distinguishes slash-containing local branches from remote refs', () => {
    const tokens = decorationTokens(
      '(HEAD -> refs/heads/main, refs/remotes/upstream/main, refs/heads/fix/foo)',
    )

    expect(tokens).toEqual([
      { kind: 'local', name: 'main', head: true },
      { kind: 'remote', name: 'upstream/main', head: false },
      { kind: 'local', name: 'fix/foo', head: false },
    ])
  })

  test('parses non-origin remotes and tags from full decorations', () => {
    const tokens = decorationTokens(
      '(refs/remotes/fork/feature/x, tag: refs/tags/v1.2.3)',
    )

    expect(tokens).toEqual([
      { kind: 'remote', name: 'fork/feature/x', head: false },
      { kind: 'tag', name: 'v1.2.3', head: false },
    ])
  })

  test('keeps commas inside nested decoration names intact', () => {
    const tokens = decorationTokens(
      '(refs/heads/main, refs/heads/topic(foo,bar))',
    )

    expect(tokens).toEqual([
      { kind: 'local', name: 'main', head: false },
      { kind: 'local', name: 'topic(foo,bar)', head: false },
    ])
  })
})
