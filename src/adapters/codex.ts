import type { RunAdapter, RunAgentRequest, RunAgentResult } from './types.js'

export const codexRunAdapter: RunAdapter = {
  name: 'codex',
  supportsNativeSchema: false,
  async runAgent(_req: RunAgentRequest): Promise<RunAgentResult> {
    throw new Error('codex runAgent not implemented yet')
  },
}
