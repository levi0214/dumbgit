import { spawnSync } from 'node:child_process'

export type OpenLocalResult =
  | { ok: true }
  | { ok: false; stderr: string }

/** macOS `open` argv for a worktree file. Override with DUMBGIT_EDITOR (app name). */
export function editorOpenArgs(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const app = env.DUMBGIT_EDITOR?.trim()
  return app ? ['open', '-a', app, filePath] : ['open', filePath]
}

/** macOS `open` argv for a repo directory. Override with DUMBGIT_TERMINAL (app name). */
export function terminalOpenArgs(
  dirPath: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const app = env.DUMBGIT_TERMINAL?.trim() || 'Terminal'
  return ['open', '-a', app, dirPath]
}

function runOpen(argv: string[]): OpenLocalResult {
  const [cmd, ...args] = argv
  const result = spawnSync(cmd, args, { encoding: 'utf8' })
  if (result.status === 0) return { ok: true }
  const stderr = String(result.stderr ?? '').trim()
  return {
    ok: false,
    stderr: stderr || `open failed (${result.status ?? 'unknown'})`,
  }
}

export function openInEditor(filePath: string): OpenLocalResult {
  return runOpen(editorOpenArgs(filePath))
}

export function openInTerminal(dirPath: string): OpenLocalResult {
  return runOpen(terminalOpenArgs(dirPath))
}
