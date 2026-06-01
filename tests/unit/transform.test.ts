import { describe, it, expect } from 'vitest'
import { toCanonicalScript } from '../../src/pack/transform.js'

const BUNDLED = `
var SCHEMA = { type: "object" };
export const meta = { name: "demo", description: "d" };
export default async function run() {
  const x = await agent("hi", { schema: SCHEMA });
  return { x };
}
`

describe('toCanonicalScript', () => {
  const out = toCanonicalScript(BUNDLED)

  it('begins with the meta literal export', () => {
    expect(out.trimStart().startsWith('export const meta = {')).toBe(true)
  })

  it('keeps inlined dependency code', () => {
    expect(out).toContain('var SCHEMA = { type: "object" }')
  })

  it('rewrites default export into a named run binding', () => {
    expect(out).toContain('const __choros_run =')
    expect(out).not.toContain('export default')
  })

  it('appends a top-level return call', () => {
    expect(out.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('handles anonymous default function expression', () => {
    const anon = `export const meta = { name: "a", description: "b" }\nexport default async function () { return 7 }`
    const r = toCanonicalScript(anon)
    expect(r).toContain('const __choros_run = async function')
    expect(r).toContain('return await __choros_run();')
  })

  it('handles meta declared after the default export', () => {
    const inverted = `export default async function run() { return 1 }\nexport const meta = { name: "x", description: "y" }`
    const r = toCanonicalScript(inverted)
    expect(r.trimStart().startsWith('export const meta = {')).toBe(true)
    expect(r.trimEnd().endsWith('return await __choros_run();')).toBe(true)
    expect(r).not.toContain('export default')
  })
})
