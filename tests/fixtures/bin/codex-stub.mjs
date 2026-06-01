#!/usr/bin/env node
// Mimics `codex exec`: reads the prompt from stdin and prints a canned reply.
// Behavior is driven by markers in the prompt so tests are deterministic.
import { readFileSync } from 'node:fs'

const prompt = readFileSync(0, 'utf8')

if (prompt.includes('RETURN_INVALID_THEN_VALID')) {
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
