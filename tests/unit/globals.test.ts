import { describe, it, expect } from 'vitest'
import { createGlobals } from '../../src/runtime/globals.js'
import type { RunAdapter } from '../../src/adapters/types.js'

function fakeAdapter(): RunAdapter {
  return {
    name: 'fake',
    supportsNativeSchema: false,
    async runAgent(req) {
      return { text: `echo:${req.prompt}`, data: { p: req.prompt }, usage: { outputTokens: 7 } }
    },
  }
}

describe('createGlobals', () => {
  it('agent() returns text without a schema and data with one', async () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: undefined, cwd: '/tmp', budgetTotal: null })
    expect(await g.agent('hi')).toBe('echo:hi')
    expect(await g.agent('hi', { schema: { type: 'object' } })).toEqual({ p: 'hi' })
  })

  it('agent() accrues token usage into budget', async () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: undefined, cwd: '/tmp', budgetTotal: 100 })
    await g.agent('a')
    await g.agent('b')
    expect(g.budget.spent()).toBe(14)
    expect(g.budget.remaining()).toBe(86)
  })

  it('exposes args and cwd; phase/log do not throw', () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: { k: 1 }, cwd: '/work', budgetTotal: null })
    expect(g.args).toEqual({ k: 1 })
    expect(g.cwd).toBe('/work')
    expect(() => { g.phase('P'); g.log('hello') }).not.toThrow()
  })
})
