export type UsageWindow = { kind: string; percentUsed: number; resetsAt?: string }

export type Hud = {
  model: string
  project: string
  branch: string
  changes: number
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number | null
  costUsd: number | null
  turnSeconds: number | null
  tools: number
  todoDone: number
  todoTotal: number
  todoCurrent: string
}

declare module 'claude-code' {
  interface PluginState {
    'vscode-hud': {
      windows: Shaped<UsageWindow[]>
      hud: Shaped<Hud>
      isStatusOpen: boolean
    }
  }
}
