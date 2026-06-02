import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, strict: false })

/** Pull a JSON object out of model output: bare, fenced, or embedded in prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  // 1) Fenced ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fence) candidates.push(fence[1].trim())
  candidates.push(trimmed)
  // 2) Last balanced {...} in the string.
  const balanced = lastBalancedObject(trimmed)
  if (balanced) candidates.push(balanced)

  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (v && typeof v === 'object') return v
    } catch {
      /* try next */
    }
  }
  throw new Error('no JSON object found in agent output')
}

function lastBalancedObject(s: string): string | null {
  let depth = 0
  let start = -1
  let best: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) best = s.slice(start, i + 1)
    }
  }
  return best
}

export type ValidateResult =
  | { ok: true; data: unknown }
  | { ok: false; errors: string }

export function validate(data: unknown, schema: Record<string, unknown>): ValidateResult {
  const fn = ajv.compile(schema)
  if (fn(data)) return { ok: true, data }
  return { ok: false, errors: ajv.errorsText(fn.errors, { separator: '; ' }) }
}
