import 'server-only'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type {
  RunRow, RunListItem, PhaseRow, EventRow, AgentCallRow, RunFilters, Stats,
} from './types'

// node:sqlite is a newer builtin; load via createRequire so the bundler leaves it alone.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

// node:sqlite returns rows with a null prototype; Next.js refuses to pass those
// to Client Components, so re-shape into plain objects.
const plain = <T>(rows: unknown[]): T[] => rows.map((r) => ({ ...(r as object) })) as T[]
const plainOne = <T>(r: unknown): T | undefined => (r ? ({ ...(r as object) } as T) : undefined)

/** Path to the choros run DB. Override with CHOROS_DB; defaults to ../.choros/runs.db. */
export function dbPath(): string {
  return process.env.CHOROS_DB ?? resolve(process.cwd(), '..', '.choros', 'runs.db')
}

function withDb<T>(fn: (db: InstanceType<typeof DatabaseSync>) => T, fallback: T): T {
  const path = dbPath()
  if (!existsSync(path)) return fallback
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return fn(db)
  } catch {
    return fallback
  } finally {
    db.close()
  }
}

export function listRuns(filters: RunFilters = {}): RunListItem[] {
  return withDb((db) => {
    const where: string[] = []
    const params: unknown[] = []
    if (filters.flow) { where.push('r.flow = ?'); params.push(filters.flow) }
    if (filters.platform) { where.push('r.platform = ?'); params.push(filters.platform) }
    if (filters.status) { where.push('r.status = ?'); params.push(filters.status) }
    if (filters.q) { where.push('(r.flow LIKE ? OR r.id LIKE ?)'); params.push(`%${filters.q}%`, `%${filters.q}%`) }
    const sql = `
      SELECT r.*,
        (SELECT COUNT(*) FROM agent_calls c WHERE c.run_id = r.id) AS agent_count,
        (SELECT COUNT(*) FROM agent_calls c WHERE c.run_id = r.id AND c.status = 'error') AS error_count,
        (r.ended_at - r.started_at) AS duration_ms
      FROM runs r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.started_at DESC`
    return plain<RunListItem>(db.prepare(sql).all(...(params as never[])))
  }, [])
}

export function getRun(id: string): RunRow | undefined {
  return withDb((db) => plainOne<RunRow>(db.prepare('SELECT * FROM runs WHERE id = ?').get(id)), undefined)
}

export function getPhases(runId: string): PhaseRow[] {
  return withDb((db) => plain<PhaseRow>(db.prepare('SELECT * FROM phases WHERE run_id = ? ORDER BY seq').all(runId)), [])
}

export function getAgentCalls(runId: string): AgentCallRow[] {
  return withDb(
    (db) => plain<AgentCallRow>(db.prepare('SELECT * FROM agent_calls WHERE run_id = ? ORDER BY COALESCE(started_at, 0), seq').all(runId)),
    [],
  )
}

export function getEvents(runId: string): EventRow[] {
  return withDb((db) => plain<EventRow>(db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY seq').all(runId)), [])
}

export function getStats(): Stats {
  return withDb((db) => {
    const r = db.prepare(`
      SELECT COUNT(*) total,
        SUM(CASE WHEN status='ok' THEN 1 ELSE 0 END) ok,
        SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) error,
        COALESCE(SUM(tokens_spent),0) totalTokens
      FROM runs`).get() as any
    const c = db.prepare('SELECT COUNT(*) n FROM agent_calls').get() as any
    return { total: r.total ?? 0, ok: r.ok ?? 0, error: r.error ?? 0, totalTokens: r.totalTokens ?? 0, totalAgentCalls: c.n ?? 0 }
  }, { total: 0, ok: 0, error: 0, totalTokens: 0, totalAgentCalls: 0 })
}

export function distinct(col: 'flow' | 'platform'): string[] {
  return withDb((db) => (db.prepare(`SELECT DISTINCT ${col} v FROM runs ORDER BY ${col}`).all() as any[]).map((r) => r.v), [])
}
