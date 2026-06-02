import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bundleEntry } from './bundle.js'
import { toCanonicalScript } from './transform.js'
import { extractMeta } from './meta.js'
import { getPackTarget } from '../adapters/registry.js'
import type { WorkflowMeta } from '../adapters/types.js'

export function resolveFlow(flow: string, flowsDir: string): string {
  const dir = resolve(flowsDir, flow)
  for (const name of ['workflow.js', 'workflow.ts', 'index.js', 'index.ts']) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`flow "${flow}" not found under ${flowsDir} (looked for workflow.js/ts, index.js/ts)`)
}

export interface PackOptions {
  flow: string
  platform: string
  flowsDir: string
}

export interface PackResult {
  script: string
  meta: WorkflowMeta
}

export async function packFlow(opts: PackOptions): Promise<PackResult> {
  const entry = resolveFlow(opts.flow, opts.flowsDir)
  const entrySource = await readFile(entry, 'utf8')
  // meta is read from the author's entry source (inline `export const meta`),
  // never from the canonical script (which has a top-level `return`).
  const meta = extractMeta(entrySource).value
  const bundled = await bundleEntry(entry)
  const canonical = toCanonicalScript(bundled)
  const target = getPackTarget(opts.platform)
  return { script: target.finalize(canonical, meta), meta }
}
