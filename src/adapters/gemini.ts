import { createCliAdapter } from './cli-adapter.js'

/**
 * Gemini CLI run adapter. Invokes `gemini -p "<prompt>"` for non-interactive
 * (headless) mode — the prompt is passed as the final argv, not stdin. Binary
 * and base args are overridable via CHOROS_GEMINI_BIN / CHOROS_GEMINI_ARGS_PREFIX.
 */
export const geminiRunAdapter = createCliAdapter({
  name: 'gemini',
  defaultBin: 'gemini',
  defaultArgs: ['-p'],
  binEnv: 'CHOROS_GEMINI_BIN',
  argsEnv: 'CHOROS_GEMINI_ARGS_PREFIX',
  promptMode: 'arg',
  supportsNativeSchema: false,
})
