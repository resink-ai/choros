#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseCli } from './args.js'
import { packFlow } from '../pack/index.js'

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2))

  if (parsed.command === 'pack') {
    const flowsDir = resolve(process.cwd(), 'workflows')
    const { script } = await packFlow({ flow: parsed.flow, platform: parsed.platform, flowsDir })
    const out = parsed.out ?? resolve(process.cwd(), 'dist', `${parsed.flow}.${parsed.platform}.workflow.js`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, script, 'utf8')
    process.stdout.write(`${out}\n`)
    return
  }

  // parsed.command === 'run'
  const { basename } = await import('node:path')
  const { getRunAdapter } = await import('../adapters/registry.js')
  const { runFlowScript, loadScriptFile } = await import('../runtime/index.js')
  const { openSqliteRecorder } = await import('../runtime/recorder.js')
  const adapter = getRunAdapter(parsed.platform)
  const cwd = process.cwd()

  const flowName = parsed.flow ?? basename(parsed.flowScript ?? 'workflow').replace(/\.(workflow\.)?js$/, '')

  let script: string
  if (parsed.flowScript) {
    script = await loadScriptFile(resolve(cwd, parsed.flowScript))
  } else {
    const flowsDir = resolve(cwd, 'workflows')
    const { packFlow } = await import('../pack/index.js')
    // The canonical script is platform-neutral, so we pack with the 'claude'
    // target purely to produce it; the run adapter (codex, etc.) is selected
    // separately above. If a PackTarget.finalize ever injects platform-specific
    // text, the run path must switch to a finalize-free/neutral target here.
    script = (await packFlow({ flow: parsed.flow!, platform: 'claude', flowsDir })).script
  }

  const recorder = parsed.record
    ? openSqliteRecorder({
        dbPath: parsed.db ?? resolve(cwd, '.choros/runs.db'),
        flow: flowName,
        platform: parsed.platform,
        args: parsed.args,
        budgetTotal: parsed.budget,
      })
    : undefined
  if (recorder) {
    process.stderr.write(`choros: recording run ${recorder.runId} → ${parsed.db ?? resolve(cwd, '.choros/runs.db')}\n`)
  }

  const result = await runFlowScript({
    script, adapter, args: parsed.args, cwd, budget: parsed.budget, recorder,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return
}

main().catch((err) => {
  process.stderr.write(`choros: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
