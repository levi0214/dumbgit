import { describe, expect, test } from 'bun:test'
import { normalizeGraphRows, type GraphRow } from '../src/git'
import {
  commitLaneCol,
  GRAPH_LANE_PALETTE,
  graphLaneColorIndexes,
  graphLanePaletteIndex,
  graphRowMeta,
  graphStrokeColorCol,
} from '../src/views/graph'

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

describe('graphRowMeta', () => {
  test('classifies lone connectors as curve and run members as tall', () => {
    const rows: GraphRow[] = [
      commit('| * '),
      connector('|/'),
      commit('* '),
      connector('|\\'),
      connector('| \\'),
      commit('| | * '),
    ]

    const meta = graphRowMeta(rows)

    expect(meta.map((m) => m.kind)).toEqual([
      'commit',
      'curve',
      'commit',
      'tall',
      'tall',
      'commit',
    ])
    expect(meta[0]!.above).toBeNull()
    expect(meta[0]!.below).toEqual({ kind: 'curve', text: '|/' })
    expect(meta[2]!.above).toEqual({ kind: 'curve', text: '|/' })
    expect(meta[5]!.above).toEqual({ kind: 'tall', text: '| \\' })
  })
})

describe('lane colors', () => {
  test('maps ASCII graph columns onto logical lanes', () => {
    expect(graphLanePaletteIndex(0)).toBe(0)
    expect(graphLanePaletteIndex(2)).toBe(1)
    expect(graphLanePaletteIndex(4)).toBe(2)
    expect(graphLanePaletteIndex(GRAPH_LANE_PALETTE.length * 2)).toBe(0)
    expect(graphLanePaletteIndex(-1)).toBe(GRAPH_LANE_PALETTE.length - 1)
  })

  test('commitLaneCol reads the star column', () => {
    expect(commitLaneCol('* ')).toBe(0)
    expect(commitLaneCol('| * ')).toBe(2)
    expect(commitLaneCol('| | *')).toBe(4)
    expect(commitLaneCol('| | ')).toBe(0)
  })

  test('diagonals take the rightward endpoint column for hue', () => {
    // Side-lane commits sit at col 2 (`| *`); `/` and `\` glyphs at col 1.
    expect(graphStrokeColorCol('/', 1)).toBe(2)
    expect(graphStrokeColorCol('\\', 1)).toBe(2)
    expect(graphStrokeColorCol('|', 2)).toBe(2)
    expect(graphStrokeColorCol('*', 2)).toBe(2)
  })

  test('keeps the primary lane color and gives a split its own color', () => {
    const rows: GraphRow[] = [
      commit('*'),
      connector('|\\'),
      commit('* |'),
    ]

    const colors = graphLaneColorIndexes(rows)

    expect(colors[0]![0]).toBe(0)
    expect(colors[1]![0]).toBe(0)
    expect(colors[1]![1]).toBe(1)
    expect(colors[2]![0]).toBe(0)
    expect(colors[2]![2]).toBe(1)
  })

  test('carries a lane color when the lane moves to another column', () => {
    const rows: GraphRow[] = [
      commit('| *'),
      connector(' /'),
      commit('*'),
    ]

    const colors = graphLaneColorIndexes(rows)

    expect(colors[0]![2]).toBe(1)
    expect(colors[1]![1]).toBe(1)
    expect(colors[2]![0]).toBe(1)
  })
})
