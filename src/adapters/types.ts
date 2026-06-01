export interface WorkflowMeta {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string; detail?: string; model?: string }>
  model?: string
}

export interface TokenUsage {
  outputTokens: number
}

export interface RunAgentRequest {
  prompt: string
  cwd: string
  schema?: Record<string, unknown>
  model?: string
  label?: string
}

export interface RunAgentResult {
  text: string
  data?: unknown
  usage?: TokenUsage
}

export interface PackTarget {
  name: string
  /** Final platform-specific touches on the canonical script (header, etc.). */
  finalize(canonicalScript: string, meta: WorkflowMeta): string
}

export interface RunAdapter {
  name: string
  supportsNativeSchema: boolean
  runAgent(req: RunAgentRequest): Promise<RunAgentResult>
}
