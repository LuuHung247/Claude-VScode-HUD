import type { EngineInterface } from 'claude-code'

export type GitInfo = { branch: string; changes: number }

const NO_GIT: GitInfo = { branch: '', changes: 0 }
const GIT_TIMEOUT_MS = 3000

// Read-only git calls; any failure (not a repo, git missing) reads as no info.
export async function readGit($: EngineInterface, cwd: string): Promise<GitInfo> {
  try {
    const init = { cwd, timeoutMs: GIT_TIMEOUT_MS }
    const head = await $.process.run(['git', 'branch', '--show-current'], init)
    if (head.exitCode !== 0) return NO_GIT
    const status = await $.process.run(['git', 'status', '--porcelain'], init)
    const changes =
      status.exitCode === 0 ? status.stdout.split('\n').filter(Boolean).length : 0
    return { branch: head.stdout.trim() || 'detached', changes }
  } catch {
    return NO_GIT
  }
}
