import { describe, expect, test } from 'bun:test'
import { renderToString } from 'hono/jsx/dom/server'
import { DiffPatchBody, diffWords, parseDiff, type DiffRow } from '../src/views/diff'

const patch = [
  'diff --git a/a.txt b/a.txt',
  'index 53f1df8..3159905 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,4 +1,4 @@',
  ' line one',
  '-line two',
  '+line two changed',
  ' line three',
  '-line four',
  '+line five',
].join('\n')

describe('diffWords', () => {
  test('marks only the words that changed', () => {
    const { a, b } = diffWords('line two', 'line two changed')
    expect(a.every((t) => t.same)).toBe(true)
    expect(b.map((t) => (t.same ? t.t : `[${t.t}]`)).join('')).toBe('line two[ ][changed]')
  })

  test('identical lines have no changes', () => {
    const { a, b } = diffWords('same line', 'same line')
    expect(a.every((t) => t.same)).toBe(true)
    expect(b.every((t) => t.same)).toBe(true)
  })

  test('spotlights a single swapped word', () => {
    const { a, b } = diffWords('const x = foo()', 'const x = bar()')
    expect(a.filter((t) => !t.same).map((t) => t.t)).toEqual(['foo()'])
    expect(b.filter((t) => !t.same).map((t) => t.t)).toEqual(['bar()'])
  })
})

describe('parseDiff', () => {
  test('assigns old/new line numbers', () => {
    const rows = parseDiff(patch)
    expect(rows.map((r) => r.kind)).toEqual([
      'hunk',
      'ctx',
      'del',
      'add',
      'ctx',
      'del',
      'add',
    ])
    const numbered = rows
      .filter((r) => r.kind !== 'hunk' && r.kind !== 'meta')
      .map((r) => ({ kind: r.kind, old: r.oldNo, new: r.newNo }))
    expect(numbered).toEqual([
      { kind: 'ctx', old: 1, new: 1 },
      { kind: 'del', old: 2, new: 2 },
      { kind: 'add', old: 3, new: 2 },
      { kind: 'ctx', old: 3, new: 3 },
      { kind: 'del', old: 4, new: 4 },
      { kind: 'add', old: 5, new: 4 },
    ])
  })

  test('strips framing and pairs del/add lines for word diffs', () => {
    const rows = parseDiff(patch)
    const del = rows.find(
      (r): r is Extract<DiffRow, { kind: 'del' }> => r.kind === 'del',
    )
    const add = rows.find(
      (r): r is Extract<DiffRow, { kind: 'add' }> => r.kind === 'add',
    )
    expect(del?.word?.map((w) => (w.chg ? `[${w.t}]` : w.t)).join('')).toBe('line two')
    expect(add?.word?.map((w) => (w.chg ? `[${w.t}]` : w.t)).join('')).toBe(
      'line two[ ][changed]',
    )
  })

  test('only word-diffs clean 1:1 replacements, not multi-line blocks', () => {
    const multi = parseDiff(
      [
        '@@ -1,2 +1,2 @@',
        '-const a = 1',
        '-const b = 2',
        '+const a = 1',
        '+const c = 3',
      ].join('\n'),
    )
    const add = multi.find(
      (r): r is Extract<DiffRow, { kind: 'add' }> => r.kind === 'add',
    )
    expect(add?.word).toBeUndefined()
  })

  test('skips word diff for oversized single lines (minified/embedded data)', () => {
    const big = Array.from({ length: 600 }, (_, i) => `w${i}`).join(' ')
    const raw = `@@ -1 +1 @@\n-${big}\n+${big} x`
    const rows = parseDiff(raw)
    const del = rows.find(
      (r): r is Extract<DiffRow, { kind: 'del' }> => r.kind === 'del',
    )
    const add = rows.find(
      (r): r is Extract<DiffRow, { kind: 'add' }> => r.kind === 'add',
    )
    expect(del?.word).toBeUndefined()
    expect(add?.word).toBeUndefined()
    const html = renderToString(DiffPatchBody({ text: raw }))
    expect(html).not.toContain('diff-word-chg')
  })

  test('renders tabs as three spaces', () => {
    const rows = parseDiff('@@ -1 +1 @@\n-\tfoo\n+\tbar')
    expect(rows[1]?.kind === 'del' && rows[1]?.text).toBe('   foo')
    expect(rows[2]?.kind === 'add' && rows[2]?.text).toBe('   bar')
  })

  test('handles a new file (empty old side)', () => {
    const rows = parseDiff(
      [
        'diff --git a/new.txt b/new.txt',
        'new file mode 100644',
        'index 0000000..cadd876',
        '--- /dev/null',
        '+++ b/new.txt',
        '@@ -0,0 +1,2 @@',
        '+first',
        '+second',
      ].join('\n'),
    )
    expect(rows.map((r) => r.kind)).toEqual(['hunk', 'add', 'add'])
    const adds = rows.filter(
      (r): r is Extract<DiffRow, { kind: 'add' }> => r.kind === 'add',
    )
    expect(adds[0]?.oldNo).toBeUndefined()
    expect(adds[0]?.newNo).toBe(1)
    expect(adds[1]?.newNo).toBe(2)
  })

  test('keeps binary notices as meta rows', () => {
    const rows = parseDiff(
      'diff --git a/i.png b/i.png\nindex 1a2b..3c4d 100644\nBinary files a/i.png and b/i.png differ\n',
    )
    expect(rows).toEqual([{ kind: 'meta', text: 'Binary files a/i.png and b/i.png differ' }])
  })
})

describe('DiffPatchBody render', () => {
  test('renders gutters, hunk ranges, and word highlights', () => {
    const html = renderToString(DiffPatchBody({ text: patch }))
    expect(html).toContain('diff-row diff-row-hunk')
    expect(html).toContain('diff-hunk-range')
    expect(html).toContain('@@ -1,4 +1,4 @@')
    expect(html).toContain('diff-row diff-row-add')
    expect(html).toContain('diff-word-chg')
    expect(html).not.toContain('diff-word-same')
    // old-number gutter blank on adds, new-number gutter blank on dels
    expect(html).toContain(
      'class="diff-row diff-row-add"><span class="diff-ln diff-ln-old"></span>',
    )
    expect(html).toContain(
      'class="diff-row diff-row-del"><span class="diff-ln diff-ln-old">2</span><span class="diff-ln diff-ln-new"></span>',
    )
  })

  test('renders an empty placeholder for an empty patch', () => {
    const html = renderToString(DiffPatchBody({ text: '  \n' }))
    expect(html).toContain('diff-patch-empty')
  })

  test('renders a jump bar for multi-hunk patches and ids hunk rows', () => {
    const multiHunk = [
      '@@ -1,4 +1,4 @@',
      ' one',
      '-two',
      '+three',
      '@@ -20,3 +21,3 @@ ctx',
      ' four',
      '-five',
      '+six',
    ].join('\n')
    const html = renderToString(DiffPatchBody({ text: multiHunk }))
    expect(html).toContain('class="diff-hunk-nav"')
    expect(html).toContain('data-hunk="0"')
    expect(html).toContain('data-hunk="1"')
    expect(html).toContain('id="diff-hunk-0"')
    expect(html).toContain('id="diff-hunk-1"')
    expect(html).toContain('-1,4 +1,4')
    expect(html).toContain('-20,3 +21,3')
  })
})
