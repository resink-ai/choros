import { describe, it, expect } from 'vitest'
import { executeCanonicalScript } from '../../src/runtime/execute.js'
import { createGlobals } from '../../src/runtime/globals.js'
import type { RunAdapter } from '../../src/adapters/types.js'

const adapter: RunAdapter = {
  name: 'fake',
  supportsNativeSchema: false,
  async runAgent(req) { return { text: `R:${req.prompt}`, usage: { outputTokens: 1 } } },
}

const SCRIPT = `export const meta = { name: "t", description: "d" };

const PREFIX = "hi ";

const __choros_run = async function () {
  phase("only");
  const a = await agent(PREFIX + (args && args.who || "world"));
  log("ran");
  return { a, cwd, budget: budget.spent() };
};

return await __choros_run();
`

describe('executeCanonicalScript', () => {
  it('strips export, injects globals, and returns the run result', async () => {
    const g = createGlobals({ adapter, args: { who: 'Ada' }, cwd: '/here', budgetTotal: 50,
      onLog: () => {}, onPhase: () => {} })
    const result = await executeCanonicalScript(SCRIPT, g)
    expect(result).toEqual({ a: 'R:hi Ada', cwd: '/here', budget: 1 })
  })
})
