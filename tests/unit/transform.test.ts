import { describe, it, expect } from 'vitest'
import { toCanonicalScript } from '../../src/pack/transform.js'

// Mirrors esbuild bundle output: de-exported declarations + a trailing aggregated export.
const BUNDLED = `
var SCHEMA = { type: "object" };
var meta = { name: "demo", description: "d" };
async function run() {
  const x = await agent("hi", { schema: SCHEMA });
  return { x };
}
export {
  run as default,
  meta
};
`

describe('toCanonicalScript', () => {
  const out = toCanonicalScript(BUNDLED)

  it('begins with the meta literal export', () => {
    expect(out.trimStart().startsWith('export const meta = {')).toBe(true)
  })

  it('keeps inlined dependency code', () => {
    expect(out).toContain('var SCHEMA = { type: "object" }')
  })

  it('keeps the run function declaration', () => {
    expect(out).toContain('async function run()')
  })

  it('aliases the default-exported binding to __choros_run', () => {
    expect(out).toContain('const __choros_run = run;')
  })

  it('removes the aggregated export statement', () => {
    expect(out).not.toContain('as default')
    expect(out).not.toContain('export default')
  })

  it('appends a top-level return call', () => {
    expect(out.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('handles an anonymous default (esbuild names it <file>_default)', () => {
    const anon = `var meta = { name: "a", description: "b" };\nasync function anon_default() { return 7 }\nexport { anon_default as default, meta };`
    const r = toCanonicalScript(anon)
    expect(r).toContain('const __choros_run = anon_default;')
    expect(r.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('throws when there is no aggregated export', () => {
    expect(() => toCanonicalScript(`var x = 1;`)).toThrow(/aggregated export/i)
  })
})
