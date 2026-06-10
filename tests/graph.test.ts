import { describe, expect, test } from 'bun:test'
import { normalizeGraphRows, type GraphRow } from '../src/git'

function commit(graphAnsi: string): GraphRow {
  return {
    kind: 'commit',
    row: {
      graphAnsi,
      shaFull: 'a'.repeat(40),
      shaShort: 'a'.repeat(7),
      decorateRaw: '',
      subject: 'subject',
      author: 'author',
      date: '2026-01-01T00:00:00+00:00',
      inHistory: true,
    },
  }
}

function connector(ansi: string): GraphRow {
  return { kind: 'other', ansi, betweenInHistory: true }
}

function connectorTexts(rows: GraphRow[]): string[] {
  return rows.flatMap((r) => (r.kind === 'other' ? [r.ansi] : []))
}

describe('normalizeGraphRows', () => {
  test('reduces merge zigzag connectors to a single connector row', () => {
    // `git log --graph` shape for a merge whose second parent sits one lane
    // to the left: the `\` is immediately undone by the `/` below it.
    const rows: GraphRow[] = [
      commit('| * '),
      connector('| |\\  '),
      connector('| |/  '),
      connector('|/|   '),
      commit('* | '),
    ]

    const out = normalizeGraphRows(rows)

    expect(connectorTexts(out)).toEqual(['|/|'])
    expect(out).toHaveLength(3)
    expect(out[0]).toEqual(rows[0]!)
    expect(out[2]).toEqual(rows[4]!)
  })

  test('keeps unrelated single connector rows untouched', () => {
    const rows: GraphRow[] = [
      commit('| * '),
      connector('|/  '),
      commit('* '),
    ]

    expect(connectorTexts(normalizeGraphRows(rows))).toEqual(['|/'])
  })

  test('preserves lane continuity when cancelling over a blank column', () => {
    const rows: GraphRow[] = [
      commit('* '),
      connector(' \\'),
      connector(' /'),
      commit('* '),
    ]

    // Both rows become a pure `|` lane and are dropped as pass-through.
    expect(normalizeGraphRows(rows)).toHaveLength(2)
  })

  test('drops pure pass-through connector rows', () => {
    const rows: GraphRow[] = [
      commit('| * '),
      connector('| | '),
      commit('| * '),
    ]

    expect(normalizeGraphRows(rows)).toHaveLength(2)
  })

  test('keeps multi-row lane crossings that are not zigzags', () => {
    const rows: GraphRow[] = [
      commit('| | * '),
      connector('| |/  '),
      connector('|/|   '),
      commit('* |   '),
    ]

    const out = normalizeGraphRows(rows)

    expect(connectorTexts(out)).toEqual(['| |/', '|/|'])
    expect(out).toHaveLength(4)
  })
})
