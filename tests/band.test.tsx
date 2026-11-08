import type { SessionRateLimit } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'vscode-hud',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

type TestBody = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<TestBody>[1]

const seed = (on: On, rateLimits?: SessionRateLimit[]) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-08T12:00:00Z') }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[1] === 'status' ? ' M a.ts\n?? b.ts\n' : 'main\n',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, tokens: 84000, percent: 42 },
      cost: { usd: 1.234 },
      rateLimits: rateLimits ?? [
        { kind: 'seven_day', percentUsed: 0 },
        { kind: 'five_hour', percentUsed: 3.2 },
      ],
    },
  }))
}

for (const surface of ['terminal', 'vscode'] as const) {
  test(`the usage row is unchanged on ${surface}`, async ($, on) => {
    seed(on)
    await $.session.start({ cwd: '/work/demo', surface, isInteractive: true })

    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /^5h$/ }))?.text).toBe('5h')
    expect((await ui.find({ type: 'Text', text: /^3%$/ }))?.text).toBe('3%')
    expect((await ui.find({ type: 'Text', text: /^Weekly$/ }))?.text).toBe('Weekly')
    expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.text).toBe('0%')
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    await ui.unmount()
  })

  test(`the Status button shows the details on ${surface}`, async ($, on) => {
    seed(on)
    await $.session.start({ cwd: '/work/demo', surface, isInteractive: true })

    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'status' })

    expect((await ui.find({ type: 'Text', text: /Model/ }))?.text).toContain('claude-sonnet-5-5')
    expect((await ui.find({ type: 'Text', text: /Branch/ }))?.text).toContain('main +2')
    expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toContain('42% (84k/200k)')
    expect((await ui.find({ type: 'Text', text: /Cost/ }))?.text).toContain('$1.23')
    expect((await ui.find({ type: 'Text', text: /Project/ }))?.text).toContain('demo')

    await ui.press({ key: 'status' })
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    await ui.unmount()
  })
}

const NOW = Date.parse('2026-11-08T12:00:00Z')
const iso = (ms: number): string => new Date(NOW + ms).toISOString()
const HOUR = 60 * 60 * 1000
// 5h window with 2h left (60% elapsed) and 90% used: full in 20 minutes.
const FAST_LIMITS = [
  { kind: 'five_hour', percentUsed: 90, resetsAt: iso(2 * HOUR) },
  { kind: 'seven_day', percentUsed: 10, resetsAt: iso(5 * 24 * HOUR) },
]

test('a window that will run out before its reset says so', async ($, on) => {
  seed(on, FAST_LIMITS)
  await $.session.start({ cwd: '/work/demo', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })

  expect((await ui.find({ type: 'Text', text: /runs out in 20m/ }))?.text).toContain('runs out in 20m')
  await ui.press({ key: 'status' })
  expect((await ui.find({ type: 'Text', text: /5h pace/ }))?.text).toContain('limit in 20m, resets in 2h 0m')
  await ui.unmount()
})

test('the pace warning can be turned off', { options: { paceWarning: false } }, async ($, on) => {
  seed(on, FAST_LIMITS)
  await $.session.start({ cwd: '/work/demo', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })

  expect(await ui.find({ type: 'Text', text: /runs out/ })).toBeUndefined()
  await ui.unmount()
})

test('a window on a steady pace shows no warning', async ($, on) => {
  seed(on, [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(2 * HOUR) }])
  await $.session.start({ cwd: '/work/demo', surface: 'vscode', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })

  expect(await ui.find({ type: 'Text', text: /runs out|fast/ })).toBeUndefined()
  await ui.unmount()
})
