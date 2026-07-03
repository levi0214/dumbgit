import { describe, expect, test } from 'bun:test'
import { parseTagForEachRefLine } from '../src/git'

describe('parseTagForEachRefLine', () => {
  test('parses lightweight tag row (object type commit)', () => {
    expect(parseTagForEachRefLine('v1.0\x1fcommit')).toEqual({
      name: 'v1.0',
      objectType: 'commit',
    })
  })

  test('parses annotated tag row', () => {
    expect(parseTagForEachRefLine('v2.0\x1ftag')).toEqual({
      name: 'v2.0',
      objectType: 'tag',
    })
  })

  test('returns null for blank lines', () => {
    expect(parseTagForEachRefLine('')).toBeNull()
    expect(parseTagForEachRefLine('   ')).toBeNull()
  })
})
