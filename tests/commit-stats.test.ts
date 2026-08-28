import { describe, expect, test } from 'bun:test'
import { renderToString } from 'hono/jsx/dom/server'
import { DiffPanel, summarizeCommitFiles } from '../src/views/diff'

describe('commit line stats', () => {
  test('totals added and deleted lines across files', () => {
    expect(
      summarizeCommitFiles([
        { status: 'M', path: 'src/index.ts', added: 12, deleted: 4 },
        { status: 'A', path: 'tests/index.test.ts', added: 8, deleted: 0 },
        { status: 'M', path: 'README.md', added: 3, deleted: 1 },
        { status: 'A', path: 'assets/icon.png', binary: true },
      ]),
    ).toEqual({ added: 23, deleted: 5 })
  })

  test('renders a single total, without a test/non-test breakdown', () => {
    const baseSummary = {
      subject: 'make the change',
      body: '',
      author: 'Ken',
      date: '2026-07-18T12:00:00+08:00',
      tags: [],
    }
    const sourceOnly = renderToString(
      DiffPanel({
        state: 'summary',
        sha: 'a'.repeat(40),
        summary: {
          ...baseSummary,
          files: [{ status: 'M', path: 'src/main.c', added: 7, deleted: 2 }],
        },
      }),
    )
    expect(sourceOnly).toContain('class="commit-line-counts"')
    expect(sourceOnly).toContain('>+7</span>')
    expect(sourceOnly).toContain('>−2</span>')
    expect(sourceOnly).not.toContain('commit-stats-breakdown')
    expect(sourceOnly).not.toContain('non-test')
    expect(sourceOnly).not.toContain('>tests</span>')

    const mixed = renderToString(
      DiffPanel({
        state: 'summary',
        sha: 'b'.repeat(40),
        summary: {
          ...baseSummary,
          files: [
            { status: 'M', path: 'src/main.c', added: 7, deleted: 2 },
            { status: 'M', path: 'tests/main_test.c', added: 4, deleted: 1 },
          ],
        },
      }),
    )
    expect(mixed).toContain('class="commit-line-counts"')
    expect(mixed).toContain('>+11</span>')
    expect(mixed).toContain('>−3</span>')
    expect(mixed).not.toContain('commit-stats-breakdown')
    expect(mixed).not.toContain('non-test')
    expect(mixed).not.toContain('>tests</span>')
  })
})
