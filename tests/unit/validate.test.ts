import { describe, it, expect } from 'vitest'
import { extractJson, validate } from '../../src/schema/validate.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { name: { type: 'string' } },
  required: ['name'],
}

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"name":"x"}')).toEqual({ name: 'x' })
  })

  it('extracts JSON from a fenced code block', () => {
    const text = 'Here:\n```json\n{ "name": "y" }\n```\nthanks'
    expect(extractJson(text)).toEqual({ name: 'y' })
  })

  it('extracts the last balanced object from surrounding prose', () => {
    expect(extractJson('blah { "name": "z" } end')).toEqual({ name: 'z' })
  })

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow(/no json/i)
  })
})

describe('validate', () => {
  it('returns ok for valid data', () => {
    expect(validate({ name: 'x' }, SCHEMA)).toEqual({ ok: true, data: { name: 'x' } })
  })

  it('returns errors for invalid data', () => {
    const r = validate({ nope: 1 }, SCHEMA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toMatch(/name/)
  })
})
