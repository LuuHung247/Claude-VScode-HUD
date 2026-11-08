import type { UsageWindow } from '../types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * HOUR_MS,
  seven_day: 7 * DAY_MS,
}
// Below these the rate is too noisy to judge.
const MIN_ELAPSED = 0.05
const MIN_USED_PERCENT = 5
// Used share this far ahead of the clock counts as fast.
const FAST_RATIO = 1.25
const MINUTE_MS = 60 * 1000

export type Pace = {
  level: 'ok' | 'fast' | 'critical'
  // Time until the window is full at the current rate; null when not known.
  hitsLimitInMs: number | null
  resetsInMs: number
}

// How fast a window is being used against how much of it has passed. Pure:
// `critical` means the limit is reached before the window resets.
export const paceOf = (w: UsageWindow, now: number): Pace | null => {
  const length = WINDOW_MS[w.kind]
  if (length === undefined || !w.resetsAt) return null
  const resetsInMs = Date.parse(w.resetsAt) - now
  if (Number.isNaN(resetsInMs) || resetsInMs <= 0 || resetsInMs > length) return null
  const elapsedMs = length - resetsInMs
  if (elapsedMs / length < MIN_ELAPSED) return null
  if (w.percentUsed < MIN_USED_PERCENT) {
    return { level: 'ok', hitsLimitInMs: null, resetsInMs }
  }
  const hitsLimitInMs = ((100 - w.percentUsed) * elapsedMs) / w.percentUsed
  if (hitsLimitInMs < resetsInMs) return { level: 'critical', hitsLimitInMs, resetsInMs }
  const isAhead = w.percentUsed > (elapsedMs / length) * 100 * FAST_RATIO
  return { level: isAhead ? 'fast' : 'ok', hitsLimitInMs, resetsInMs }
}

export const formatSpan = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}
