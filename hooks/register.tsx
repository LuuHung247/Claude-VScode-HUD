import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { UsageWindow } from '../types'

const windows = atom({ plugin: 'usage-band', key: 'windows' } as const, [], {
  shape: 'windows-1',
})

const LABELS: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'Weekly',
  spend_limit: 'Spend',
}
const ORDER = ['five_hour', 'seven_day', 'spend_limit']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000

const toWindows = (list: readonly UsageWindow[]): UsageWindow[] =>
  [...list]
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => rank(a.kind) - rank(b.kind))

const rank = (kind: string): number => {
  const i = ORDER.indexOf(kind)
  return i === -1 ? ORDER.length : i
}

const remaining = (w: UsageWindow): number =>
  Math.max(0, Math.round(100 - w.percentUsed))

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`)

const formatClock = (d: Date): string => {
  const h = d.getHours()
  return `${h % 12 === 0 ? 12 : h % 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

// Within a day: the time ("3:56 AM"); further out: the date ("Nov 15").
const formatReset = (iso: string | undefined, now: number): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.getTime() - now < DAY_MS ? formatClock(d) : `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

const colorFor = (left: number): 'green' | 'yellow' | 'red' =>
  left > 50 ? 'green' : left > 20 ? 'yellow' : 'red'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      const usage = await $.session.usage()
      await update($, windows, () => toWindows(usage.rateLimits))
    } catch (err) {
      $.ui.log(`usage-band: could not read usage: ${String(err)}`)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => toWindows(e.rateLimits))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = await read($, windows)
    if (list.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    return (
      <Box flexDirection="row" gap={2}>
        {list.map(w => {
          const left = remaining(w)
          const reset = formatReset(w.resetsAt, now)
          return (
            <Text>
              <Text bold>{LABELS[w.kind] ?? w.kind}</Text>
              {' '}
              <Text color={colorFor(left)}>{`${left}%`}</Text>
              {reset && <Text dimColor>{` ${reset}`}</Text>}
            </Text>
          )
        })}
      </Box>
    )
  })
}
