import { describe, it, expect, beforeAll } from 'vitest'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { geminiRunAdapter } from '../../src/adapters/gemini.js'

const stub = fileURLToPath(new URL('../fixtures/bin/gemini-stub.mjs', import.meta.url))

beforeAll(() => {
  chmodSync(stub, 0o755)
  // gemini uses promptMode 'arg' — the prompt is passed as the final argv. The
  // stub is run via node, so argv prefix is [stub]; the adapter appends the prompt.
  process.env.CHOROS_GEMINI_BIN = process.execPath
  process.env.CHOROS_GEMINI_ARGS_PREFIX = JSON.stringify([stub])
})

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { name: { type: 'string' }, greeting: { type: 'string' } },
  required: ['name', 'greeting'],
}

describe('geminiRunAdapter.runAgent', () => {
  it('has the expected identity', () => {
    expect(geminiRunAdapter.name).toBe('gemini')
    expect(geminiRunAdapter.supportsNativeSchema).toBe(false)
  })

  it('returns plain text when no schema is given', async () => {
    const r = await geminiRunAdapter.runAgent({ prompt: 'say hi', cwd: process.cwd() })
    expect(r.text).toContain('plain text reply')
    expect(r.data).toBeUndefined()
  })

  it('returns validated data when a schema is given (prompt passed via -p arg)', async () => {
    const r = await geminiRunAdapter.runAgent({ prompt: 'RETURN_SCHEMA_OBJECT', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'Ada', greeting: 'Hello Ada' })
  })

  it('retries on validation failure and succeeds', async () => {
    const r = await geminiRunAdapter.runAgent({ prompt: 'RETURN_INVALID_THEN_VALID', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'ok', greeting: 'hi' })
  })

  it('throws a labeled error after exhausting retries', async () => {
    await expect(
      geminiRunAdapter.runAgent({ prompt: 'RETURN_ALWAYS_INVALID', cwd: process.cwd(), schema: SCHEMA, label: 'greet:Ada' }),
    ).rejects.toThrow(/agent "greet:Ada" failed schema validation after 3 attempts/)
  })
})
