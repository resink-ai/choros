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
  const { getRunAdapter } = await import('../adapters/registry.js')
  const { runFlowScript, loadScriptFile } = await import('../runtime/index.js')
  const adapter = getRunAdapter(parsed.platform)
  const cwd = process.cwd()

  let script: string
  if (parsed.flowScript) {
    script = await loadScriptFile(resolve(cwd, parsed.flowScript))
  } else {
    const flowsDir = resolve(cwd, 'workflows')
    const { packFlow } = await import('../pack/index.js')
    script = (await packFlow({ flow: parsed.flow!, platform: 'claude', flowsDir })).script
  }

  const result = await runFlowScript({
    script, adapter, args: parsed.args, cwd, budget: parsed.budget,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return
}

main().catch((err) => {
  process.stderr.write(`choros: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
