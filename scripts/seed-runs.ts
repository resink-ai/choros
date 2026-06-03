/**
 * Seed a sample run database for the dashboard.
 *
 * Runs each shipped flow through an in-process scripted adapter (schema-valid
 * responses, small latencies, pseudo token counts) with the SQLite recorder on,
 * producing a realistic .choros/runs.db — including one deliberately failing run.
 *
 * Run: npm run seed   (writes .choros/runs.db; pass a path to override)
 */
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { packFlow } from '../src/pack/index.js'
import { runFlowScript } from '../src/runtime/index.js'
import { openSqliteRecorder } from '../src/runtime/recorder.js'
import type { RunAdapter } from '../src/adapters/types.js'

const dbPath = resolve(process.cwd(), process.argv[2] ?? '.choros/runs.db')
const flowsDir = resolve(process.cwd(), 'workflows')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Minimal valid instance of a JSON schema (mirrors tests/fixtures/bin/schema-stub.mjs). */
function gen(schema: any): any {
  if (!schema || typeof schema !== 'object') return 'sample text'
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'object' || (!type && schema.properties)) {
    const out: Record<string, unknown> = {}
    const props = schema.properties || {}
    for (const key of schema.required || Object.keys(props)) out[key] = gen(props[key] || {})
    return out
  }
  if (type === 'array') return [gen(schema.items || {})]
  if (type === 'number' || type === 'integer') return 0.7
  if (type === 'boolean') return true
  if (type === 'null') return null
  return 'sample text'
}

/** Build a scripted adapter; `failOn` forces an error when a label includes it. */
function scriptedAdapter(failOn?: string): RunAdapter {
  let n = 0
  return {
    name: 'scripted',
    supportsNativeSchema: false,
    async runAgent(req) {
      n++
      await sleep(20 + (n % 6) * 18) // varied latency so durations/overlap are visible
      if (failOn && req.label && req.label.includes(failOn)) {
        throw new Error(`scripted failure at "${req.label}"`)
      }
      const tokens = Math.max(8, Math.round(req.prompt.length / 12))
      if (req.schema) {
        const data = gen(req.schema)
        return { text: JSON.stringify(data, null, 2), data, usage: { outputTokens: tokens } }
      }
      return { text: `Done (${req.label ?? 'step'}). Wrote the requested artifacts.`, usage: { outputTokens: tokens } }
    },
  }
}

interface Job { flow: string; args: unknown; failOn?: string }
const JOBS: Job[] = [
  { flow: 'trading-agents', args: { ticker: 'NVDA', date: '2026-01-15', debateRounds: 2, riskRounds: 1 } },
  { flow: 'full-stack-ship', args: { changeRequest: 'Add CSV export to the reports page', baseDir: '/tmp/demo' } },
  { flow: 'first-principles-scout', args: { maxProducts: 3, since: 'the last 7 days', focus: 'developer agents' } },
  { flow: 'trading-agents', args: { ticker: 'TSLA', date: '2026-02-01', debateRounds: 1 }, failOn: 'portfolio-manager' },
]

async function main() {
  rmSync(dbPath, { force: true })
  for (const job of JOBS) {
    const { script } = await packFlow({ flow: job.flow, platform: 'claude', flowsDir })
    const recorder = openSqliteRecorder({ dbPath, flow: job.flow, platform: 'codex', args: job.args, budgetTotal: 500000 })
    try {
      await runFlowScript({ script, adapter: scriptedAdapter(job.failOn), args: job.args, cwd: '/tmp', budget: 500000, recorder, onLog: () => {}, onPhase: () => {} })
      console.log(`✓ ${job.flow} (${recorder.runId.slice(0, 8)})`)
    } catch (e) {
      console.log(`✗ ${job.flow} (${recorder.runId.slice(0, 8)}) — ${(e as Error).message}`)
    }
  }
  console.log(`\nSeeded → ${dbPath}`)
}

main()
