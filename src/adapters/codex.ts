import { createCliAdapter } from './cli-adapter.js'

/**
 * Codex run adapter. Invokes `codex exec` non-interactively with the prompt
 * written to stdin (no positional [PROMPT] → codex reads stdin). Binary and
 * base args are overridable via CHOROS_CODEX_BIN / CHOROS_CODEX_ARGS_PREFIX.
 */
export const codexRunAdapter = createCliAdapter({
  name: 'codex',
  defaultBin: 'codex',
  defaultArgs: ['exec'],
  binEnv: 'CHOROS_CODEX_BIN',
  argsEnv: 'CHOROS_CODEX_ARGS_PREFIX',
  promptMode: 'stdin',
  supportsNativeSchema: false,
})
