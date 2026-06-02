import { describe, it, expect, beforeAll } from 'vitest'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'
import { runFlowScript } from '../../src/runtime/index.js'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))
const stub = fileURLToPath(new URL('../fixtures/bin/codex-stub.mjs', import.meta.url))

beforeAll(() => {
  chmodSync(stub, 0o755)
  process.env.CHOROS_CODEX_BIN = process.execPath
  process.env.CHOROS_CODEX_ARGS_PREFIX = JSON.stringify([stub, 'exec'])
})

describe('pack → run end to end (codex stub)', () => {
  it('packs hello-fan and runs it to a structured result', async () => {
    const { script, meta } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    expect(meta.name).toBe('hello-fan')

    const result = (await runFlowScript({
      script,
      adapter: codexRunAdapter,
      args: { names: ['Ada', 'Linus'] },
      cwd: process.cwd(),
      budget: null,
      onLog: () => {},
      onPhase: () => {},
    })) as { greetings: Array<{ name: string; greeting: string }>; summary: string }

    expect(result.greetings).toHaveLength(2)
    expect(result.greetings[0]).toEqual({ name: 'Ada', greeting: 'Hello Ada' })
    expect(result.greetings[1]).toEqual({ name: 'Linus', greeting: 'Hello Linus' })
    expect(result.summary).toContain('greeted')
  })
})
