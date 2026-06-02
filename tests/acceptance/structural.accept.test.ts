import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { packFlow } from '../../src/pack/index.js'

const flowsDir = resolve(process.cwd(), 'workflows')

describe('production structural acceptance: trading-agents packs to a valid Claude workflow', () => {
  it('is meta-first, self-contained, and ends with a return call', async () => {
    const { script, meta } = await packFlow({ flow: 'trading-agents', platform: 'claude', flowsDir })

    // Claude requires the script to BEGIN with the meta literal.
    expect(script.trimStart().startsWith('export const meta = {')).toBe(true)
    // meta must carry name + description and the seven declared phases.
    expect(meta.name).toBe('trading-agents')
    expect(meta.description.length).toBeGreaterThan(0)
    expect(meta.phases).toHaveLength(7)
    // Self-contained: no imports/requires survived bundling.
    expect(script).not.toMatch(/^\s*import\s/m)
    expect(script).not.toMatch(/\brequire\(/)
    expect(script).not.toContain('export default')
    // The inlined renderers and schemas are present.
    expect(script).toContain('buildMarkdown')
    expect(script).toContain('ANALYST_SCHEMA')
    // Trailing top-level return so Claude's harness yields the workflow result.
    expect(script.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('the packed script parses as a runnable AsyncFunction body', async () => {
    const { script } = await packFlow({ flow: 'trading-agents', platform: 'claude', flowsDir })
    const body = script.replace(/^\s*export\s+const\s+meta/m, 'const meta')
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as any
    // Construct (compile) but do not invoke — this fails if the body is not valid JS.
    expect(() => new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'cwd', 'budget', body)).not.toThrow()
  })
})
