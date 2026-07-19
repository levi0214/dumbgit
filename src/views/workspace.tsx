/** @jsxImportSource hono/jsx */
import os from 'node:os'
import path from 'node:path'
import type {
  CommitSummary,
  GraphRow,
  HeadInfo,
  WorkTreeChangeKind,
  WorkTreeEntry,
  WorkTreeSummary,
} from '../git'
import {
  GraphRows,
  graphLaneGutterCols,
  graphLaneLayout,
} from './graph'
import { DiffPanel, DiffPatchBody } from './diff'

export type WorkspaceRepoSnapshot =
  | {
      ok: true
      repoPath: string
      url?: string
      running: boolean
      isHost: boolean
      head: HeadInfo
      rows: GraphRow[]
      worktree: WorkTreeSummary
    }
  | {
      ok: false
      repoPath: string
      url?: string
      running: boolean
      isHost: boolean
      stderr: string
    }

function repoQuery(repoPath: string): string {
  return encodeURIComponent(repoPath)
}

export function workspaceRepoParentLabel(
  repoPath: string,
  homeDir = os.homedir(),
): string {
  const parent = path.dirname(path.resolve(repoPath))
  const relative = path.relative(homeDir, parent)
  const insideHome =
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  if (insideHome) {
    return relative ? `~/${relative.split(path.sep).join('/')}` : '~'
  }

  const parts = parent.split(path.sep).filter(Boolean)
  return `…/${parts.slice(-2).join('/')}`
}

export function workspaceSafeText(
  text: string,
  homeDir = os.homedir(),
): string {
  return text.split(homeDir).join('~')
}

export function workspaceSafeRepoText(
  text: string,
  repoPath: string,
): string {
  const repoLabel =
    `${workspaceRepoParentLabel(repoPath)}/${path.basename(repoPath)}`
  return workspaceSafeText(text.split(repoPath).join(repoLabel))
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

function WorkspaceRepoName(props: {
  repoPath: string
  repoUrl?: string
}) {
  const name = path.basename(props.repoPath)
  return props.repoUrl ? (
    <a
      class="workspace-repo-name"
      href={props.repoUrl}
      title={`Open ${name}`}
    >
      {name}
    </a>
  ) : (
    <span class="workspace-repo-name" title={name}>
      {name}
    </span>
  )
}

function WorkspaceCardActions(props: {
  repoPath: string
  repoUrl?: string
  running: boolean
  isHost: boolean
  limit: number
}) {
  const name = path.basename(props.repoPath)
  const controlUrl =
    `/workspace/repo/${props.running ? 'stop' : 'start'}` +
    `?repo=${repoQuery(props.repoPath)}&limit=${props.limit}`
  return (
    <div class="workspace-card-actions">
      <button
        type="button"
        class="workspace-drag-handle"
        draggable="true"
        title={`Drag ${name} to reorder`}
        aria-label={`Drag ${name} to reorder`}
      >
        ⠿
      </button>
      <button
        type="button"
        class={`workspace-instance-toggle${props.running ? '' : ' is-start'}`}
        disabled={props.isHost}
        title={
          props.isHost
            ? 'This repository is hosting the current Workspace'
            : `${props.running ? 'Stop monitoring' : 'Start monitoring'} ${name}`
        }
        hx-post={controlUrl}
        hx-target="#workspace-board"
        hx-swap="outerHTML"
        hx-disabled-elt="this"
      >
        {props.running ? 'Stop' : 'Start'}
      </button>
      {props.repoUrl ? (
        <a
          class="workspace-open-repo"
          href={props.repoUrl}
          title="Open full repository view"
          aria-label={`Open ${name}`}
        >
          ↗
        </a>
      ) : null}
    </div>
  )
}

function WorkspaceDepthToggle(props: { limit: number }) {
  const expanded = props.limit === 10
  const nextLimit = expanded ? 5 : 10
  const label = expanded
    ? 'Show 5 commits in all repositories'
    : 'Show 10 commits in all repositories'

  return (
    <button
      type="button"
      class="workspace-depth-toggle"
      aria-controls="workspace-board"
      aria-expanded={expanded ? 'true' : 'false'}
      aria-label={label}
      title={label}
      hx-get={`/fragment/workspace?limit=${nextLimit}`}
      hx-target="#workspace-board"
      hx-swap="outerHTML"
      hx-push-url={`/?limit=${nextLimit}`}
      hx-disabled-elt="this"
    >
      <svg
        class="workspace-depth-chevron"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={expanded ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
      </svg>
    </button>
  )
}

function WorkspaceRepoCard(props: {
  repo: WorkspaceRepoSnapshot
  currentRepo: string
  limit: number
}) {
  if (!props.repo.ok) {
    const repoUrl =
      props.repo.repoPath === props.currentRepo ? '/' : props.repo.url
    const parentLabel = workspaceRepoParentLabel(props.repo.repoPath)
    return (
      <article
        class={`workspace-repo-card workspace-repo-error${props.repo.running ? '' : ' workspace-repo-stopped'}`}
        data-workspace-repo={props.repo.repoPath}
      >
        <div class="workspace-card-head">
          <div>
            <WorkspaceRepoName
              repoPath={props.repo.repoPath}
              repoUrl={repoUrl}
            />
            <div class="workspace-repo-path" title={parentLabel}>
              {parentLabel}
            </div>
          </div>
          <WorkspaceCardActions
            repoPath={props.repo.repoPath}
            repoUrl={repoUrl}
            running={props.repo.running}
            isHost={props.repo.isHost}
            limit={props.limit}
          />
        </div>
        <pre>
          {workspaceSafeRepoText(props.repo.stderr, props.repo.repoPath)}
        </pre>
        <WorkspaceDepthToggle limit={props.limit} />
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
  const parentLabel = workspaceRepoParentLabel(repo.repoPath)
  const worktreeUrl = `/workspace/worktree?repo=${repoQuery(repo.repoPath)}`

  return (
    <article
      class={`workspace-repo-card${repo.running ? '' : ' workspace-repo-stopped'}`}
      data-workspace-repo={repo.repoPath}
    >
      <div class="workspace-card-head">
        <div class="workspace-repo-identity">
          <WorkspaceRepoName repoPath={repo.repoPath} repoUrl={repoUrl} />
          <span class="workspace-branch" title={branch}>
            {branch}
          </span>
          <div class="workspace-repo-path" title={parentLabel}>
            {parentLabel}
          </div>
        </div>
        <WorkspaceCardActions
          repoPath={repo.repoPath}
          repoUrl={repoUrl}
          running={repo.running}
          isHost={repo.isHost}
          limit={props.limit}
        />
      </div>

      <button
        type="button"
        class={`workspace-worktree-summary${dirty ? ' workspace-worktree-dirty' : ''}`}
        data-workspace-select="worktree"
        data-repo={repo.repoPath}
        hx-get={worktreeUrl}
        hx-target="#workspace-inspector"
        hx-swap="outerHTML"
      >
        <span class="workspace-worktree-indicator" aria-hidden="true"></span>
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

      <div class="workspace-timeline">
        <div class={`log-lines${repo.rows.length === 0 ? ' empty' : ''}`}>
          {repo.rows.length > 0 ? (
            <GraphRows
              rows={repo.rows}
              detached={repo.head.kind === 'detached'}
              currentBranch={
                repo.head.kind === 'branch' ? repo.head.name : null
              }
              stashes={[]}
              laneLayoutByRow={laneLayout.rows}
              gutterCols={gutterCols}
              readonly
              workspaceRepoPath={repo.repoPath}
              diffTarget="#workspace-inspector"
              diffUrlForSha={(sha) =>
                `/workspace/commit?repo=${repoQuery(repo.repoPath)}` +
                `&sha=${encodeURIComponent(sha)}`
              }
            />
          ) : (
            '(no commits yet)'
          )}
        </div>
      </div>
      <WorkspaceDepthToggle limit={props.limit} />
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
          {props.currentRepo ? (
            <a class="workspace-back" href="/" title="Back to repository view">
              ←
            </a>
          ) : null}
          <div>
            <h1>Workspace</h1>
            <p>
              {props.repos.length}{' '}
              {props.repos.length === 1 ? 'repository' : 'repositories'}
              {' · '}
              {props.repos.filter((repo) => repo.running).length} active
            </p>
          </div>
        </div>
        <div class="workspace-toolbar-actions">
          <a class="workspace-refresh" href={`/?limit=${props.limit}`}>
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
  controlError?: string
}) {
  return (
    <section
      id="workspace-board"
      class="workspace-board"
      aria-label="Repositories"
      data-workspace-limit={String(props.limit)}
    >
      {props.controlError ? (
        <div class="workspace-control-error">
          {workspaceSafeText(props.controlError)}
        </div>
      ) : null}
      {props.repos.map((repo) => (
        <WorkspaceRepoCard
          key={repo.repoPath}
          repo={repo}
          currentRepo={props.currentRepo}
          limit={props.limit}
        />
      ))}
    </section>
  )
}

export function WorkspaceInspectorEmpty() {
  return (
    <section
      id="workspace-inspector"
      class="workspace-inspector"
      hidden
    ></section>
  )
}

function WorkspaceInspectorContext(props: {
  name: string
  detail: string
}) {
  return (
    <div class="workspace-inspector-context">
      <span class="workspace-inspector-label">Diff</span>
      <strong>{props.name}</strong>
      <span>{props.detail}</span>
      <button
        type="button"
        class="workspace-inspector-close"
        title="Close inspector (Esc)"
        aria-label="Close inspector"
      >
        <span>Close</span>
        <kbd>Esc</kbd>
      </button>
    </div>
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
        <WorkspaceInspectorContext
          name={name}
          detail={props.sha.slice(0, 7)}
        />
        <DiffPanel
          state="error"
          sha={props.sha}
          stderr={workspaceSafeRepoText(
            props.summary.stderr,
            props.repoPath,
          )}
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
      <WorkspaceInspectorContext
        name={name}
        detail={`commit · ${props.sha.slice(0, 7)}`}
      />
      <DiffPanel
        state="summary"
        sha={props.sha}
        summary={props.summary.value}
        fileUrlBase={
          `/workspace/commit/file?repo=${repoQuery(props.repoPath)}` +
          `&sha=${encodeURIComponent(props.sha)}`
        }
        patchPlaceholder="Select a file to view its diff"
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
      <WorkspaceInspectorContext name={name} detail="working tree" />
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
        <div id="diff-patch-slot" class="diff-patch-slot">
          <div class="diff-patch-placeholder">
            {entries.length > 0
              ? 'Select a file to view its diff'
              : 'No local changes to inspect'}
          </div>
        </div>
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
