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

  // parsed.command === 'run' — implemented in a later task.
  throw new Error('run command not implemented yet')
}

main().catch((err) => {
  process.stderr.write(`choros: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
