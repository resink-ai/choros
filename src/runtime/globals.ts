import type { RunAdapter } from '../adapters/types.js'
import { createBudget, type Budget } from './budget.js'
import { makeParallel, makePipeline, defaultConcurrency } from './concurrency.js'
import { nullRecorder, type RunRecorder } from './recorder.js'

export interface GlobalsOptions {
  adapter: RunAdapter
  args: unknown
  cwd: string
  budgetTotal: number | null
  concurrency?: number
  onLog?: (line: string) => void
  onPhase?: (title: string) => void
  recorder?: RunRecorder
}

export interface WorkflowGlobals {
  agent(prompt: string, opts?: { label?: string; phase?: string; schema?: Record<string, unknown>; model?: string }): Promise<any>
  parallel: ReturnType<typeof makeParallel>
  pipeline: ReturnType<typeof makePipeline>
  phase(title: string): void
  log(message: string): void
  args: unknown
  cwd: string
  budget: Budget
}

export function createGlobals(opts: GlobalsOptions): WorkflowGlobals {
  const cap = opts.concurrency ?? defaultConcurrency()
  const budget = createBudget(opts.budgetTotal)
  const recorder = opts.recorder ?? nullRecorder
  const onLog = opts.onLog ?? ((l) => process.stderr.write(`${l}\n`))
  const onPhase = opts.onPhase ?? ((t) => process.stderr.write(`\n=== ${t} ===\n`))
  let currentPhase = ''

  async function agent(
    prompt: string,
    o?: { label?: string; phase?: string; schema?: Record<string, unknown>; model?: string },
  ): Promise<any> {
    const callId = recorder.agentStart({
      label: o?.label,
      phase: o?.phase ?? currentPhase,
      model: o?.model,
      prompt,
      schema: o?.schema,
    })
    try {
      const res = await opts.adapter.runAgent({
        prompt,
        cwd: opts.cwd,
        schema: o?.schema,
        model: o?.model,
        label: o?.label,
      })
      if (res.usage) budget.add(res.usage.outputTokens)
      recorder.agentEnd(callId, {
        status: 'ok',
        responseText: res.text,
        responseData: res.data,
        tokens: res.usage?.outputTokens,
      })
      return o?.schema ? res.data : res.text
    } catch (e) {
      recorder.agentEnd(callId, { status: 'error', error: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }

  return {
    agent,
    parallel: makeParallel(cap),
    pipeline: makePipeline(cap),
    phase: (t) => {
      currentPhase = t
      recorder.phase(t)
      onPhase(t)
    },
    log: (m) => {
      recorder.log(m)
      onLog(m)
    },
    args: opts.args,
    cwd: opts.cwd,
    budget,
  }
}
