import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
import { openSqliteRecorder } from '../../src/runtime/recorder.js'
import { runFlowScript } from '../../src/runtime/index.js'
import type { RunAdapter } from '../../src/adapters/types.js'

let dir: string
let dbPath: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'choros-rec-'))
  dbPath = join(dir, 'runs.db')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function read(path: string, sql: string): any[] {
  const db = new DatabaseSync(path)
  const rows = db.prepare(sql).all()
  db.close()
  return rows
}

describe('openSqliteRecorder', () => {
  it('records a run with phases, logs, and agent calls', () => {
    const rec = openSqliteRecorder({ dbPath, flow: 'demo', platform: 'codex', args: { x: 1 }, budgetTotal: 100 })
    expect(rec.runId).toMatch(/[0-9a-f-]{36}/)
    rec.phase('Analyze')
    rec.log('starting')
    const id = rec.agentStart({ label: 'a1', phase: 'Analyze', model: 'm', prompt: 'hello', schema: { type: 'object' } })
    rec.agentEnd(id, { status: 'ok', responseText: 'world', responseData: { ok: true }, tokens: 7 })
    rec.finish({ status: 'ok', result: { done: true }, tokensSpent: 7 })
    rec.close()

    const runs = read(dbPath, 'SELECT * FROM runs')
    expect(runs).toHaveLength(1)
    expect(runs[0].flow).toBe('demo')
    expect(runs[0].platform).toBe('codex')
    expect(runs[0].status).toBe('ok')
    expect(JSON.parse(runs[0].result)).toEqual({ done: true })
    expect(runs[0].tokens_spent).toBe(7)
    expect(runs[0].started_at).toBeGreaterThan(0)
    expect(runs[0].ended_at).toBeGreaterThanOrEqual(runs[0].started_at)

    expect(read(dbPath, 'SELECT * FROM phases')[0].title).toBe('Analyze')
    expect(read(dbPath, 'SELECT * FROM events')[0].message).toBe('starting')

    const calls = read(dbPath, 'SELECT * FROM agent_calls')
    expect(calls).toHaveLength(1)
    expect(calls[0].label).toBe('a1')
    expect(calls[0].phase).toBe('Analyze')
    expect(calls[0].prompt).toBe('hello')
    expect(calls[0].response_text).toBe('world')
    expect(JSON.parse(calls[0].response_data)).toEqual({ ok: true })
    expect(calls[0].tokens).toBe(7)
    expect(calls[0].status).toBe('ok')
    expect(calls[0].duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('records an error finish', () => {
    const rec = openSqliteRecorder({ dbPath, flow: 'demo', platform: 'codex' })
    rec.finish({ status: 'error', error: 'boom' })
    rec.close()
    const runs = read(dbPath, 'SELECT * FROM runs')
    expect(runs[0].status).toBe('error')
    expect(runs[0].error).toBe('boom')
  })
})

describe('runFlowScript with a recorder', () => {
  const adapter: RunAdapter = {
    name: 'fake',
    supportsNativeSchema: false,
    async runAgent(req) { return { text: `R:${req.prompt}`, usage: { outputTokens: 3 } } },
  }
  const SCRIPT = `export const meta = { name: "s", description: "d" };
const __choros_run = async function () {
  phase("only");
  log("hi");
  const a = await agent("go", { label: "step1", phase: "only" });
  return { a };
};
return await __choros_run();
`

  it('captures the full run end to end', async () => {
    const rec = openSqliteRecorder({ dbPath, flow: 's', platform: 'fake' })
    const out = await runFlowScript({ script: SCRIPT, adapter, args: {}, cwd: dir, budget: null, recorder: rec, onLog: () => {}, onPhase: () => {} })
    expect(out).toEqual({ a: 'R:go' })

    const runs = read(dbPath, 'SELECT * FROM runs')
    expect(runs[0].status).toBe('ok')
    expect(runs[0].tokens_spent).toBe(3)
    const calls = read(dbPath, 'SELECT * FROM agent_calls')
    expect(calls).toHaveLength(1)
    expect(calls[0].label).toBe('step1')
    expect(calls[0].response_text).toBe('R:go')
    expect(calls[0].tokens).toBe(3)
    expect(read(dbPath, 'SELECT * FROM phases')[0].title).toBe('only')
  })

  it('records status=error when the workflow throws', async () => {
    const boom: RunAdapter = { name: 'b', supportsNativeSchema: false, async runAgent() { throw new Error('nope') } }
    const rec = openSqliteRecorder({ dbPath, flow: 's', platform: 'fake' })
    const script = `export const meta = { name: "s", description: "d" };
const __choros_run = async function () { return await agent("x", { label: "boom" }); };
return await __choros_run();
`
    await expect(runFlowScript({ script, adapter: boom, args: {}, cwd: dir, budget: null, recorder: rec, onLog: () => {}, onPhase: () => {} })).rejects.toThrow(/nope/)
    expect(read(dbPath, 'SELECT * FROM runs')[0].status).toBe('error')
    const calls = read(dbPath, 'SELECT * FROM agent_calls')
    expect(calls[0].status).toBe('error')
    expect(calls[0].error).toMatch(/nope/)
  })
})
