export interface RunRow {
  id: string
  flow: string
  platform: string
  args: string | null
  status: 'running' | 'ok' | 'error'
  result: string | null
  error: string | null
  budget_total: number | null
  tokens_spent: number | null
  started_at: number
  ended_at: number | null
}

export interface RunListItem extends RunRow {
  agent_count: number
  error_count: number
  duration_ms: number | null
}

export interface PhaseRow {
  id: number
  run_id: string
  title: string
  seq: number
  started_at: number
}

export interface EventRow {
  id: number
  run_id: string
  phase: string | null
  message: string
  ts: number
  seq: number
}

export interface AgentCallRow {
  id: number
  run_id: string
  phase: string | null
  label: string | null
  seq: number
  model: string | null
  prompt: string | null
  schema: string | null
  response_text: string | null
  response_data: string | null
  tokens: number | null
  status: 'running' | 'ok' | 'error'
  error: string | null
  started_at: number | null
  ended_at: number | null
  duration_ms: number | null
}

export interface RunFilters {
  flow?: string
  platform?: string
  status?: string
  q?: string
}

export interface Stats {
  total: number
  ok: number
  error: number
  totalTokens: number
  totalAgentCalls: number
}
