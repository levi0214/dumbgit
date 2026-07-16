import { describe, expect, test } from 'bun:test'
import type { GraphRow } from '../src/git'
import { graphLaneGutterCols, graphLaneLayout } from '../src/views/graph'

function commit(sha: string, parents: string[]): GraphRow {
  return {
    kind: 'commit',
    row: {
      parents: parents.map((parent) => parent.repeat(40)),
      shaFull: sha.repeat(40),
      shaShort: sha.repeat(7),
      decorateRaw: '',
      subject: 'subject',
      author: 'author',
      date: '2026-01-01T00:00:00+00:00',
      inHistory: true,
    },
  }
}

describe('graphLaneLayout', () => {
  test('keeps duplicate parent paths separate until the commit node', () => {
    const rows = [
      commit('d', ['a', 'b']),
      commit('a', ['c']),
      commit('b', ['c']),
      commit('c', ['e']),
    ]

    const layout = graphLaneLayout(rows)

    expect(layout.laneCount).toBe(2)
    expect(layout.rows[0]).toEqual({
      lane: 0,
      incoming: [],
      outgoing: [0, 1],
      passThrough: [],
    })
    expect(layout.rows[1]).toEqual({
      lane: 0,
      incoming: [0],
      outgoing: [0],
      passThrough: [1],
    })
    expect(layout.rows[2]).toEqual({
      lane: 1,
      incoming: [1],
      outgoing: [1],
      passThrough: [0],
    })
    expect(layout.rows[3]).toEqual({
      lane: 0,
      incoming: [0, 1],
      outgoing: [0],
      passThrough: [],
    })
  })

  test('assigns disconnected tips to one stable physical lane each', () => {
    const rows = [
      commit('a', ['b']),
      commit('c', ['d']),
      commit('b', []),
      commit('d', []),
    ]

    const layout = graphLaneLayout(rows)

    expect(layout.rows.map((row) => row.lane)).toEqual([0, 1, 0, 1])
    expect(graphLaneGutterCols(layout.laneCount)).toBe(3)
  })
})
