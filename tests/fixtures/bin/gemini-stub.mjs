#!/usr/bin/env node
// Mimics `gemini -p "<prompt>"`: reads the prompt from argv (not stdin) and
// prints a canned reply driven by markers in the prompt, so tests are deterministic.
const prompt = process.argv.slice(2).join(' ')

if (prompt.includes('RETURN_ALWAYS_INVALID')) {
  process.stdout.write('```json\n{ "greeting": "hi" }\n```\n')
} else if (prompt.includes('RETURN_INVALID_THEN_VALID')) {
  // First attempt: invalid (missing required "name"). Retry preamble flips it valid.
  if (prompt.includes('Previous attempt failed validation')) {
    process.stdout.write('```json\n{ "name": "ok", "greeting": "hi" }\n```\n')
  } else {
    process.stdout.write('```json\n{ "greeting": "hi" }\n```\n')
  }
} else if (prompt.includes('RETURN_SCHEMA_OBJECT')) {
  process.stdout.write('Sure!\n```json\n{ "name": "Ada", "greeting": "Hello Ada" }\n```\n')
} else {
  process.stdout.write('plain text reply\n')
}
