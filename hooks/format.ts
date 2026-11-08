import type { Hud, UsageWindow } from '../types'

export const EMPTY_HUD: Hud = {
  model: '',
  project: '',
  branch: '',
  changes: 0,
  contextPercent: null,
  contextTokens: null,
  contextWindow: null,
  costUsd: null,
  turnSeconds: null,
  tools: 0,
  todoDone: 0,
  todoTotal: 0,
  todoCurrent: '',
}

export const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'Weekly',
  spend_limit: 'Spend',
}

const ORDER = ['five_hour', 'seven_day', 'spend_limit']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000
const THOUSAND = 1000
const WARN_PERCENT = 50
const ALERT_PERCENT = 80

const rank = (kind: string): number => {
  const i = ORDER.indexOf(kind)
  return i === -1 ? ORDER.length : i
}

export const toWindows = (list: readonly UsageWindow[]): UsageWindow[] =>
  [...list]
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

export const used = (percent: number): number =>
  Math.min(100, Math.max(0, Math.round(percent)))

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

const formatClock = (d: Date): string => {
  const h = d.getHours()
  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

// Within a day: the time ("3:56 AM"); further out: the date ("Nov 15").
export const formatReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.getTime() - now < DAY_MS ? formatClock(d) : `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

export const colorFor = (percent: number): 'green' | 'yellow' | 'red' =>
  percent < WARN_PERCENT ? 'green' : percent < ALERT_PERCENT ? 'yellow' : 'red'

export const formatTokens = (n: number): string =>
  n >= THOUSAND ? `${Math.round(n / THOUSAND)}k` : `${n}`

export const formatSeconds = (s: number): string =>
  s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

export const baseName = (path: string): string =>
  path.split('/').filter(Boolean).pop() ?? path
