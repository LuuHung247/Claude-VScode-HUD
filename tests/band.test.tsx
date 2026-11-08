import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
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
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [
        { kind: 'seven_day', percentUsed: 0 },
        { kind: 'five_hour', percentUsed: 3.2 },
      ],
    },
  }))
}

for (const surface of ['terminal', 'vscode'] as const) {
  test(`the band shows both windows in one row on ${surface}`, async ($, on) => {
    seed(on)
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ type: 'Text', text: /^5h$/ }))?.text).toBe('5h')
    expect((await ui.find({ type: 'Text', text: /^3%$/ }))?.text).toBe('3%')
    expect((await ui.find({ type: 'Text', text: /^Weekly$/ }))?.text).toBe('Weekly')
    expect((await ui.find({ type: 'Text', text: /^0%$/ }))?.text).toBe('0%')
    await ui.unmount()
  })
}
