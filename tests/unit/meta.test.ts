import { describe, it, expect } from 'vitest'
import { extractMeta } from '../../src/pack/meta.js'

const GOOD = `
export const meta = { name: 'demo', description: 'a demo', phases: [{ title: 'A' }] }
export default async function run() { return 1 }
`

describe('extractMeta', () => {
  it('returns the meta literal source and parsed object', () => {
    const r = extractMeta(GOOD)
    expect(r.value.name).toBe('demo')
    expect(r.value.description).toBe('a demo')
    expect(r.source.startsWith('{')).toBe(true)
    expect(r.start).toBeGreaterThan(0)
    expect(r.end).toBeGreaterThan(r.start)
  })

  it('throws when meta is missing', () => {
    expect(() => extractMeta(`export default async function run(){}`))
      .toThrow(/meta/i)
  })

  it('throws when meta is not an object literal', () => {
    expect(() => extractMeta(`export const meta = makeMeta()\nexport default async function run(){}`))
      .toThrow(/pure literal/i)
  })

  it('throws when name or description missing', () => {
    expect(() => extractMeta(`export const meta = { name: 'x' }\nexport default async function run(){}`))
      .toThrow(/description/i)
  })
})
