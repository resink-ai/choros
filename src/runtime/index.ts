import { readFile } from 'node:fs/promises'
import type { RunAdapter } from '../adapters/types.js'
import { createGlobals } from './globals.js'
import { executeCanonicalScript } from './execute.js'

export interface RunFlowScriptOptions {
  script: string
  adapter: RunAdapter
  args: unknown
  cwd: string
  budget: number | null
  onLog?: (line: string) => void
  onPhase?: (title: string) => void
}

export async function runFlowScript(opts: RunFlowScriptOptions): Promise<unknown> {
  const globals = createGlobals({
    adapter: opts.adapter,
    args: opts.args,
    cwd: opts.cwd,
    budgetTotal: opts.budget,
    onLog: opts.onLog,
    onPhase: opts.onPhase,
  })
  return executeCanonicalScript(opts.script, globals)
}

export async function loadScriptFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
