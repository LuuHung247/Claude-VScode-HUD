import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Hud } from '../types'
import { readGit } from './git'
import { formatSpan, paceOf } from './pace'
import {
  EMPTY_HUD,
  LABELS,
  baseName,
  clean,
  colorFor,
  formatReset,
  formatSeconds,
  formatTokens,
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

    const context =
      info.contextPercent === null
        ? null
        : `${info.contextPercent}%` +
          (info.contextTokens !== null && info.contextWindow !== null
            ? ` (${formatTokens(info.contextTokens)}/${formatTokens(info.contextWindow)})`
            : '')
    const git = info.branch ? `${info.branch}${info.changes > 0 ? ` +${info.changes}` : ''}` : ''
    const lastTurn =
      info.turnSeconds === null
        ? ''
        : `${formatSeconds(info.turnSeconds)}, ${info.tools} tool calls`
    const todo = info.todoTotal > 0
      ? `${info.todoDone}/${info.todoTotal}${info.todoCurrent ? ` ${info.todoCurrent}` : ''}`
      : ''
    const paceRows: Array<readonly [string, string]> = isPaceOn
      ? list.flatMap(w => {
          const pace = paceOf(w, now)
          if (pace === null) return []
          const text =
            pace.level === 'critical' && pace.hitsLimitInMs !== null
              ? `limit in ${formatSpan(pace.hitsLimitInMs)}, resets in ${formatSpan(pace.resetsInMs)}`
              : pace.level === 'fast'
                ? 'ahead of the clock, but should last until the reset'
                : 'on track'
          return [[`${LABELS[w.kind] ?? w.kind} pace`, text] as const]
        })
      : []
    const rows: ReadonlyArray<readonly [string, string]> = [
      ...paceRows,
      ['Model', info.model],
      ['Project', info.project],
      ['Branch', git],
      ['Context', context ?? ''],
      ['Cost', info.costUsd === null ? '' : `$${info.costUsd.toFixed(2)}`],
      ['Last turn', lastTurn],
      ['Todos', todo],
    ]

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
        {open &&
          rows
            .filter(([, value]) => value !== '')
            .map(([label, value]) => (
              <Text>
                <Text dimColor>{label.padEnd(12)}</Text>
                {value}
              </Text>
            ))}
      </Box>
    )
  })
}
