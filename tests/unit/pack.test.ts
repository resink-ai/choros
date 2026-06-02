import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'

const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))

describe('packFlow (claude)', () => {
  it('produces a meta-first, self-contained canonical script', async () => {
    const { script, meta } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    expect(meta.name).toBe('hello-fan')
    expect(script.trimStart().startsWith('export const meta = {')).toBe(true)
    expect(script).not.toMatch(/^\s*import\s/m)
    expect(script).not.toContain('export default')
    expect(script.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('throws a clear error for an unknown flow', async () => {
    await expect(packFlow({ flow: 'nope', platform: 'claude', flowsDir }))
      .rejects.toThrow(/flow "nope" not found/i)
  })
})
