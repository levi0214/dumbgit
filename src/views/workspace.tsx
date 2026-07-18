/** @jsxImportSource hono/jsx */
import path from 'node:path'
import { decorationTokens } from '../decorations'
import type {
  CommitSummary,
  GraphCommitRow,
  GraphRow,
  HeadInfo,
  WorkTreeChangeKind,
  WorkTreeEntry,
  WorkTreeSummary,
} from '../git'
import {
  GraphLaneSpans,
  graphCommitIsHead,
  graphLaneGutterCols,
  graphLaneLayout,
  relTimeAgo,
} from './graph'
import { DiffPanel, DiffPatchBody } from './diff'

export type WorkspaceRepoSnapshot =
  | {
      ok: true
      repoPath: string
      url: string
      head: HeadInfo
      rows: GraphRow[]
      worktree: WorkTreeSummary
    }
  | {
      ok: false
      repoPath: string
      url: string
      stderr: string
    }

function repoQuery(repoPath: string): string {
  return encodeURIComponent(repoPath)
}

function worktreeEntries(worktree: WorkTreeSummary): Array<{
  kind: WorkTreeChangeKind
  entry: WorkTreeEntry
}> {
  return [
    ...worktree.staged.map((entry) => ({ kind: 'staged' as const, entry })),
    ...worktree.unstaged.map((entry) => ({
      kind: 'unstaged' as const,
      entry,
    })),
    ...worktree.untracked.map((entry) => ({
      kind: 'untracked' as const,
      entry,
    })),
  ]
}

function changeTotals(worktree: WorkTreeSummary): {
  files: number
  added: number
  deleted: number
} {
  const paths = new Set<string>()
  let added = 0
  let deleted = 0
  for (const { entry } of worktreeEntries(worktree)) {
    paths.add(entry.path)
    added += entry.added ?? 0
    deleted += entry.deleted ?? 0
  }
  return { files: paths.size, added, deleted }
}

function compactRefs(row: GraphCommitRow): string[] {
  const tokens = decorationTokens(row.decorateRaw)
  const locals = tokens.filter((token) => token.kind === 'local')
  const remotes = tokens.filter(
    (token) => token.kind === 'remote' && !token.name.endsWith('/HEAD'),
  )
  const tags = tokens.filter((token) => token.kind === 'tag')
  const usedRemote = new Set<string>()
  const refs: string[] = []

  for (const local of locals) {
    const peer = remotes.find((remote) =>
      remote.name.endsWith(`/${local.name}`),
    )
    if (peer) {
      usedRemote.add(peer.name)
      refs.push(`${local.name} | ${peer.name.split('/')[0]}`)
    } else {
      refs.push(local.name)
    }
  }
  for (const remote of remotes) {
    if (!usedRemote.has(remote.name)) refs.push(remote.name)
  }
  for (const tag of tags) refs.push(`#${tag.name}`)
  return refs
}

function WorkspaceRail(props: {
  gutterCols: number
  dirty: boolean
}) {
  const width = props.gutterCols * 8
  const height = 30
  const x = 4
  const mid = height / 2
  return (
    <svg
      class="workspace-rail-svg"
      viewBox={`0 0 ${width} ${height}`}
      style={`width:${width}px;height:${height}px`}
      aria-hidden="true"
      focusable="false"
    >
      <line
        x1={x}
        y1={mid}
        x2={x}
        y2={height + 4}
        stroke={props.dirty ? 'var(--accent)' : 'var(--graph-rail-muted)'}
        stroke-width="1.8"
        stroke-linecap="round"
      />
      {props.dirty ? (
        <rect
          x={x - 3.5}
          y={mid - 3.5}
          width="7"
          height="7"
          rx="1.2"
          transform={`rotate(45 ${x} ${mid})`}
          fill="var(--accent)"
        />
      ) : (
        <circle
          cx={x}
          cy={mid}
          r="3.2"
          fill="var(--bg)"
          stroke="var(--graph-rail-muted)"
          stroke-width="1.6"
        />
      )}
    </svg>
  )
}

function WorkspaceCommit(props: {
  repoPath: string
  row: GraphCommitRow
  layout: ReturnType<typeof graphLaneLayout>['rows'][number]
  gutterCols: number
  detached: boolean
}) {
  const refs = compactRefs(props.row)
  const visibleRefs = refs.slice(0, 2)
  const hiddenRefs = Math.max(0, refs.length - visibleRefs.length)
  const isHead = graphCommitIsHead(props.row.decorateRaw)
  const url =
    `/workspace/commit?repo=${repoQuery(props.repoPath)}` +
    `&sha=${encodeURIComponent(props.row.shaFull)}`

  return (
    <button
      type="button"
      class={`workspace-timeline-row workspace-commit-row${isHead ? ' workspace-head-row' : ''}${props.row.inHistory ? '' : ' workspace-unreachable-row'}`}
      data-workspace-select="commit"
      data-repo={props.repoPath}
      data-sha={props.row.shaFull}
      title={`${props.row.subject}\n${props.row.author} · ${props.row.date}`}
      hx-get={url}
      hx-target="#workspace-inspector"
      hx-swap="outerHTML"
    >
      <span class="workspace-graph-prefix">
        <GraphLaneSpans
          layout={props.layout}
          gutterCols={props.gutterCols}
          isHead={isHead}
          isDetached={isHead && props.detached}
          rowHeight={30}
        />
      </span>
      <span class="workspace-commit-content">
        <span class="workspace-commit-topline">
          <span class="workspace-commit-subject">{props.row.subject}</span>
          <span class="workspace-commit-age">{relTimeAgo(props.row.date)}</span>
        </span>
        <span class="workspace-commit-meta">
          {visibleRefs.map((ref) => (
            <span class="workspace-ref-pill" title={ref}>
              {ref}
            </span>
          ))}
          {hiddenRefs > 0 ? (
            <span class="workspace-ref-more">+{hiddenRefs}</span>
          ) : null}
          <code class="workspace-commit-sha">{props.row.shaShort}</code>
        </span>
      </span>
    </button>
  )
}

function WorkspaceRepoCard(props: {
  repo: WorkspaceRepoSnapshot
  currentRepo: string
}) {
  if (!props.repo.ok) {
    return (
      <article class="workspace-repo-card workspace-repo-error">
        <div class="workspace-card-head">
          <div>
            <div class="workspace-repo-name">
              {path.basename(props.repo.repoPath)}
            </div>
            <div class="workspace-repo-path">{props.repo.repoPath}</div>
          </div>
        </div>
        <pre>{props.repo.stderr}</pre>
      </article>
    )
  }

  const { repo } = props
  const laneLayout = graphLaneLayout(repo.rows)
  const gutterCols = graphLaneGutterCols(laneLayout.laneCount)
  const totals = changeTotals(repo.worktree)
  const dirty = totals.files > 0
  const branch =
    repo.head.kind === 'branch'
      ? repo.head.name
      : `detached · ${repo.head.sha.slice(0, 7)}`
  const repoUrl =
    repo.repoPath === props.currentRepo ? '/' : repo.url
  const worktreeUrl = `/workspace/worktree?repo=${repoQuery(repo.repoPath)}`

  return (
    <article
      class="workspace-repo-card"
      data-workspace-repo={repo.repoPath}
    >
      <div class="workspace-card-head">
        <div class="workspace-repo-identity">
          <a
            class="workspace-repo-name"
            href={repoUrl}
            title={`Open full repository view · ${repo.repoPath}`}
          >
            {path.basename(repo.repoPath)}
          </a>
          <span class="workspace-branch" title={branch}>
            {branch}
          </span>
          <div class="workspace-repo-path" title={repo.repoPath}>
            {path.dirname(repo.repoPath)}
          </div>
        </div>
        <a
          class="workspace-open-repo"
          href={repoUrl}
          title="Open full repository view"
          aria-label={`Open ${path.basename(repo.repoPath)}`}
        >
          ↗
        </a>
      </div>

      <div class="workspace-timeline">
        <button
          type="button"
          class={`workspace-timeline-row workspace-worktree-row${dirty ? ' workspace-worktree-dirty' : ''}`}
          data-workspace-select="worktree"
          data-repo={repo.repoPath}
          hx-get={worktreeUrl}
          hx-target="#workspace-inspector"
          hx-swap="outerHTML"
        >
          <span class="workspace-graph-prefix">
            <WorkspaceRail gutterCols={gutterCols} dirty={dirty} />
          </span>
          <span class="workspace-worktree-label">
            <span>{dirty ? 'Uncommitted changes' : 'Working tree clean'}</span>
            {dirty ? (
              <span class="workspace-worktree-stats">
                {totals.files} files
                {totals.added > 0 ? (
                  <span class="file-num-add"> +{totals.added}</span>
                ) : null}
                {totals.deleted > 0 ? (
                  <span class="file-num-del"> −{totals.deleted}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        </button>

        {repo.rows.length > 0 ? (
          repo.rows.map((item, index) => (
            <WorkspaceCommit
              key={item.row.shaFull}
              repoPath={repo.repoPath}
              row={item.row}
              layout={laneLayout.rows[index]!}
              gutterCols={gutterCols}
              detached={repo.head.kind === 'detached'}
            />
          ))
        ) : (
          <div class="workspace-no-commits">(no commits yet)</div>
        )}
      </div>
    </article>
  )
}

export function WorkspaceView(props: {
  repos: WorkspaceRepoSnapshot[]
  currentRepo: string
  limit: number
}) {
  return (
    <main class="workspace-page">
      <header class="workspace-toolbar">
        <div class="workspace-title-block">
          <a class="workspace-back" href="/" title="Back to repository view">
            ←
          </a>
          <div>
            <h1>Workspace</h1>
            <p>
              {props.repos.length}{' '}
              {props.repos.length === 1 ? 'repository' : 'repositories'}
            </p>
          </div>
        </div>
        <div class="workspace-toolbar-actions">
          <nav class="workspace-depth" aria-label="Commit depth">
            <a
              href="/workspace?limit=5"
              class={props.limit === 5 ? 'is-active' : ''}
              aria-current={props.limit === 5 ? 'page' : undefined}
            >
              5
            </a>
            <a
              href="/workspace?limit=10"
              class={props.limit === 10 ? 'is-active' : ''}
              aria-current={props.limit === 10 ? 'page' : undefined}
            >
              10
            </a>
          </nav>
          <a class="workspace-refresh" href={`/workspace?limit=${props.limit}`}>
            Refresh
          </a>
        </div>
      </header>

      <WorkspaceBoard {...props} />

      <WorkspaceInspectorEmpty />
    </main>
  )
}

export function WorkspaceBoard(props: {
  repos: WorkspaceRepoSnapshot[]
  currentRepo: string
  limit: number
}) {
  return (
    <section
      id="workspace-board"
      class="workspace-board"
      aria-label="Repositories"
      data-workspace-limit={String(props.limit)}
    >
      {props.repos.map((repo) => (
        <WorkspaceRepoCard
          key={repo.repoPath}
          repo={repo}
          currentRepo={props.currentRepo}
        />
      ))}
    </section>
  )
}

export function WorkspaceInspectorEmpty() {
  return (
    <section
      id="workspace-inspector"
      class="workspace-inspector workspace-inspector-empty"
    >
      <div class="workspace-inspector-empty-mark">⌁</div>
      <div>
        <strong>Shared inspector</strong>
        <span>Select a working tree or commit from any repository.</span>
      </div>
    </section>
  )
}

export function WorkspaceCommitInspector(props: {
  repoPath: string
  sha: string
  summary:
    | { ok: true; value: CommitSummary }
    | { ok: false; stderr: string }
}) {
  const name = path.basename(props.repoPath)
  if (!props.summary.ok) {
    return (
      <section id="workspace-inspector" class="workspace-inspector">
        <div class="workspace-inspector-context">
          <strong>{name}</strong>
          <span>{props.sha.slice(0, 7)}</span>
        </div>
        <DiffPanel
          state="error"
          sha={props.sha}
          stderr={props.summary.stderr}
        />
      </section>
    )
  }

  return (
    <section
      id="workspace-inspector"
      class="workspace-inspector"
      data-workspace-repo={props.repoPath}
      data-workspace-sha={props.sha}
    >
      <div class="workspace-inspector-context">
        <strong>{name}</strong>
        <span>commit · {props.sha.slice(0, 7)}</span>
      </div>
      <DiffPanel
        state="summary"
        sha={props.sha}
        summary={props.summary.value}
        fileUrlBase={
          `/workspace/commit/file?repo=${repoQuery(props.repoPath)}` +
          `&sha=${encodeURIComponent(props.sha)}`
        }
      />
    </section>
  )
}

function WorkspaceFileNums(props: {
  file: {
    added?: number
    deleted?: number
    binary?: boolean
  }
}) {
  if (props.file.binary) {
    return <span class="file-num file-num-binary">binary</span>
  }
  if (
    props.file.added === undefined &&
    props.file.deleted === undefined
  ) {
    return null
  }
  return (
    <span class="file-num">
      <span class="file-num-add">+{props.file.added ?? 0}</span>
      <span class="file-num-del"> −{props.file.deleted ?? 0}</span>
    </span>
  )
}

export function WorkspaceWorktreeInspector(props: {
  repoPath: string
  worktree: WorkTreeSummary
}) {
  const entries = worktreeEntries(props.worktree)
  const name = path.basename(props.repoPath)
  return (
    <section
      id="workspace-inspector"
      class="workspace-inspector"
      data-workspace-repo={props.repoPath}
      data-workspace-kind="worktree"
    >
      <div class="workspace-inspector-context">
        <strong>{name}</strong>
        <span>working tree</span>
      </div>
      <div class="diff-panel diff-summary workspace-worktree-inspector">
        <div class="diff-head">
          <div class="diff-subject">
            {entries.length > 0
              ? `${entries.length} changed ${entries.length === 1 ? 'entry' : 'entries'}`
              : 'Working tree clean'}
          </div>
          <div class="diff-meta">
            staged · unstaged · untracked
          </div>
        </div>
        <div class="diff-files-block">
          {entries.length > 0 ? (
            <ul class="diff-files">
              {entries.map(({ kind, entry }) => {
                const fileUrl =
                  `/workspace/worktree/file?repo=${repoQuery(props.repoPath)}` +
                  `&kind=${kind}&path=${encodeURIComponent(entry.path)}`
                return (
                  <li>
                    <button
                      type="button"
                      class="diff-file-btn"
                      title={`${kind} · ${entry.path}`}
                      hx-get={fileUrl}
                      hx-target="#diff-patch-slot"
                      hx-swap="innerHTML"
                    >
                      <span class={`file-status file-${entry.mark[0] ?? '_'}`}>
                        {entry.mark}
                      </span>
                      <span class="workspace-file-kind">{kind}</span>
                      <span class="file-path">{entry.path}</span>
                      <WorkspaceFileNums file={entry} />
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div class="diff-files-empty">(no local changes)</div>
          )}
        </div>
        <div id="diff-patch-slot" class="diff-patch-slot"></div>
      </div>
    </section>
  )
}

export function WorkspacePatch(props: { patch: string }) {
  if (!props.patch.trim()) {
    return <pre class="diff-body diff-patch-empty">(no diff)</pre>
  }
  return <DiffPatchBody text={props.patch} compact />
}
