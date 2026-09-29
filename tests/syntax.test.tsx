import { expect, test } from 'bun:test'
import { highlightLines, syntaxSpans } from '../src/views/syntax'
import { CompareView } from '../src/views/compare'

function render(patch: string, path = 'test.sol', oldPath?: string) {
  const file = { status: oldPath ? 'R' : 'M', path, oldPath }
  return CompareView({ repo: '/tmp/example', name: 'example', scope: '', result: {
    refs: [], base: 'HEAD', target: 'worktree', files: [file], selected: file, patch,
  } }).toString()
}
function cells(html: string) {
  return [...html.matchAll(/<code>(.*?)<\/code>/gs)].map(match => match[1]!)
}
const text = (html: string) => html.replace(/<[^>]*>/g, '')

test('selected grammars preserve source text, including empty lines and Unicode', () => {
  const lines = ['/* 中文 🐈 */', '', 'hello world', '']
  for (const extension of ['sol', 'ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'md', 'yaml', 'sh', 'py', 'rs', 'go', 'toml']) {
    const tokens = highlightLines(lines, `a.${extension}`)
    expect(tokens).toBeDefined()
    expect(tokens!.map(line => line.map(token => token.content).join(''))).toEqual(lines)
  }
})

test('each side keeps its own multiline comment state through unchanged rows', () => {
  const code = cells(render('@@ -1,4 +1,4 @@\n-/* comment\n+// comment\n address owner;\n-*/\n+// end\n uint256 value;\n'))
  expect(code).toHaveLength(8)
  expect(text(code[2]!)).toBe('address owner;')
  expect(text(code[3]!)).toBe('address owner;')
  expect(code[2]).toContain('color:#88846F')
  expect(code[3]).toContain('color:#66D9EF')
  expect(code[6]).toBe(code[7])
})

test('syntax and word-diff boundaries can cross, with neither text nor change ranges lost', () => {
  const spans = syntaxSpans([
    { content: 'foo(', color: 'red' }, { content: 'bar)', color: 'blue' },
  ], [{ t: 'foo', chg: false }, { t: '(bar', chg: true }, { t: ')', chg: false }])
  expect(spans.map(span => span.text).join('')).toBe('foo(bar)')
  expect(spans.filter(span => span.changed).map(span => span.text).join('')).toBe('(bar')
  expect(spans.map(span => span.color)).toEqual(['red', 'red', 'blue', 'blue'])
  const code = cells(render('@@ -1 +1 @@\n-address owner;\n+address recipient;\n'))
  expect(code[0]).toContain('color:#66D9EF')
  expect(code[1]).toContain('class="diff-word-chg">recipient;</span>')
})

test('highlighted code is escaped and cannot inject markup', () => {
  const code = cells(render('@@ -0,0 +1 @@\n+const value = "<script>alert(1)</script>&";\n', 'a.ts'))
  expect(code[1]).toContain('&lt;script&gt;')
  expect(code[1]).not.toContain('<script>')
  expect(code[1]).toContain('&amp;')
})

test('renames choose each side’s language; added and deleted files preserve alignment', () => {
  const renamed = cells(render('@@ -1 +1 @@\n-address owner;\n+address recipient;\n', 'a.sol', 'a.txt'))
  expect(renamed[0]).not.toContain('style="color:')
  expect(renamed[1]).toContain('style="color:')
  for (const [patch, index] of [
    ['@@ -0,0 +1 @@\n+address owner;\n', 1],
    ['@@ -1 +0,0 @@\n-address owner;\n', 0],
  ] as const) {
    const code = cells(render(patch))
    expect(code[index]).toContain('color:#66D9EF')
    expect(code[1 - index]).toBe('')
  }
})

test('unknown languages and expensive inputs fall back to the existing reader', () => {
  expect(highlightLines(['address owner;'], 'a.unknown')).toBeUndefined()
  expect(highlightLines(['x'.repeat(2001)], 'a.ts')).toBeUndefined()
  expect(highlightLines(Array(2001).fill('const x = 1;'), 'a.ts')).toBeUndefined()
  expect(highlightLines(Array(1000).fill('x'.repeat(101)), 'a.ts')).toBeUndefined()
  expect(highlightLines(Array(1200).fill('const a = 1; const b = 2; const c = 3;'), 'a.ts')).toBeUndefined()
  const patch = '@@ -1,2001 +1,2001 @@\n' + ' address owner;\n'.repeat(2000) + '-address old;\n+address next;\n'
  const code = cells(render(patch))
  expect(code).toHaveLength(4002)
  expect(code.join('')).not.toContain('style="color:')
  expect(code.at(-1)).toContain('diff-word-chg')
})
