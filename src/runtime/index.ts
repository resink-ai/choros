import { readFile } from 'node:fs/promises'
import type { RunAdapter } from '../adapters/types.js'
import { createGlobals } from './globals.js'
import { executeCanonicalScript } from './execute.js'
import type { RunRecorder } from './recorder.js'

export interface RunFlowScriptOptions {
  script: string
  adapter: RunAdapter
  args: unknown
  cwd: string
  budget: number | null
  onLog?: (line: string) => void
  onPhase?: (title: string) => void
  recorder?: RunRecorder
}

export async function runFlowScript(opts: RunFlowScriptOptions): Promise<unknown> {
  const globals = createGlobals({
    adapter: opts.adapter,
    args: opts.args,
    cwd: opts.cwd,
    budgetTotal: opts.budget,
    onLog: opts.onLog,
    onPhase: opts.onPhase,
    recorder: opts.recorder,
  })
  try {
    const result = await executeCanonicalScript(opts.script, globals)
    opts.recorder?.finish({ status: 'ok', result, tokensSpent: globals.budget.spent() })
    return result
  } catch (e) {
    opts.recorder?.finish({
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      tokensSpent: globals.budget.spent(),
    })
    throw e
  } finally {
    opts.recorder?.close()
  }
}

export async function loadScriptFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
