import { describe, it, expect, beforeAll } from 'vitest'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const stub = fileURLToPath(new URL('../fixtures/bin/codex-stub.mjs', import.meta.url))

beforeAll(() => {
  chmodSync(stub, 0o755)
  process.env.CHOROS_CODEX_BIN = process.execPath // run the stub with node
  process.env.CHOROS_CODEX_ARGS_PREFIX = JSON.stringify([stub, 'exec'])
})

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { name: { type: 'string' }, greeting: { type: 'string' } },
  required: ['name', 'greeting'],
}

describe('codexRunAdapter.runAgent', () => {
  it('returns plain text when no schema is given', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'say hi', cwd: process.cwd() })
    expect(r.text).toContain('plain text reply')
    expect(r.data).toBeUndefined()
  })

  it('returns validated data when a schema is given', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'RETURN_SCHEMA_OBJECT', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'Ada', greeting: 'Hello Ada' })
  })

  it('retries on validation failure and succeeds', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'RETURN_INVALID_THEN_VALID', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'ok', greeting: 'hi' })
  })

  it('throws a labeled error after exhausting retries', async () => {
    await expect(
      codexRunAdapter.runAgent({ prompt: 'RETURN_ALWAYS_INVALID', cwd: process.cwd(), schema: SCHEMA, label: 'greet:Ada' }),
    ).rejects.toThrow(/agent "greet:Ada" failed schema validation after 3 attempts/)
  })
})
