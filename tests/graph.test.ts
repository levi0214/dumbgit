import { describe, expect, test } from 'bun:test'
import { renderToString } from 'hono/jsx/dom/server'
import type { GraphRow } from '../src/git'
import {
  GraphRows,
  graphLaneLayout,
  graphRowGutterCols,
} from '../src/views/graph'

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
    expect(layout.rows.map(graphRowGutterCols)).toEqual([3, 3, 3, 3])
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
    expect(layout.rows.map(graphRowGutterCols)).toEqual([1, 3, 3, 3])
  })

  test('shrinks the gutter after lanes converge', () => {
    const rows = [
      commit('d', ['a', 'b']),
      commit('a', ['c']),
      commit('b', ['c']),
      commit('c', ['e']),
      commit('e', ['f']),
    ]

    const layout = graphLaneLayout(rows)

    expect(layout.rows.map(graphRowGutterCols)).toEqual([3, 3, 3, 3, 1])

    const html = renderToString(
      GraphRows({
        rows,
        detached: false,
        currentBranch: null,
        stashes: [],
        laneLayoutByRow: layout.rows,
        readonly: true,
      }),
    )
    const widths = [...html.matchAll(/class="graph-lanes-svg"[^>]*style="width:(\d+)px/g)]
      .map((match) => Number(match[1]))
    expect(widths).toEqual([24, 24, 24, 24, 8])
  })

  test('keeps every active lane continuous through an inserted stash row', () => {
    const rows = [
      commit('d', ['a', 'b']),
      commit('a', ['c']),
      commit('b', ['c']),
      commit('c', ['e']),
    ]
    const layout = graphLaneLayout(rows)
    const html = renderToString(
      GraphRows({
        rows,
        detached: false,
        currentBranch: null,
        stashes: [
          {
            ref: 'stash@{0}',
            baseSha: 'c'.repeat(40),
            subject: 'On main: dumbgit-preview-stash',
            age: 'just now',
          },
        ],
        laneLayoutByRow: layout.rows,
      }),
    )

    const stashSvg = html.match(
      /<svg class="graph-lanes-svg graph-stash-lanes"[\s\S]*?<\/svg>/,
    )?.[0]
    expect(stashSvg).toContain('stroke="#169fe6"')
    expect(stashSvg).toContain('stroke="#e653a8"')
    expect(html).toContain('class="ref-stash-ico"')
    expect(html).not.toContain('graph-stash-node')
  })

  test('marks commit rows for a larger workspace click target', () => {
    const row = commit('a', [])
    if (row.kind !== 'commit') throw new Error('expected commit row')
    row.row.decorateRaw = 'HEAD -> feature/a-very-long-branch-name'
    const layout = graphLaneLayout([row])
    const html = renderToString(
      GraphRows({
        rows: [row],
        detached: false,
        currentBranch: 'feature/a-very-long-branch-name',
        stashes: [],
        laneLayoutByRow: layout.rows,
        readonly: true,
        workspaceRepoPath: '/tmp/example',
        diffUrlForSha: (sha) => `/workspace/commit?sha=${sha}`,
        diffTarget: '#workspace-inspector',
      }),
    )

    expect(html).toContain('data-commit-row="true"')
    expect(html).toContain('data-workspace-select="commit"')
    expect(html).toContain('class="branch-prefix-name"')
    expect(html).toContain('data-commit-trigger="true"')
    expect(html).toContain('data-commit-ignore="true"')
  })
})
