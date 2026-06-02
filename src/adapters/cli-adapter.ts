import { spawn } from 'node:child_process'
import type { RunAdapter, RunAgentRequest, RunAgentResult } from './types.js'
import { extractJson, validate } from '../schema/validate.js'

/**
 * Config for a generic agent-CLI run adapter. Different CLIs differ only in how
 * they are invoked non-interactively:
 *  - `promptMode: 'stdin'` — write the prompt to the child's stdin (e.g. `codex exec`).
 *  - `promptMode: 'arg'`   — pass the prompt as the final argv (e.g. `gemini -p <prompt>`).
 * The binary and base args are overridable via env vars so tests can point at a stub.
 */
export interface CliAdapterConfig {
  name: string
  defaultBin: string
  defaultArgs: string[]
  binEnv: string
  argsEnv: string
  promptMode: 'stdin' | 'arg'
  supportsNativeSchema?: boolean
  maxSchemaRetries?: number
}

function schemaPrompt(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`
}

/** Build a RunAdapter that shells out to a single-shot agent CLI. */
export function createCliAdapter(cfg: CliAdapterConfig): RunAdapter {
  const maxRetries = cfg.maxSchemaRetries ?? 3

  function command(): { bin: string; argsPrefix: string[] } {
    const bin = process.env[cfg.binEnv] || cfg.defaultBin
    const raw = process.env[cfg.argsEnv]
    if (!raw) return { bin, argsPrefix: cfg.defaultArgs }
    try {
      return { bin, argsPrefix: JSON.parse(raw) as string[] }
    } catch {
      throw new Error(`${cfg.argsEnv} is not valid JSON: ${raw}`)
    }
  }

  function runOnce(prompt: string, cwd: string): Promise<string> {
    const { bin, argsPrefix } = command()
    const args = cfg.promptMode === 'arg' ? [...argsPrefix, prompt] : argsPrefix
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
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
      child.stdin.on('error', () => {}) // swallow EPIPE; the 'close' handler carries the real rejection
      if (cfg.promptMode === 'stdin') child.stdin.write(prompt)
      child.stdin.end()
    })
  }

  return {
    name: cfg.name,
    supportsNativeSchema: !!cfg.supportsNativeSchema,
    async runAgent(req: RunAgentRequest): Promise<RunAgentResult> {
      if (!req.schema) {
        const text = await runOnce(req.prompt, req.cwd)
        return { text }
      }

      let prompt = schemaPrompt(req.prompt, req.schema)
      let lastErr = ''
      // Only schema-validation failures are retried here. A spawn/exit error from
      // runOnce propagates immediately — process failures are not transient
      // validation issues and should not be silently retried.
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const text = await runOnce(prompt, req.cwd)
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
        `agent "${req.label ?? 'unlabeled'}" failed schema validation after ${maxRetries} attempts: ${lastErr}`,
      )
    },
  }
}
