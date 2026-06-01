import { spawn } from 'node:child_process'
import type { RunAdapter, RunAgentRequest, RunAgentResult } from './types.js'
import { extractJson, validate } from '../schema/validate.js'

const MAX_SCHEMA_RETRIES = 3

function codexCommand(): { bin: string; argsPrefix: string[] } {
  const bin = process.env.CHOROS_CODEX_BIN || 'codex'
  const prefix = process.env.CHOROS_CODEX_ARGS_PREFIX
    ? (JSON.parse(process.env.CHOROS_CODEX_ARGS_PREFIX) as string[])
    : ['exec']
  return { bin, argsPrefix: prefix }
}

function runCodexOnce(prompt: string, cwd: string): Promise<string> {
  const { bin, argsPrefix } = codexCommand()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argsPrefix, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) =>
      reject(new Error(`failed to spawn "${bin}": ${e.message} (is it on PATH?)`)),
    )
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${bin} exited with code ${code}: ${err.trim() || out.trim()}`))
    })
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function schemaPrompt(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`
}

export const codexRunAdapter: RunAdapter = {
  name: 'codex',
  supportsNativeSchema: false,
  async runAgent(req: RunAgentRequest): Promise<RunAgentResult> {
    if (!req.schema) {
      const text = await runCodexOnce(req.prompt, req.cwd)
      return { text }
    }

    let prompt = schemaPrompt(req.prompt, req.schema)
    let lastErr = ''
    for (let attempt = 1; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
      const text = await runCodexOnce(prompt, req.cwd)
      try {
        const parsed = extractJson(text)
        const res = validate(parsed, req.schema)
        if (res.ok) return { text, data: res.data }
        lastErr = res.errors
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
      prompt = `${schemaPrompt(req.prompt, req.schema)}\n\nPrevious attempt failed validation: ${lastErr}\nReturn corrected JSON only.`
    }
    throw new Error(
      `agent "${req.label ?? 'unlabeled'}" failed schema validation after ${MAX_SCHEMA_RETRIES} attempts: ${lastErr}`,
    )
  },
}
