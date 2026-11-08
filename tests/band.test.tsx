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

const seed = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: Date.parse('2026-11-08T12:00:00Z') }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv[1] === 'status' ? ' M a.ts\n?? b.ts\n' : 'main\n',
      stderr: '',
    },
  }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, tokens: 84000, percent: 42 },
      cost: { usd: 1.234 },
      rateLimits: [
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

  test(`the HUD button shows the details on ${surface}`, async ($, on) => {
    seed(on)
    await $.session.start({ cwd: '/work/demo', surface, isInteractive: true })

    const ui = await $.ui.mount({ ...BAND, surface })
    await ui.press({ key: 'hud' })

    expect((await ui.find({ type: 'Text', text: /Model/ }))?.text).toContain('claude-sonnet-5-5')
    expect((await ui.find({ type: 'Text', text: /Branch/ }))?.text).toContain('main +2')
    expect((await ui.find({ type: 'Text', text: /Context/ }))?.text).toContain('42% (84k/200k)')
    expect((await ui.find({ type: 'Text', text: /Cost/ }))?.text).toContain('$1.23')
    expect((await ui.find({ type: 'Text', text: /Project/ }))?.text).toContain('demo')

    await ui.press({ key: 'hud' })
    expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
    await ui.unmount()
  })
}
