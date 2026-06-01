import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { bundleEntry } from '../../src/pack/bundle.js'

const entry = fileURLToPath(new URL('../fixtures/flows/hello-fan/workflow.js', import.meta.url))

describe('bundleEntry', () => {
  it('inlines imports into a single self-contained ESM string', async () => {
    const code = await bundleEntry(entry)
    // esbuild de-exports declarations and aggregates exports at the end.
    expect(code).toContain('var meta')
    expect(code).toContain('as default')
    // The imported schema must be inlined, not left as an import.
    expect(code).toContain('additionalProperties')
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toMatch(/require\(/)
    // Globals must remain free identifiers (not resolved/renamed away).
    expect(code).toContain('agent(')
    expect(code).toContain('parallel(')
  })
})
