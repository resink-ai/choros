import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'

// node:sqlite is a newer Node builtin that bundlers (Vite/esbuild) don't yet
// recognize; load it through createRequire so resolution is deferred to Node.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

/**
 * Run observability recorder. The choros runtime emits phase / log / agent
 * events here; a SQLite-backed implementation persists them so a dashboard can
 * visualize each run. Recording must NEVER break a run — every write is guarded.
 */
export interface AgentStartInfo {
  label?: string
  phase?: string
  model?: string
  prompt: string
  schema?: Record<string, unknown>
}
export interface AgentEndInfo {
  status: 'ok' | 'error'
  responseText?: string
  responseData?: unknown
  tokens?: number
  error?: string
}
export interface FinishInfo {
  status: 'ok' | 'error'
  result?: unknown
  error?: string
  tokensSpent?: number
}

export interface RunRecorder {
  readonly runId: string
  phase(title: string): void
  log(message: string): void
  agentStart(info: AgentStartInfo): number
  agentEnd(id: number, info: AgentEndInfo): void
  finish(info: FinishInfo): void
  close(): void
}

/** No-op recorder used when recording is disabled. */
export const nullRecorder: RunRecorder = {
  runId: '',
  phase() {},
  log() {},
  agentStart() { return -1 },
  agentEnd() {},
  finish() {},
  close() {},
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, flow TEXT, platform TEXT, args TEXT,
  status TEXT, result TEXT, error TEXT,
  budget_total INTEGER, tokens_spent INTEGER,
  started_at INTEGER, ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT, title TEXT, seq INTEGER, started_at INTEGER
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT, phase TEXT, message TEXT, ts INTEGER, seq INTEGER
);
CREATE TABLE IF NOT EXISTS agent_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT, phase TEXT, label TEXT, seq INTEGER, model TEXT,
  prompt TEXT, schema TEXT, response_text TEXT, response_data TEXT,
  tokens INTEGER, status TEXT, error TEXT,
  started_at INTEGER, ended_at INTEGER, duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_calls_run ON agent_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_phases_run ON phases(run_id);
CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);
`

export interface OpenRecorderOptions {
  dbPath: string
  flow: string
  platform: string
  args?: unknown
  budgetTotal?: number | null
  now?: () => number
}

function jsonOrNull(v: unknown): string | null {
  if (v === undefined) return null
  try { return JSON.stringify(v) } catch { return null }
}

/** Open (or create) the SQLite DB and start a run row. */
export function openSqliteRecorder(opts: OpenRecorderOptions): RunRecorder {
  const now = opts.now ?? (() => Date.now())
  mkdirSync(dirname(opts.dbPath), { recursive: true })
  const db = new DatabaseSync(opts.dbPath)
  db.exec(SCHEMA)

  const runId = randomUUID()
  let seq = 0
  let currentPhase = ''
  let warned = false
  const warn = (e: unknown) => {
    if (warned) return
    warned = true
    process.stderr.write(`choros: run recording disabled (${e instanceof Error ? e.message : String(e)})\n`)
  }
  const safe = (fn: () => void) => { try { fn() } catch (e) { warn(e) } }

  db.prepare(
    `INSERT INTO runs (id, flow, platform, args, status, budget_total, tokens_spent, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, 0, ?)`,
  ).run(runId, opts.flow, opts.platform, jsonOrNull(opts.args), opts.budgetTotal ?? null, now())

  return {
    runId,
    phase(title) {
      safe(() => {
        currentPhase = title
        db.prepare(`INSERT INTO phases (run_id, title, seq, started_at) VALUES (?, ?, ?, ?)`)
          .run(runId, title, seq++, now())
      })
    },
    log(message) {
      safe(() => {
        db.prepare(`INSERT INTO events (run_id, phase, message, ts, seq) VALUES (?, ?, ?, ?, ?)`)
          .run(runId, currentPhase, message, now(), seq++)
      })
    },
    agentStart(info) {
      let id = -1
      safe(() => {
        const phase = info.phase ?? currentPhase
        const r = db.prepare(
          `INSERT INTO agent_calls (run_id, phase, label, seq, model, prompt, schema, status, started_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
        ).run(runId, phase, info.label ?? null, seq++, info.model ?? null, info.prompt, jsonOrNull(info.schema), now())
        id = Number(r.lastInsertRowid)
      })
      return id
    },
    agentEnd(id, info) {
      if (id < 0) return
      safe(() => {
        const ended = now()
        db.prepare(
          `UPDATE agent_calls
             SET status = ?, response_text = ?, response_data = ?, tokens = ?, error = ?,
                 ended_at = ?, duration_ms = ? - started_at
           WHERE id = ?`,
        ).run(
          info.status,
          info.responseText ?? null,
          jsonOrNull(info.responseData),
          info.tokens ?? null,
          info.error ?? null,
          ended,
          ended,
          id,
        )
      })
    },
    finish(info) {
      safe(() => {
        db.prepare(
          `UPDATE runs SET status = ?, result = ?, error = ?, tokens_spent = ?, ended_at = ? WHERE id = ?`,
        ).run(info.status, jsonOrNull(info.result), info.error ?? null, info.tokensSpent ?? 0, now(), runId)
      })
    },
    close() {
      safe(() => db.close())
    },
  }
}
