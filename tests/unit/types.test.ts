import { describe, it, expect } from 'vitest'
import type { WorkflowMeta, RunAgentRequest, TokenUsage } from '../../src/adapters/types.js'

describe('adapter types', () => {
  it('shapes compile and accept expected fields', () => {
    const meta: WorkflowMeta = { name: 'x', description: 'y' }
    const usage: TokenUsage = { outputTokens: 10 }
    const req: RunAgentRequest = { prompt: 'hi', cwd: '/tmp', label: 'a' }
    expect(meta.name).toBe('x')
    expect(usage.outputTokens).toBe(10)
    expect(req.prompt).toBe('hi')
  })
})
