#!/usr/bin/env bun
/**
 * Build disposable screenshot demo repositories.
 *
 * Repos live outside this project tree (default: Application Support) and use a
 * separate DUMBGIT_HISTORY_FILE so real workspace bookmarks stay untouched.
 *
 *   bun scripts/seed-demo-repos.ts
 *   bun scripts/seed-demo-repos.ts --open
 *   bun scripts/seed-demo-repos.ts --clean
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEMO_ROOT = process.env.DUMBGIT_DEMO_ROOT
  ? path.resolve(process.env.DUMBGIT_DEMO_ROOT)
  : path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'dumbgit',
      'demo-repos',
    )
const HISTORY_FILE = path.join(DEMO_ROOT, 'repos.json')
const AUTHOR_NAME = 'Demo Gardener'
const AUTHOR_EMAIL = 'demo@dumbgit.local'

type CommitSpec = {
  subject: string
  files: Record<string, string>
  /** Days before "now" for author/committer dates. */
  daysAgo: number
}

function die(message: string): never {
  console.error(`seed-demo-repos: ${message}`)
  process.exit(1)
}

function run(
  cwd: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    die(`${command} ${args.join(' ')} failed in ${cwd}\n${detail}`)
  }
  return (result.stdout ?? '').trim()
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return run(cwd, 'git', args, {
    GIT_AUTHOR_NAME: AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
    GIT_COMMITTER_NAME: AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
    ...env,
  })
}

function writeFiles(cwd: string, files: Record<string, string>): void {
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(cwd, rel)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
}

function commitAt(cwd: string, spec: CommitSpec): string {
  writeFiles(cwd, spec.files)
  git(cwd, ['add', '-A'])
  const when = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000)
  const iso = when.toISOString()
  return git(
    cwd,
    ['commit', '-m', spec.subject, '--allow-empty'],
    {
      GIT_AUTHOR_DATE: iso,
      GIT_COMMITTER_DATE: iso,
    },
  )
}

function initRepo(name: string): string {
  const cwd = path.join(DEMO_ROOT, name)
  rmSync(cwd, { recursive: true, force: true })
  mkdirSync(cwd, { recursive: true })
  git(cwd, ['init', '-b', 'main'])
  git(cwd, ['config', 'user.name', AUTHOR_NAME])
  git(cwd, ['config', 'user.email', AUTHOR_EMAIL])
  return cwd
}

function addBareRemote(cwd: string, remoteName = 'origin'): string {
  const bare = `${cwd}.git`
  rmSync(bare, { recursive: true, force: true })
  run(DEMO_ROOT, 'git', ['init', '--bare', '-b', 'main', bare])
  git(cwd, ['remote', 'add', remoteName, bare])
  return bare
}

function pushAll(cwd: string): void {
  git(cwd, ['push', '-u', 'origin', '--all'])
  git(cwd, ['push', 'origin', '--tags'])
}

function linearCommits(
  subjects: string[],
  fileFor: (index: number, subject: string) => Record<string, string>,
  startDaysAgo: number,
): CommitSpec[] {
  return subjects.map((subject, index) => ({
    subject,
    files: fileFor(index, subject),
    daysAgo: startDaysAgo - index,
  }))
}

/** Wide graph: parallel features, hotfix, tags, remotes. */
function seedGarden(): string {
  const cwd = initRepo('demo-garden')
  const trunk = linearCommits(
    [
      'chore: plant the first seed',
      'docs: sketch the garden layout',
      'feat: add a watering can',
      'feat: mark sunny beds',
      'fix: stop overwatering the mint',
      'feat: build a compost bin',
      'refactor: tidy the tool shed',
      'feat: string lights along the fence',
      'docs: note frost dates',
      'chore: mulch before winter',
      'feat: start a seed tray',
      'fix: patch the leaky hose',
    ],
    (i) => ({
      'README.md': `# demo-garden\n\nScreenshot fixture for dumbgit graphs.\n`,
      'beds/layout.txt': `bed count: ${i + 1}\n`,
      'tools/inventory.txt': `watering-can\n${i > 4 ? 'compost-bin\n' : ''}hose\n`,
    }),
    40,
  )
  for (const spec of trunk) commitAt(cwd, spec)

  // Branch from an older commit for a long-lived feature lane.
  const baseSha = git(cwd, ['rev-list', '--max-count=1', '--skip=7', 'main'])
  git(cwd, ['branch', 'feature/irrigation', baseSha])
  git(cwd, ['checkout', 'feature/irrigation'])
  commitAt(cwd, {
    subject: 'feat: map drip lines',
    files: { 'irrigation/map.txt': 'north bed → timer A\n' },
    daysAgo: 18,
  })
  commitAt(cwd, {
    subject: 'feat: add a rain barrel',
    files: { 'irrigation/barrel.txt': 'capacity: 200L\n' },
    daysAgo: 16,
  })
  commitAt(cwd, {
    subject: 'fix: unclog the emitter',
    files: { 'irrigation/map.txt': 'north bed → timer A\nsouth bed → timer B\n' },
    daysAgo: 14,
  })

  git(cwd, ['checkout', 'main'])
  const fenceBase = git(cwd, ['rev-list', '--max-count=1', '--skip=3', 'main'])
  git(cwd, ['branch', 'feature/fence', fenceBase])
  git(cwd, ['checkout', 'feature/fence'])
  commitAt(cwd, {
    subject: 'feat: stake the south fence',
    files: { 'fence/posts.txt': 'cedar posts x8\n' },
    daysAgo: 10,
  })
  commitAt(cwd, {
    subject: 'feat: hang a garden gate',
    files: { 'fence/gate.txt': 'latch: left\n' },
    daysAgo: 8,
  })

  git(cwd, ['checkout', 'main'])
  git(cwd, ['branch', 'hotfix/frost-cloth'])
  git(cwd, ['checkout', 'hotfix/frost-cloth'])
  commitAt(cwd, {
    subject: 'fix: cover tomatoes overnight',
    files: { 'beds/frost.txt': 'cloth on by 6pm\n' },
    daysAgo: 2,
  })

  git(cwd, ['checkout', 'main'])
  const tagBase = git(cwd, ['rev-list', '--max-count=1', '--skip=6', 'main'])
  git(cwd, ['tag', '-a', 'v0.1.0', tagBase, '-m', 'demo-garden first harvest'])
  git(cwd, ['tag', '-a', 'v1.0.0', 'main', '-m', 'demo-garden steady state'])

  addBareRemote(cwd)
  pushAll(cwd)
  // Leave HEAD on the interesting branch for graph screenshots.
  git(cwd, ['checkout', 'feature/irrigation'])
  return cwd
}

/** Dirty worktree: staged, unstaged, untracked. */
function seedNotes(): string {
  const cwd = initRepo('demo-notes')
  const commits = linearCommits(
    [
      'chore: open the notebook',
      'docs: list weekly errands',
      'feat: add a grocery section',
      'feat: capture meeting scraps',
      'fix: correct Tuesday typo',
      'refactor: split personal and work',
      'docs: pack list for a weekend',
      'feat: pin a reading queue',
      'chore: archive March pages',
      'feat: draft a thank-you note',
      'docs: rainy day ideas',
    ],
    (i) => ({
      'README.md': '# demo-notes\n\nDirty worktree screenshot fixture.\n',
      'pages/index.md': `# Notes\n\npage ${i + 1}\n`,
      'pages/errands.md': '- milk\n- stamps\n',
    }),
    30,
  )
  for (const spec of commits) commitAt(cwd, spec)

  writeFiles(cwd, {
    'pages/errands.md': '- milk\n- stamps\n- bread\n',
    'pages/ideas.md': 'build a tiny git gui\n',
  })
  git(cwd, ['add', 'pages/errands.md'])
  writeFiles(cwd, {
    'pages/errands.md': '- milk\n- stamps\n- bread\n- oranges\n',
    'pages/scratch.txt': 'do not commit me yet\n',
    'pages/index.md': '# Notes\n\nedited locally\n',
  })
  return cwd
}

/** Clean linear history with release tags. */
function seedCookbook(): string {
  const cwd = initRepo('demo-cookbook')
  const commits = linearCommits(
    [
      'chore: start the recipe box',
      'feat: add oatmeal cookies',
      'feat: add tomato soup',
      'docs: note oven quirks',
      'fix: salt the soup less',
      'feat: add a simple loaf',
      'refactor: share a spice table',
      'feat: add lemon pasta',
      'docs: scale cookies for a crowd',
      'chore: photograph the loaf',
      'feat: add weekend chili',
      'docs: index by season',
    ],
    (i, subject) => ({
      'README.md': '# demo-cookbook\n\nClean release-tag fixture.\n',
      [`recipes/r${String(i + 1).padStart(2, '0')}.md`]: `# ${subject}\n\ningredients TBD\n`,
      'spices.txt': 'salt\npepper\npaprika\n',
    }),
    45,
  )
  for (const spec of commits) commitAt(cwd, spec)
  const mid = git(cwd, ['rev-list', '--max-count=1', '--skip=6', 'main'])
  git(cwd, ['tag', '-a', 'v0.2.0', mid, '-m', 'demo-cookbook soup season'])
  git(cwd, ['tag', '-a', 'v0.3.0', 'main', '-m', 'demo-cookbook chili night'])
  addBareRemote(cwd)
  pushAll(cwd)
  return cwd
}

/** Merge commits for denser graph lanes. */
function seedHarbor(): string {
  const cwd = initRepo('demo-harbor')
  const trunk = linearCommits(
    [
      'chore: chart the harbor',
      'feat: paint the breakwater',
      'feat: hang channel markers',
      'docs: tide table draft',
      'fix: straighten buoy #3',
      'feat: open a small cafe',
      'refactor: renumber slips',
      'feat: add a fuel dock',
      'docs: storm checklist',
      'chore: sweep the pier',
    ],
    (i) => ({
      'README.md': '# demo-harbor\n\nMerge-graph screenshot fixture.\n',
      'logbook.txt': `day ${i + 1}\n`,
    }),
    35,
  )
  for (const spec of trunk) commitAt(cwd, spec)

  const branchPoint = git(cwd, ['rev-list', '--max-count=1', '--skip=4', 'main'])
  git(cwd, ['checkout', '-b', 'feature/lighthouse', branchPoint])
  commitAt(cwd, {
    subject: 'feat: sketch the lighthouse',
    files: { 'lighthouse/plan.txt': 'stripes: red/white\n' },
    daysAgo: 20,
  })
  commitAt(cwd, {
    subject: 'feat: install the lamp',
    files: { 'lighthouse/lamp.txt': 'lens: fresnel\n' },
    daysAgo: 17,
  })
  commitAt(cwd, {
    subject: 'docs: lighthouse keepers rota',
    files: { 'lighthouse/rota.txt': 'week A / week B\n' },
    daysAgo: 15,
  })

  git(cwd, ['checkout', 'main'])
  commitAt(cwd, {
    subject: 'feat: widen the gangway',
    files: { 'pier/gangway.txt': 'width: 2m\n' },
    daysAgo: 14,
  })
  commitAt(cwd, {
    subject: 'fix: replace a loose plank',
    files: { 'pier/repairs.txt': 'plank 14\n' },
    daysAgo: 12,
  })

  // Real merge so the graph shows a join (dumbgit does not create these itself).
  git(cwd, [
    'merge',
    '--no-ff',
    'feature/lighthouse',
    '-m',
    'merge: land the lighthouse work',
  ])

  git(cwd, ['checkout', '-b', 'feature/ferry-schedule'])
  commitAt(cwd, {
    subject: 'feat: draft ferry times',
    files: { 'ferry/times.txt': '08:00 12:00 16:00\n' },
    daysAgo: 4,
  })
  commitAt(cwd, {
    subject: 'docs: print ticket stubs',
    files: { 'ferry/tickets.txt': 'stub format v1\n' },
    daysAgo: 3,
  })
  git(cwd, ['checkout', 'main'])
  git(cwd, ['tag', '-a', 'v2.0.0', 'main', '-m', 'demo-harbor lighthouse era'])
  addBareRemote(cwd)
  pushAll(cwd)
  return cwd
}

/** Remotes and an extra local topic branch left checked out. */
function seedWidgets(): string {
  const cwd = initRepo('demo-widgets')
  const commits = linearCommits(
    [
      'chore: bootstrap the widget kit',
      'feat: add a dial component',
      'feat: add a toggle',
      'fix: center the dial needle',
      'docs: show usage snippets',
      'feat: add a progress bar',
      'refactor: share color tokens',
      'feat: add a toast',
      'fix: toast stacking order',
      'chore: bump fixture data',
      'docs: accessibility notes',
      'feat: add a sparse list',
    ],
    (i) => ({
      'README.md': '# demo-widgets\n\nRemote-branch screenshot fixture.\n',
      'src/dial.ts': `export const ticks = ${i + 8}\n`,
      'src/tokens.css': ':root { --accent: teal; }\n',
    }),
    28,
  )
  for (const spec of commits) commitAt(cwd, spec)

  git(cwd, ['branch', 'develop'])
  git(cwd, ['checkout', '-b', 'feature/knob'])
  commitAt(cwd, {
    subject: 'feat: rough in a knob',
    files: { 'src/knob.ts': 'export const detents = 12\n' },
    daysAgo: 3,
  })
  commitAt(cwd, {
    subject: 'fix: detent click sound',
    files: { 'src/knob.ts': 'export const detents = 12\nexport const click = true\n' },
    daysAgo: 2,
  })

  addBareRemote(cwd)
  git(cwd, ['push', '-u', 'origin', 'main'])
  git(cwd, ['push', '-u', 'origin', 'develop'])
  git(cwd, ['push', '-u', 'origin', 'feature/knob'])
  return cwd
}

/** Lots of annotated + lightweight tags. */
function seedPalette(): string {
  const cwd = initRepo('demo-palette')
  const commits = linearCommits(
    [
      'chore: squeeze the first tube',
      'feat: mix a sky blue',
      'feat: mix a brick red',
      'docs: swatch card layout',
      'feat: add warm gray',
      'fix: blue was too purple',
      'feat: chartreuse trial',
      'refactor: name colors by use',
      'feat: night indigo',
      'docs: print a pocket guide',
      'chore: trim unused mixes',
      'feat: soft linen',
    ],
    (i) => ({
      'README.md': '# demo-palette\n\nTag-decoration screenshot fixture.\n',
      'swatches.md': `# Swatches\n\nstep ${i + 1}\n`,
    }),
    50,
  )
  for (const spec of commits) commitAt(cwd, spec)

  const shas = git(cwd, ['rev-list', '--reverse', 'main']).split('\n')
  const tagPlan: Array<{ name: string; index: number; annotated?: string }> = [
    { name: 'palette-start', index: 0 },
    { name: 'v0.1.0', index: 3, annotated: 'first printable card' },
    { name: 'warm-pass', index: 5 },
    { name: 'v0.2.0', index: 7, annotated: 'named by use' },
    { name: 'v0.3.0-rc.1', index: 9, annotated: 'pocket guide rc' },
    { name: 'v0.3.0', index: 11, annotated: 'linen shipping' },
  ]
  for (const tag of tagPlan) {
    const sha = shas[tag.index]
    if (!sha) continue
    if (tag.annotated) {
      git(cwd, ['tag', '-a', tag.name, sha, '-m', tag.annotated])
    } else {
      git(cwd, ['tag', tag.name, sha])
    }
  }
  return cwd
}

/**
 * Quiet linear history, bookmarked inactive.
 * Contrasts the busy graph cards and shows the Start/stopped state.
 */
function seedIdle(): string {
  const cwd = initRepo('demo-idle')
  const commits = linearCommits(
    [
      'chore: open a quiet drawer',
      'docs: label the folders',
      'feat: file last winter receipts',
      'feat: keep a stamp tin',
      'fix: straighten the paper stack',
      'docs: renew the address book',
      'chore: recycle old envelopes',
      'feat: note parcel tracking',
      'refactor: one box per year',
      'docs: rainy-day reading list',
      'chore: close the drawer',
    ],
    (i) => ({
      'README.md': '# demo-idle\n\nStopped-card screenshot fixture.\n',
      'drawer.txt': `item ${i + 1}\n`,
    }),
    60,
  )
  for (const spec of commits) commitAt(cwd, spec)
  return cwd
}

/** Topic branch as HEAD; otherwise tidy. */
function seedLighthouse(): string {
  const cwd = initRepo('demo-lighthouse')
  const commits = linearCommits(
    [
      'chore: claim the point',
      'feat: pour the foundation',
      'feat: raise the first storey',
      'docs: wind load notes',
      'feat: spiral stair draft',
      'fix: true the door frame',
      'feat: gallery rail',
      'refactor: simplify brick bond',
      'feat: lantern room glass',
      'docs: keepers handbook',
      'chore: paint trial stripe',
      'feat: fog bell hookup',
    ],
    (i) => ({
      'README.md': '# demo-lighthouse\n\nTopic-branch HEAD fixture.\n',
      'tower.txt': `height step ${i + 1}\n`,
    }),
    26,
  )
  for (const spec of commits) commitAt(cwd, spec)
  git(cwd, ['checkout', '-b', 'feature/fresnel-lens'])
  commitAt(cwd, {
    subject: 'feat: seat the fresnel lens',
    files: { 'lantern/lens.txt': 'order: 3rd\n' },
    daysAgo: 1,
  })
  git(cwd, ['tag', '-a', 'lens-fit', '-m', 'demo-lighthouse lens seated'])
  return cwd
}

/** Detached HEAD on an older tagged release. */
function seedAtlas(): string {
  const cwd = initRepo('demo-atlas')
  const commits = linearCommits(
    [
      'chore: unfold the first map',
      'feat: ink the coastline',
      'feat: mark mountain ranges',
      'docs: legend draft',
      'feat: river overlays',
      'fix: shift meridian label',
      'feat: city stamps',
      'refactor: shared grid',
      'feat: desert wash',
      'docs: binder tabs',
      'chore: trim margins',
      'feat: polar inset',
    ],
    (i) => ({
      'README.md': '# demo-atlas\n\nDetached HEAD screenshot fixture.\n',
      'maps/world.txt': `layer ${i + 1}\n`,
    }),
    38,
  )
  for (const spec of commits) commitAt(cwd, spec)
  const release = git(cwd, ['rev-list', '--max-count=1', '--skip=4', 'main'])
  git(cwd, ['tag', '-a', 'v1.1.0', release, '-m', 'demo-atlas coastline set'])
  git(cwd, ['tag', '-a', 'v1.2.0', 'main', '-m', 'demo-atlas polar inset'])
  git(cwd, ['checkout', '--detach', 'v1.1.0'])
  return cwd
}

const SEEDERS: Array<{
  name: string
  seed: () => string
  /** Bookmarked but not monitored — quieter card with Start. */
  active?: boolean
}> = [
  { name: 'demo-garden', seed: seedGarden },
  { name: 'demo-harbor', seed: seedHarbor },
  { name: 'demo-notes', seed: seedNotes },
  { name: 'demo-cookbook', seed: seedCookbook },
  { name: 'demo-widgets', seed: seedWidgets },
  { name: 'demo-palette', seed: seedPalette },
  { name: 'demo-idle', seed: seedIdle, active: false },
  { name: 'demo-lighthouse', seed: seedLighthouse },
  { name: 'demo-atlas', seed: seedAtlas },
]

function writeHistory(
  repos: Array<{ repoPath: string; active: boolean }>,
): void {
  const payload = { repos }
  writeFileSync(HISTORY_FILE, `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  })
}

function clean(): void {
  if (!existsSync(DEMO_ROOT)) {
    console.log(`nothing to clean at ${DEMO_ROOT}`)
    return
  }
  rmSync(DEMO_ROOT, { recursive: true, force: true })
  console.log(`removed ${DEMO_ROOT}`)
}

function printLaunchHint(): void {
  console.log('')
  console.log('Demo workspace (does not touch your real repos.json):')
  console.log(`  dg --stop`)
  console.log(
    `  DUMBGIT_HISTORY_FILE=${shellQuote(HISTORY_FILE)} dg`,
  )
  console.log('')
  console.log(`Repos: ${DEMO_ROOT}`)
  console.log(`History: ${HISTORY_FILE}`)
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function openDemoWorkspace(): void {
  const stop = spawnSync('bun', [path.join(import.meta.dir, '..', 'bin', 'dg.js'), '--stop'], {
    encoding: 'utf8',
  })
  if (stop.status !== 0) {
    console.warn((stop.stderr || stop.stdout || 'dg --stop failed').trim())
  }

  const dg = path.join(import.meta.dir, '..', 'bin', 'dg.js')
  const result = spawnSync('bun', [dg], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DUMBGIT_HISTORY_FILE: HISTORY_FILE,
    },
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    die('failed to open demo workspace')
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const open = args.includes('--open')
  const doClean = args.includes('--clean')
  const unknown = args.filter((a) => a !== '--open' && a !== '--clean')
  if (unknown.length) die(`unknown args: ${unknown.join(' ')}`)

  if (doClean && !open && args.length === 1) {
    clean()
    return
  }

  // Always rebuild from scratch so renamed fixtures (and bare remotes) do not linger.
  clean()
  mkdirSync(DEMO_ROOT, { recursive: true })
  console.log(`seeding ${SEEDERS.length} demo repos into ${DEMO_ROOT}`)

  const repos: Array<{ repoPath: string; active: boolean }> = []
  for (const { name, seed, active = true } of SEEDERS) {
    process.stdout.write(`  ${name}${active ? '' : ' (inactive)'} ... `)
    const repoPath = seed()
    const count = Number(git(repoPath, ['rev-list', '--count', '--all']))
    if (count < 10) die(`${name} only has ${count} commits`)
    repos.push({ repoPath: path.resolve(repoPath), active })
    console.log(`${count} commits`)
  }

  writeHistory(repos)
  printLaunchHint()

  if (open) openDemoWorkspace()
}

main()
