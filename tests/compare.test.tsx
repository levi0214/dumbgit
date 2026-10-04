import { expect, test } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compare, comparisonRefs } from '../src/compare'
import { CompareView, CompareReader, compareColors, splitRows } from '../src/views/compare'

function git(cwd: string, ...args: string[]) {
  const p = Bun.spawnSync(['git', ...args], { cwd })
  if (p.exitCode) throw new Error(p.stderr.toString())
  return p.stdout.toString().trim()
}
test('HEAD-suffixed branches remain comparable while remote HEAD symbolic aliases are excluded', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dg-compare-head-'))
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'config', 'user.email', 'test@example.test')
    git(repo, 'commit', '--allow-empty', '-m', 'test: base')
    git(repo, 'switch', '-c', 'feature/HEAD')
    git(repo, 'update-ref', 'refs/remotes/origin/feature/HEAD', 'HEAD')
    git(repo, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature/HEAD')
    const refs = await comparisonRefs(repo)
    expect(refs[0]).toEqual({ value: 'refs/heads/feature/HEAD', label: 'feature/HEAD', current: true })
    expect(refs.some(ref => ref.value === 'refs/remotes/origin/feature/HEAD')).toBe(true)
    expect(refs.some(ref => ref.value === 'refs/remotes/origin/HEAD')).toBe(false)
    expect((await compare(repo, {})).target).toBe('refs/heads/feature/HEAD')
    const result = await compare(repo, {
      base: 'refs/heads/feature/HEAD', target: 'refs/remotes/origin/feature/HEAD',
    })
    expect(result.files).toEqual([])
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('direct branch and working tree comparisons, literal paths, rename and binary files', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dg-compare-'))
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'config', 'user.email', 'test@example.test')
    mkdirSync(path.join(repo, 'contracts'))
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'before\n')
    writeFileSync(path.join(repo, 'rename.txt'), 'unchanged\n')
    writeFileSync(path.join(repo, 'deleted.txt'), 'gone\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'test: base')
    git(repo, 'switch', '-c', 'feature')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'after\n')
    renameSync(path.join(repo, 'rename.txt'), path.join(repo, 'renamed.txt'))
    rmSync(path.join(repo, 'deleted.txt'))
    mkdirSync(path.join(repo, 'contracts', 'nested'))
    writeFileSync(path.join(repo, 'contracts', 'nested', 'child.txt'), 'nested change\n')
    mkdirSync(path.join(repo, 'contracts-other'))
    writeFileSync(path.join(repo, 'contracts-other', 'outside.txt'), 'outside\n')
    writeFileSync(path.join(repo, 'binary'), Buffer.from([0, 1, 2]))
    writeFileSync(path.join(repo, 'tab\tline\n.txt'), 'odd name\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'test: feature')
    const r = await compare(repo, {})
    expect(r.base).toBe('refs/heads/main')
    expect(r.target).toBe('refs/heads/feature')
    expect(r.files.find(f => f.path === 'renamed.txt')).toMatchObject({ oldPath: 'rename.txt', added: 0, deleted: 0 })
    expect(r.files.find(f => f.path === 'contracts/[a].txt')).toMatchObject({ added: 1, deleted: 1 })
    expect(r.files.find(f => f.path === 'tab\tline\n.txt')).toMatchObject({ added: 1, deleted: 0 })
    expect(r.files.find(f => f.path === 'deleted.txt')).toMatchObject({ added: 0, deleted: 1 })
    expect(r.files.find(f => f.path === 'binary')).toMatchObject({ binary: true })
    expect(r.files.find(f => f.path === 'binary')?.added).toBeUndefined()
    expect(r.files.some(f => f.path === 'tab\tline\n.txt')).toBe(true)
    expect(r.files.some(f => f.status === 'D')).toBe(true)
    // A caller cannot corrupt the immutable comparison cached for later clicks.
    const repeated = await compare(repo, {})
    repeated.files[0]!.path = 'modified-by-caller'
    expect((await compare(repo, {})).files).toEqual(r.files)
    const filtered = await compare(repo, { scope: 'contracts/[a].txt' })
    expect(filtered.files.length).toBe(1)
    expect(filtered.patch).toContain('+after')
    expect(filtered.patch).toContain('-before')
    const folder = await compare(repo, { scope: 'contracts/' })
    expect(folder.files.map(file => file.path)).toEqual(['contracts/[a].txt', 'contracts/nested/child.txt'])
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'staged\n')
    git(repo, 'add', '.')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'working\n')
    writeFileSync(path.join(repo, 'untracked'), 'invisible\n')
    const work = await compare(repo, { target: 'worktree', scope: 'contracts/' })
    expect(work.files[0]).toMatchObject({ added: 1, deleted: 1 })
    expect(work.patch).toContain('+working')
    expect(work.patch).not.toContain('+staged')
    writeFileSync(path.join(repo, 'contracts', '[a].txt'), 'new working\nsecond line\n')
    const updatedWork = await compare(repo, { target: 'worktree', scope: 'contracts/' })
    expect(updatedWork.files[0]).toMatchObject({ added: 2, deleted: 1 })
    expect(updatedWork.patch).toContain('+new working')
    expect((await compare(repo, { target: 'worktree' })).files.some(f => f.path === 'untracked')).toBe(false)
    expect((await compare(repo, { scope: 'missing/' })).files).toEqual([])
    expect((await compare(repo, { file: 'binary' })).patch).toContain('Binary files')
    // Advance main separately: comparison must use its tip, not the merge base.
    git(repo, 'restore', '--staged', '--worktree', 'contracts/[a].txt')
    git(repo, 'switch', 'main')
    writeFileSync(path.join(repo, 'main-only'), 'tip\n')
    git(repo, 'add', 'main-only')
    git(repo, 'commit', '-m', 'test: advance main')
    const direct = await compare(repo, { target: 'refs/heads/feature' })
    expect(direct.files.some(f => f.path === 'main-only' && f.status === 'D')).toBe(true)
    expect(git(repo, 'branch', '--show-current')).toBe('main')
    await expect(compare(repo, { base: '--help' })).rejects.toThrow('Unknown')
    await expect(compare(repo, { scope: '../' })).rejects.toThrow('relative')
  } finally { rmSync(repo, { recursive: true, force: true }) }
})

test('split rows preserve independent line numbers and align unequal replacements', () => {
  const rows = splitRows('@@ -1,4 +1,3 @@\n same\n-old\n-removed\n+new\n end\n')
  expect(rows.length).toBe(4)
  expect(rows[1]?.left?.text).toBe('old')
  expect(rows[1]?.right?.text).toBe('new')
  expect(rows[2]?.right).toBeUndefined()
  expect(rows[3]?.left?.oldNo).toBe(4)
  expect(rows[3]?.right?.newNo).toBe(3)
})

test('reader displays the full document and exposes change navigation', () => {
  const patch = '@@ -1,21 +1,21 @@\n' + Array.from({ length: 20 }, (_, i) => ` line ${i}\n`).join('') + '-old\n+<script>alert(1)</script>\n'
  const html = CompareView({ repo: '/tmp/example', name: 'example', scope: '', result: { refs: [{ value: 'HEAD', label: 'HEAD' }], base: 'HEAD', target: 'worktree', files: [{ status: 'M', path: 'a.txt' }], selected: { status: 'M', path: 'a.txt' }, patch } }).toString()
  expect(html).not.toContain('<details')
  expect(html).toContain('line 0')
  expect(html).toContain('line 19')
  expect(html).not.toContain('<button>Compare</button>')
  expect(html).not.toContain('data-compare-jump')
  expect(html).toContain('aria-label="Resize file list"')
  expect(html).toContain('compare-change-0')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('untracked files are excluded')
})

function renderPatch(patch: string) {
  return CompareView({ repo: '/tmp/example', name: 'example', scope: '', result: {
    refs: [{ value: 'HEAD', label: 'HEAD' }], base: 'HEAD', target: 'worktree',
    files: [{ status: 'M', path: 'a.txt' }], selected: { status: 'M', path: 'a.txt' }, patch,
  } }).toString()
}

test('overview groups changes, distinguishes additions and deletions, and targets the matching block', () => {
  const html = renderPatch('@@ -1,5 +1,5 @@\n-deleted\n same\n+added\n same\n-old\n+new\n end\n')
  expect(html.match(/class="compare-marker"/g)?.length).toBe(3)
  expect(html).toContain('Deleted lines · change 1')
  expect(html).toContain('Added lines · change 2')
  expect(html).toContain('Modified lines · change 3')
  expect(html.match(/class="compare-marker-del"/g)?.length).toBe(2)
  expect(html.match(/class="compare-marker-add"/g)?.length).toBe(2)
  for (let i = 0; i < 3; i++) {
    expect(html).toContain(`aria-controls="compare-change-${i}"`)
    expect(html).toContain(`id="compare-change-${i}" class="compare-change"`)
  }
  expect(html).toContain('class="compare-viewport"')
})

test('large diffs remain selectable without rendering thousands of code rows', () => {
  const patch = '@@ -1,5001 +1,5001 @@\n' + ' unchanged\n'.repeat(5000) + '-old\n+new\n'
  const html = renderPatch(patch)
  expect(html).toContain('5,000-row display limit')
  expect(html).not.toContain('class="compare-code')
  expect(html).not.toContain('class="compare-marker"')
})

test('file list uses consistent counts and describes file status in tooltips', () => {
  const files = [
    { status: 'M', path: 'modified.ts', added: 12, deleted: 5 },
    { status: 'R100', path: 'new.ts', oldPath: 'old.ts', added: 0, deleted: 0 },
    { status: 'M', path: 'image.png', binary: true },
  ]
  const html = CompareView({ repo: '/tmp/example', name: 'example', scope: '', result: {
    refs: [], base: 'HEAD', target: 'worktree', files, patch: '',
  } }).toString()
  const list = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
  expect(list).toContain('>+12</span>')
  expect(list).toContain('>−5</span>')
  expect(list).not.toContain('file-M')
  expect(list).not.toContain('file-status')
  expect(list).toContain('Renamed · old.ts → new.ts')
  expect(list).toContain('Modified · modified.ts')
  expect(list).toContain('old.ts → new.ts')
  expect(list).toContain('>binary</span>')
})

// Execute the actual page controller with geometry supplied by the test.
// This checks initial positioning and the htmx refresh lifecycle together.
function readerController(firstTop: number, navigationType = 'navigate', savedTop?: number) {
  const callbacks = new Map<number, () => void>()
  const events = new Map<string, (event: any) => void>()
  let nextFrame = 0
  const offsets: Record<string, string> = {}
  const codes = Array.from({ length: 10000 }, () => ({ scrollWidth: 900, style: { transform: '' } }))
  const scrollEvents = new Map<string, () => void>()
  const bars = ['left', 'right'].map(side => ({
    dataset: { side }, scrollLeft: 0, firstElementChild: { style: { width: '' } },
    onscroll: () => {},
  }))
  const cleanup = { removed: false, disconnected: false }
  const reader = {
    id: 'compare-reader',
    querySelector: () => ({ dataset: {}, remove() { cleanup.removed = true } }),
    querySelectorAll: () => bars, dataset: { file: 'a.txt' } as Record<string, string>,
    style: { setProperty(name: string, value: string) { offsets[name] = value } },
  }
  const first = {
    scrollWidth: 900,
    getBoundingClientRect: () => ({ top: firstTop - scroll.scrollTop, height: 21, width: 40 }),
    querySelector: () => ({ getBoundingClientRect: () => ({ width: 40 }) }),
  }
  const scroll = {
    scrollTop: 0, scrollHeight: 2000, clientHeight: 300,
    offsetWidth: 800, clientWidth: 785, isConnected: true,
    getBoundingClientRect: () => ({ top: 0, bottom: 300 }),
    querySelector: () => first, querySelectorAll: (selector: string) => selector === '.compare-code code' ? codes : [first], closest: () => reader,
    addEventListener(name: string, callback: () => void) { scrollEvents.set(name, callback) },
    removeEventListener(name: string) { scrollEvents.delete(name) },
  }
  const script = [...renderPatch('@@ -1 +1 @@\n-old\n+new\n').matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)![1]!
  runInNewContext(script, {
    window: { addEventListener() {} }, location: { href: 'http://local/compare' },
    document: {
      addEventListener: (name: string, callback: (event: any) => void) => events.set(name, callback),
      querySelector: (selector: string) => selector === '.compare-scroll' ? scroll : selector === '.compare-viewport' ? { style: {} } : selector === '#compare-reader' ? reader : { value: '' },
      querySelectorAll: () => [],
    },
    ResizeObserver: class { observe() {} disconnect() { cleanup.disconnected = true } },
    requestAnimationFrame: (callback: () => void) => { callbacks.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: (id: number) => callbacks.delete(id),
    getComputedStyle: () => ({ lineHeight: '21px' }),
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    sessionStorage: { getItem: () => savedTop === undefined ? null : JSON.stringify({ url: 'http://local/compare', top: savedTop }) },
  })
  const paint = () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback()) }
  paint()
  paint()
  return { scroll, reader, events, paint, bars, offsets, codes, scrollEvents, callbacks, cleanup }
}

test('reader cleanup removes plain code and releases scheduled work before htmx walks its children', () => {
  const controller = readerController(150)
  controller.scrollEvents.get('scroll')!()
  const cleanup = controller.events.get('htmx:beforeCleanupElement')!
  cleanup({ detail: { elt: { id: 'other-element' } } })
  expect(controller.cleanup.removed).toBe(false)
  expect(controller.callbacks.size).toBe(1)
  cleanup({ detail: { elt: controller.reader } })
  expect(controller.cleanup.removed).toBe(true)
  expect(controller.cleanup.disconnected).toBe(true)
  expect(controller.scrollEvents.size).toBe(0)
  expect(controller.callbacks.size).toBe(0)
  controller.events.get('htmx:afterSwap')!({ detail: { target: { id: 'compare-reader' } } })
  expect(controller.scrollEvents.has('scroll')).toBe(true)
  controller.paint()
})

test('first change stays at the top when already visible, otherwise opens with three context lines', () => {
  expect(readerController(150).scroll.scrollTop).toBe(0)
  const distant = readerController(1000)
  expect(distant.scroll.scrollTop).toBe(937)
})

test('manual refresh and browser reload retain reading position, file switches reveal the first change', () => {
  const controller = readerController(1000)
  controller.scroll.scrollTop = 1500
  const refresh = { dataset: {} as Record<string, string>, matches: () => true }
  controller.events.get('htmx:beforeRequest')!({ detail: { elt: refresh } })
  controller.scroll.scrollTop = 0 // Newly swapped reader.
  controller.events.get('htmx:afterSwap')!({ detail: { target: { id: 'compare-results' }, requestConfig: { elt: refresh } } })
  controller.paint()
  expect(controller.scroll.scrollTop).toBe(1500)
  controller.scroll.scrollTop = 0
  controller.events.get('htmx:afterSwap')!({ detail: { target: { id: 'compare-reader' }, requestConfig: { elt: { matches: () => false } } } })
  controller.paint()
  expect(controller.scroll.scrollTop).toBe(937)
  expect(readerController(1000, 'reload', 1500).scroll.scrollTop).toBe(1500)
})

test('file list resizing supports the keyboard and clamps width to half the page', () => {
  const controller = readerController(150)
  let width = 320
  const page = { style: {
    setProperty: (_name: string, value: string) => { width = parseFloat(value) },
    removeProperty: () => { width = 320 },
  } }
  const handle = {
    closest: (selector: string) => selector === '.compare-page' ? page : { clientWidth: 1000 },
    previousElementSibling: { getBoundingClientRect: () => ({ width }) },
  }
  const press = (key: string) => controller.events.get('keydown')!({
    key, target: { closest: () => handle }, preventDefault() {},
  })
  press('ArrowRight')
  expect(width).toBe(340)
  for (let i = 0; i < 30; i++) press('ArrowRight')
  expect(width).toBe(500)
  for (let i = 0; i < 30; i++) press('ArrowLeft')
  expect(width).toBe(160)
  press('Home')
  expect(width).toBe(320)
})

test('horizontal scrolling keeps both sides aligned and includes the fixed gutter in its range', () => {
  const { bars, offsets, scroll, paint, codes } = readerController(1000)
  expect(bars[0]!.firstElementChild.style.width).toBe('952px')
  bars[0]!.scrollLeft = 180
  bars[0]!.onscroll()
  paint()
  expect(codes[90]!.style.transform).toBe('translateX(-180px)')
  expect(offsets['--compare-x']).toBeUndefined()
  expect(bars[1]!.scrollLeft).toBe(180)
  bars[1]!.scrollLeft = 90
  bars[1]!.onscroll()
  paint()
  expect(codes[90]!.style.transform).toBe('translateX(-90px)')
  expect(bars[0]!.scrollLeft).toBe(90)
  expect(scroll.scrollTop).toBe(937)
})

test('horizontal updates coalesce, ignore sync feedback, and only touch visible rows', () => {
  const { bars, codes, scroll, scrollEvents, paint, callbacks, events } = readerController(0)
  for (let left = 1; left <= 100; left++) {
    bars[0]!.scrollLeft = left
    bars[0]!.onscroll()
    bars[1]!.onscroll() // Browser event from the synchronized bar.
  }
  expect(callbacks.size).toBe(1)
  expect(codes[0]!.style.transform).toBe('translateX(0px)')
  paint()
  expect(codes.filter(code => code.style.transform === 'translateX(-100px)').length).toBe(32)
  expect(codes[9999]!.style.transform).toBe('')
  scroll.scrollTop = 2100
  scrollEvents.get('scroll')!()
  paint()
  expect(codes[200]!.style.transform).toBe('translateX(-100px)')
  bars[1]!.scrollLeft = 20
  bars[1]!.onscroll()
  scroll.scrollTop = 0
  scrollEvents.get('scroll')!()
  paint()
  expect(codes[0]!.style.transform).toBe('translateX(-20px)')
  expect(bars[0]!.scrollLeft).toBe(20)
  // A swap cancels pending work against the previous document.
  bars[0]!.scrollLeft = 50
  bars[0]!.onscroll()
  events.get('htmx:historyRestore')!({})
  expect(callbacks.size).toBe(1)
  paint()
  paint()
  expect(codes[0]!.style.transform).toBe('translateX(-50px)')
})

test('line number gutters use the largest actual line number on either side', () => {
  expect(renderPatch('@@ -1 +1 @@\n-a\n+b\n')).toContain('--compare-line-digits: 1')
  expect(renderPatch('@@ -99,2 +9,2 @@\n-a\n+b\n c\n')).toContain('--compare-line-digits: 3')
  expect(renderPatch('@@ -9,2 +999,2 @@\n-a\n+b\n c\n')).toContain('--compare-line-digits: 4')
})

test('compact controls remain available for empty comparisons and errors', () => {
  for (const error of [undefined, 'Unknown ref']) {
    const html = CompareView({ repo: '/tmp/example', name: 'example', scope: 'src/', error,
      result: { refs: [{ value: 'HEAD', label: 'HEAD' }], base: 'HEAD', target: 'worktree', files: [], patch: '' },
    }).toString()
    expect(html).toContain('aria-label="Base version"')
    expect(html).toContain('aria-label="Target version"')
    expect(html).toContain('type="hidden" name="scope" value="src/"')
    expect(html).toContain('>All files</a>')
    expect(html).not.toContain('id="compare-scope"')
    expect(html).toContain('hx-include="closest form"')
    expect(html).not.toContain('class="compare-note"')
    expect(html).toContain(error ?? 'No differences in this path.')
  }
})

test('directory groups show filenames while preserving full paths in links and tooltips', () => {
  const html = CompareView({ repo: '/tmp/example', name: 'example', scope: '',
    result: { refs: [], base: 'HEAD', target: 'worktree', patch: '',
      files: ['src/a.ts', 'src/b.ts', 'test/a.ts', 'README.md'].map(path => ({ status: 'M', path })),
    },
  }).toString()
  expect(html.match(/class="compare-directory"/g)?.length).toBe(2)
  expect(html).toContain('title="Show changes in src/"')
  expect(html).toContain('<span title="src">src</span>')
  expect(html).toContain('aria-label="Filter to src/"')
  expect(html).not.toContain('<a class="compare-directory"')
  expect(html).toContain('class="compare-file-path" data-status="M">a.ts</span>')
  expect(html).toContain('Modified · test/a.ts')
  expect(html).toContain('file=test%2Fa.ts')
  expect(html).toContain('class="compare-file-path" data-status="M">README.md</span>')
})

test('folder links set a directory scope and All files clears it without changing versions', () => {
  const render = (scope: string) => CompareView({ repo: '/tmp/example', name: 'example', scope,
    result: { refs: [], base: 'refs/heads/main', target: 'worktree', patch: '',
      files: [{ status: 'M', path: 'src/a & b/file.ts' }],
    },
  }).toString()
  const folder = render('').match(/class="compare-directory-filter"[^>]*href="([^"]+)"/)![1]!
  const scoped = new URL(folder.replaceAll('&amp;', '&'), 'http://local')
  expect(scoped.searchParams.get('scope')).toBe('src/a & b/')
  expect(scoped.searchParams.get('base')).toBe('refs/heads/main')
  expect(scoped.searchParams.get('target')).toBe('worktree')
  const filtered = render('src/a & b/')
  const back = filtered.match(/<a href="([^"]+)"[^>]*>All files<\/a>/)![1]!
  const all = new URL(back.replaceAll('&amp;', '&'), 'http://local')
  expect(all.searchParams.get('scope')).toBe('')
  expect(all.searchParams.get('base')).toBe('refs/heads/main')
  expect(all.searchParams.get('target')).toBe('worktree')
})

test('file tree nests shared parents, compacts single-child directories and keeps root files outside folders', () => {
  const html = CompareView({ repo: '/tmp/example', name: 'example', scope: '',
    result: { refs: [], base: 'HEAD', target: 'worktree', patch: '',
      files: ['contracts/src/deep/a.sol', 'contracts/test/a.sol', 'README.md'].map(path => ({ status: 'M', path })),
    },
  }).toString()
  expect(html.match(/class="compare-folder"/g)?.length).toBe(3)
  expect(html).toContain('data-directory="contracts" open')
  expect(html).toContain('data-directory="contracts/src/deep" open')
  expect(html).toContain('<span title="contracts/src/deep">src/deep</span>')
  expect(html).toContain('aria-label="Filter to contracts/"')
  expect(html).toContain('aria-label="Filter to contracts/src/deep/"')
  expect(html.indexOf('data-directory="contracts"')).toBeLessThan(html.indexOf('data-directory="contracts/src/deep"'))
  const list = html.slice(html.indexOf('class="compare-file-list"'), html.indexOf('</aside>'))
  expect(list.lastIndexOf('</details>')).toBeLessThan(list.indexOf('>README.md</span>'))
  expect(list.match(/<summary/g)?.length).toBe(3)
})

test('branches prioritize current and recent commits, and saved comparisons yield to explicit links or deleted branches', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'dg-compare-refs-'))
  try {
    git(repo, 'init', '-b', 'main')
    git(repo, 'config', 'user.name', 'Test')
    git(repo, 'config', 'user.email', 'test@example.test')
    const commit = (date: string) => {
      const result = Bun.spawnSync(['git', 'commit', '--allow-empty', '-m', 'test: dated commit'], {
        cwd: repo, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      })
      expect(result.exitCode).toBe(0)
    }
    commit('2020-01-01T00:00:00Z')
    git(repo, 'switch', '-c', 'a-old')
    commit('2021-01-01T00:00:00Z')
    git(repo, 'switch', '-c', 'z-new')
    commit('2022-01-01T00:00:00Z')
    git(repo, 'update-ref', 'refs/remotes/origin/z-new', 'HEAD')
    git(repo, 'switch', 'main')
    const refs = await comparisonRefs(repo)
    expect(refs[0]).toMatchObject({ value: 'refs/heads/main', current: true })
    expect(refs.filter(ref => ref.value.startsWith('refs/heads/')).map(ref => ref.label)).toEqual(['main', 'z-new', 'a-old'])
    const previous = { base: 'refs/heads/a-old', target: 'refs/heads/z-new' }
    expect(await compare(repo, { previous })).toMatchObject(previous)
    expect(await compare(repo, { previous, target: 'worktree' })).toMatchObject({ base: 'refs/heads/main', target: 'worktree' })
    const html = CompareView({ repo, name: 'test', scope: '', result: await compare(repo, {}) }).toString()
    expect(html).toContain('main (current)')
    expect(html.indexOf('Local branches')).toBeLessThan(html.indexOf('Remote branches'))
    git(repo, 'branch', '-D', 'z-new')
    expect(await compare(repo, { previous })).toMatchObject({ base: 'refs/heads/main', target: 'refs/heads/main' })
    git(repo, 'checkout', '--detach')
    expect((await comparisonRefs(repo))[0]).toMatchObject({ value: 'HEAD', current: true })
  } finally { rmSync(repo, { recursive: true, force: true }) }
})


test('word-diff matches stay aligned around an inserted line', () => {
  const rows = splitRows([
    '@@ -1,2 +1,3 @@',
    '-    actions[id] = Action({creator: sender, uri: uri});',
    '-    emit ActionSubmitted(token, id, sender, uri);',
    '+    require(owner != address(0));',
    '+    actions[id] = Action({creator: sender, owner: owner, uri: uri});',
    '+    emit ActionSubmitted(token, id, sender, owner, uri);',
  ].join('\n'))
  expect(rows.map(r => [r.left?.oldNo, r.right?.newNo])).toEqual([[undefined, 1], [1, 2], [2, 3]])
  expect(rows[0]?.right?.word).toBeUndefined()
  expect(rows[1]?.right?.word?.filter(w => w.chg).map(w => w.t).join('')).toContain('owner: owner,')
  expect(rows[2]?.right?.word?.filter(w => w.chg).map(w => w.t).join('')).toContain('owner,')
})


test('cold readers defer syntax while retaining word changes, and color output escapes source text', () => {
  const patch = '@@ -1 +1 @@\n-const deferredReaderValue = "<before>";\n+const deferredReaderValue = "<after>";\n'
  const file = { path: 'deferred-reader.ts', status: 'M' }
  const props = { repo: '/repo', name: 'repo', scope: '', result: {
    refs: [], base: 'HEAD', target: 'worktree', files: [file], selected: file, patch,
  } }
  const plain = (<CompareReader {...props} />).toString()
  expect(plain).toContain('data-color-pending="true"')
  expect(plain).toContain('diff-word-chg')
  expect(plain).not.toContain('style="color:')
  const cells = compareColors(patch, file)
  expect(cells.map(cell => cell.text)).toEqual([
    'const deferredReaderValue = "<before>";', 'const deferredReaderValue = "<after>";',
  ])
  expect(cells[0]!.html).toContain('&lt;')
  expect(cells[0]!.html).not.toContain('<before>')
  expect(cells[1]!.html).toContain('diff-word-chg')
  const warm = (<CompareReader {...props} />).toString()
  expect(warm).not.toContain('data-color-pending')
  expect(warm).toContain('style="color:')
})


test('history swap events without a request target leave reattachment to historyRestore', () => {
  const controller = readerController(150)
  expect(() => controller.events.get('htmx:beforeSwap')!({ detail: { elt: { id: 'body' } } })).not.toThrow()
  expect(() => controller.events.get('htmx:afterSwap')!({ detail: { elt: { id: 'body' } } })).not.toThrow()
  expect(controller.callbacks.size).toBe(0)
  controller.events.get('htmx:historyRestore')!({ detail: {} })
  expect(controller.callbacks.size).toBe(1)
})
