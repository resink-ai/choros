#!/usr/bin/env node
// Generic agent-CLI stub used by the platform verification harness.
//
// It reads the prompt from BOTH argv (gemini-style `-p <prompt>`) and stdin
// (codex-style), finds the JSON Schema the choros adapter appends, and emits a
// minimal VALID instance of that schema. With no schema it returns plain text
// (matching the export step, which writes files and returns text).
//
// This lets every flow's full orchestration run through a real platform adapter
// (real spawn + arg/stdin handling + schema extract/validate) with zero tokens.

import { readFileSync } from 'node:fs'

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

const prompt = process.argv.slice(2).join(' ') + '\n' + readStdin()

// Find the schema block the adapter appends: "...JSON Schema:\n{ ... }".
function extractSchema(text) {
  const marker = 'JSON Schema:'
  const at = text.lastIndexOf(marker)
  if (at < 0) return null
  const from = text.indexOf('{', at)
  if (from < 0) return null
  let depth = 0
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(from, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

// Produce a minimal value that satisfies a JSON schema node.
// Limitation: allOf/oneOf/anyOf/$ref are NOT handled (they fall through to
// 'sample'). All current workflow schemas use only type/properties/required/
// enum/items, so this is sufficient for the verification harness.
function gen(schema) {
  if (!schema || typeof schema !== 'object') return 'sample'
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'object' || (!type && schema.properties)) {
    const out = {}
    const props = schema.properties || {}
    const required = schema.required || Object.keys(props)
    for (const key of required) out[key] = gen(props[key] || {})
    return out
  }
  if (type === 'array') {
    const item = gen(schema.items || {})
    return [item]
  }
  if (type === 'number' || type === 'integer') return 1
  if (type === 'boolean') return true
  if (type === 'null') return null
  return 'sample'
}

const schema = extractSchema(prompt)
if (schema) {
  process.stdout.write(JSON.stringify(gen(schema)) + '\n')
} else {
  process.stdout.write('done — wrote the requested files.\n')
}
