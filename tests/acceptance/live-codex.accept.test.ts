import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'
import { runFlowScript } from '../../src/runtime/index.js'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const live = process.env.CHOROS_ACCEPTANCE_LIVE === '1'
const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))

describe.runIf(live)('production live acceptance: real codex runs hello-fan', () => {
  it('packs and runs hello-fan against the real codex CLI', async () => {
    // Uses the real `codex` on PATH (no CHOROS_CODEX_BIN override).
    delete process.env.CHOROS_CODEX_BIN
    delete process.env.CHOROS_CODEX_ARGS_PREFIX

    const { script } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    const result = (await runFlowScript({
      script, adapter: codexRunAdapter, args: { names: ['Ada'] },
      cwd: process.cwd(), budget: null,
    })) as { greetings: Array<{ name: string; greeting: string }>; summary: string }

    expect(Array.isArray(result.greetings)).toBe(true)
    expect(result.greetings.length).toBe(1)
    expect(typeof result.greetings[0].name).toBe('string')
    expect(typeof result.greetings[0].greeting).toBe('string')
    expect(typeof result.summary).toBe('string')
  }, 120_000)
})
