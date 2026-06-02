import { describe, it, expect } from 'vitest'
import { runFlowScript } from '../../src/runtime/index.js'
import type { RunAdapter } from '../../src/adapters/types.js'

const adapter: RunAdapter = {
  name: 'fake',
  supportsNativeSchema: false,
  async runAgent(req) { return { text: `[${req.prompt}]`, usage: { outputTokens: 2 } } },
}

const SCRIPT = `export const meta = { name: "s", description: "d" };
const __choros_run = async function () { return await agent("go " + (args.n || 0)); };
return await __choros_run();
`

describe('runFlowScript', () => {
  it('runs a canonical script with an injected adapter and returns its result', async () => {
    const out = await runFlowScript({ script: SCRIPT, adapter, args: { n: 3 }, cwd: '/tmp', budget: null,
      onLog: () => {}, onPhase: () => {} })
    expect(out).toBe('[go 3]')
  })
})
