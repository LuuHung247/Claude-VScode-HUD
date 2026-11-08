import type { Hud, UsageWindow } from '../types'
import { LABELS, formatSeconds, formatTokens } from './format'
import { formatSpan, paceOf } from './pace'

export type Row = readonly [label: string, value: string]
export type PaceItem = { label: string; text: string; level: 'ok' | 'fast' | 'critical' }
export type StatusModel = {
  left: Row[]
  right: Row[]
  pace: PaceItem[]
  // The Pace row appears only when a window needs attention.
  hasPaceWarning: boolean
}

const hasValue = ([, value]: Row): boolean => value !== ''

const contextText = (info: Hud): string => {
  if (info.contextPercent === null) return ''
  const sizes =
    info.contextTokens !== null && info.contextWindow !== null
      ? ` (${formatTokens(info.contextTokens)}/${formatTokens(info.contextWindow)})`
      : ''
  return `${info.contextPercent}%${sizes}`
}

const paceText = (item: NonNullable<ReturnType<typeof paceOf>>): string => {
  if (item.level === 'critical' && item.hitsLimitInMs !== null) {
    return `limit in ${formatSpan(item.hitsLimitInMs)}, resets in ${formatSpan(item.resetsInMs)}`
  }
  return item.level === 'fast' ? 'ahead of the clock' : 'on track'
}

// What the Status lines show, as plain rows: two columns of facts and the pace
// of each window. Empty values are dropped so a line never reads as a blank.
export const buildStatus = (
  info: Hud,
  windows: readonly UsageWindow[],
  now: number,
  isPaceOn: boolean,
): StatusModel => {
  const branch = info.branch
    ? `${info.branch}${info.changes > 0 ? ` +${info.changes}` : ''}`
    : ''
  const todos =
    info.todoTotal > 0
      ? `${info.todoDone}/${info.todoTotal}${info.todoCurrent ? ` ${info.todoCurrent}` : ''}`
      : ''
  const lastTurn =
    info.turnSeconds === null
      ? ''
      : `${formatSeconds(info.turnSeconds)}, ${info.tools} tool calls`
  const left: Row[] = [
    ['Model', info.model],
    ['Project', info.project],
    ['Branch', branch],
    ['Todos', todos],
  ]
  const right: Row[] = [
    ['Context', contextText(info)],
    ['Cost', info.costUsd === null ? '' : `$${info.costUsd.toFixed(2)}`],
    ['Last turn', lastTurn],
  ]
  const pace: PaceItem[] = isPaceOn
    ? windows.flatMap(w => {
        const item = paceOf(w, now)
        return item === null
          ? []
          : [{ label: LABELS[w.kind] ?? w.kind, text: paceText(item), level: item.level }]
      })
    : []
  return {
    left: left.filter(hasValue),
    right: right.filter(hasValue),
    pace,
    hasPaceWarning: pace.some(item => item.level !== 'ok'),
  }
}
