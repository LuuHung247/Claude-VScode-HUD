import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hud } from '../types'
import { readGit } from './git'
import { formatSpan, paceOf } from './pace'
import { buildStatus } from './rows'
import type { PaceItem, Row } from './rows'
import {
  EMPTY_HUD,
  LABELS,
  baseName,
  clean,
  colorFor,
  formatReset,
  toWindows,
  used,
} from './format'

const windows = atom({ plugin: 'vscode-hud', key: 'windows' } as const, [], {
  shape: 'windows-1',
})
const hud = atom({ plugin: 'vscode-hud', key: 'hud' } as const, EMPTY_HUD, {
  shape: 'hud-1',
})
const isStatusOpen = atom({ plugin: 'vscode-hud', key: 'isStatusOpen' } as const, false)

// Label column of the Status lines, in cells: a real column, so the values line
// up whatever font the host draws with.
const LABEL_COLUMNS = 10
// Each column needs this much room, in cells, or the two stack into one.
const COLUMN_MIN_COLUMNS = 34

const patchHud = ($: EngineInterface, patch: Partial<Hud>) =>
  update($, hud, current => ({ ...current, ...patch }))

const refreshStatic = async ($: EngineInterface, cwd: string) => {
  const git = await readGit($, cwd)
  let model = ''
  try {
    model = await $.session.model()
  } catch {
    model = ''
  }
  await patchHud($, { ...git, branch: clean(git.branch), model: clean(model), project: clean(baseName(cwd)) })
}

export const register: Register = (on, options) => {
  const isPaceOn = options.paceWarning !== false
  const warned = new Set<string>()
  let cwd = ''
  let turnStartedAt = 0
  let tools = 0

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    const result = await next(e)
    try {
      const usage = await $.session.usage()
      await update($, windows, () => toWindows(usage.rateLimits))
      await patchHud($, {
        contextPercent: usage.context.percent ?? null,
        contextTokens: usage.context.tokens ?? null,
        contextWindow: usage.context.window,
        costUsd: usage.cost?.usd ?? null,
      })
      await refreshStatic($, cwd)
    } catch (err) {
      $.ui.log(`vscode-hud: could not read usage: ${String(err)}`)
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => toWindows(e.rateLimits))
      if (isPaceOn) {
        const now = await $.clock.now()
        for (const w of e.rateLimits) {
          const pace = paceOf(w, now)
          const id = `${w.kind}@${w.resetsAt}`
          if (pace?.level === 'critical' && pace.hitsLimitInMs !== null && !warned.has(id)) {
            warned.add(id)
            $.ui.toast(
              `${LABELS[w.kind] ?? w.kind} usage: at this pace the limit is reached in ${formatSpan(pace.hitsLimitInMs)}, before it resets`,
            )
          }
        }
      }
    }
    if (e.changed.includes('context') || e.changed.includes('cost')) {
      await patchHud($, {
        contextPercent: e.context.percent ?? null,
        contextTokens: e.context.tokens ?? null,
        contextWindow: e.context.window,
        costUsd: e.cost?.usd ?? null,
      })
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    tools = 0
    await patchHud($, { tools: 0 })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    tools += 1
    await patchHud($, { tools })
    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const todos = e.todos
    const current = todos.find(t => t.status === 'in_progress')
    await patchHud($, {
      todoTotal: todos.length,
      todoDone: todos.filter(t => t.status === 'completed').length,
      todoCurrent: clean(current?.activeForm ?? ''),
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const seconds = Math.round(((await $.clock.now()) - turnStartedAt) / 1000)
      await patchHud($, { turnSeconds: seconds, tools })
      await refreshStatic($, cwd)
    } catch (err) {
      $.ui.log(`vscode-hud: could not refresh status: ${String(err)}`)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = await read($, windows)
    const info = await read($, hud)
    const open = await read($, isStatusOpen)
    const now = await $.clock.now()
    const { Box, Text, Button } = $.ui.resolve(e)

    const status = buildStatus(info, list, now, isPaceOn)
    const field = ([label, value]: Row) => (
      <Box flexDirection="row">
        <Box width={LABEL_COLUMNS}>
          <Text dimColor>{label}</Text>
        </Box>
        <Text>{value}</Text>
      </Box>
    )
    const paceColor = (level: PaceItem['level']) =>
      level === 'critical' ? 'error' : level === 'fast' ? 'warning' : undefined

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="row" gap={2} flexGrow={1}>
            {list.map(w => {
              const percent = used(w.percentUsed)
              const reset = formatReset(w.resetsAt, now)
              const pace = isPaceOn ? paceOf(w, now) : null
              return (
                <Text>
                  <Text bold>{LABELS[w.kind] ?? w.kind}</Text>
                  {' '}
                  <Text color={colorFor(percent)}>{`${percent}%`}</Text>
                  {reset && <Text dimColor>{` ${reset}`}</Text>}
                  {pace?.level === 'critical' && pace.hitsLimitInMs !== null && (
                    <Text color="error">{` runs out in ${formatSpan(pace.hitsLimitInMs)}`}</Text>
                  )}
                  {pace?.level === 'fast' && <Text color="warning">{' fast'}</Text>}
                </Text>
              )
            })}
          </Box>
          <Button key="status" hotkey="s" plain onPress={() => update($, isStatusOpen, v => !v)}>
            Status
          </Button>
        </Box>
        {open && (
          <Box flexDirection="column" marginTop={1}>
            <Box flexDirection="row" flexWrap="wrap">
              <Box flexDirection="column" flexGrow={1} minWidth={COLUMN_MIN_COLUMNS}>
                {status.left.map(field)}
              </Box>
              <Box flexDirection="column" flexGrow={1} minWidth={COLUMN_MIN_COLUMNS}>
                {status.right.map(field)}
              </Box>
            </Box>
            {status.pace.length > 0 && (
              <Box flexDirection="row" marginTop={1}>
                <Box width={LABEL_COLUMNS}>
                  <Text dimColor>Pace</Text>
                </Box>
                <Box flexDirection="row" gap={3}>
                  {status.pace.map(item => (
                    <Text>
                      <Text bold>{item.label}</Text>
                      {' '}
                      <Text color={paceColor(item.level)}>{item.text}</Text>
                    </Text>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
