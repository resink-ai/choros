import type { PackTarget, RunAdapter } from './types.js'
import { claudePackTarget } from './claude.js'
import { codexRunAdapter } from './codex.js'
import { geminiRunAdapter } from './gemini.js'

const PACK_TARGETS: Record<string, PackTarget> = {
  claude: claudePackTarget,
}

const RUN_ADAPTERS: Record<string, RunAdapter> = {
  codex: codexRunAdapter,
  gemini: geminiRunAdapter,
}

export function getPackTarget(name: string): PackTarget {
  const t = PACK_TARGETS[name]
  if (!t) throw new Error(`no pack target for platform "${name}" (have: ${Object.keys(PACK_TARGETS).join(', ')})`)
  return t
}

export function getRunAdapter(name: string): RunAdapter {
  const a = RUN_ADAPTERS[name]
  if (!a) throw new Error(`no run adapter for platform "${name}" (have: ${Object.keys(RUN_ADAPTERS).join(', ')})`)
  return a
}
