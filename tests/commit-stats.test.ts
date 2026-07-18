import { describe, expect, test } from 'bun:test'
import { renderToString } from 'hono/jsx/dom/server'
import {
  DiffPanel,
  isTestFile,
  summarizeCommitFiles,
} from '../src/views/diff'

describe('commit line stats', () => {
  test('recognizes common test paths and names', () => {
    expect(isTestFile('src/index.tsx')).toBe(false)
    expect(isTestFile('src/index.test.ts')).toBe(true)
    expect(isTestFile('tests/fixtures/result.json')).toBe(true)
    expect(isTestFile('src/Old.ts → src/New.spec.ts')).toBe(true)
    expect(isTestFile('README.md')).toBe(false)
  })

  test('totals non-test and test lines', () => {
    expect(
      summarizeCommitFiles([
        { status: 'M', path: 'src/index.ts', added: 12, deleted: 4 },
        { status: 'A', path: 'tests/index.test.ts', added: 8, deleted: 0 },
        { status: 'M', path: 'README.md', added: 3, deleted: 1 },
        { status: 'A', path: 'assets/icon.png', binary: true },
      ]),
    ).toEqual({
      total: { added: 23, deleted: 5 },
      nonTest: { added: 15, deleted: 5 },
      tests: { added: 8, deleted: 0 },
      testFiles: 1,
    })
  })

  test('renders totals always and a breakdown only for mixed commits', () => {
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
          files: [
            { status: 'M', path: 'src/main.c', added: 7, deleted: 2 },
          ],
        },
      }),
    )
    expect(sourceOnly).toContain('class="commit-line-counts"')
    expect(sourceOnly).toContain('>+7</span>')
    expect(sourceOnly).toContain('>−2</span>')
    expect(sourceOnly).not.toContain('commit-stats-breakdown')

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
    expect(mixed).toContain('class="commit-stats-breakdown"')
    expect(mixed).toContain('>non-test</span>')
    expect(mixed).toContain('>tests</span>')
  })
})
