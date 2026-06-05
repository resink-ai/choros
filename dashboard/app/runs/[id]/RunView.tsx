'use client'
import { useMemo, useState } from 'react'
import type { RunRow, PhaseRow, EventRow, AgentCallRow } from '@/lib/types'
import { dur, when, chipClass, pretty } from '@/lib/format'

type StatusFilter = 'all' | 'ok' | 'error'

interface Props {
  run: RunRow
  phases: PhaseRow[]
  calls: AgentCallRow[]
  events: EventRow[]
}

const PHASELESS = '(no phase)'

export function RunView({ run, phases, calls, events }: Props) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [openAll, setOpenAll] = useState(true)
  const [nonce, setNonce] = useState(0)

  function setAll(open: boolean) {
    setOpenAll(open)
    setNonce((n) => n + 1) // remount <details> so the new default applies
  }

  // Group calls + events by phase, preserving phase order; unknown phases go to (no phase).
  const groups = useMemo(() => {
    const order = [...phases.map((p) => p.title)]
    const seen = new Set(order)
    const phaseOf = (p: string | null) => (p && p.length ? p : PHASELESS)
    for (const c of calls) { const k = phaseOf(c.phase); if (!seen.has(k)) { seen.add(k); order.push(k) } }
    for (const e of events) { const k = phaseOf(e.phase); if (!seen.has(k)) { seen.add(k); order.push(k) } }
    return order.map((title) => ({
      title,
      calls: calls.filter((c) => phaseOf(c.phase) === title),
      events: events.filter((e) => phaseOf(e.phase) === title),
    }))
  }, [phases, calls, events])

  const needle = q.trim().toLowerCase()
  const matches = (c: AgentCallRow) => {
    if (status !== 'all' && c.status !== status) return false
    if (!needle) return true
    return [c.label, c.prompt, c.response_text, c.response_data, c.phase, c.model]
      .filter(Boolean)
      .some((s) => String(s).toLowerCase().includes(needle))
  }

  const visibleGroups = groups
    .map((g) => ({ ...g, calls: g.calls.filter(matches) }))
    .filter((g) => g.calls.length > 0 || (status === 'all' && !needle && g.events.length > 0))

  const totalTokens = calls.reduce((a, c) => a + (c.tokens ?? 0), 0)
  const errors = calls.filter((c) => c.status === 'error').length

  return (
    <div>
      <h1>{run.flow}</h1>
      <div className="row" style={{ margin: '4px 0 2px' }}>
        <span className={`chip ${chipClass(run.status)}`}>{run.status}</span>
        <span className="tag">{run.platform}</span>
        <span className="tag">{when(run.started_at)}</span>
      </div>
      <div className="kv" style={{ margin: '10px 0 4px' }}>
        <span>⏱ {dur(run.ended_at && run.started_at ? run.ended_at - run.started_at : null)}</span>
        <span>🤖 {calls.length} agent calls</span>
        <span>🪙 {totalTokens.toLocaleString()} tokens</span>
        <span>🧭 {phases.length} phases</span>
        {errors > 0 && <span style={{ color: 'var(--neg-fg)' }}>✗ {errors} errored</span>}
      </div>
      {run.status === 'error' && run.error && (
        <pre style={{ borderColor: 'var(--neg-bg)' }}>{run.error}</pre>
      )}

      <h2>Run detail</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="filter label / prompt / response…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        {(['all', 'ok', 'error'] as StatusFilter[]).map((s) => (
          <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>{s}</button>
        ))}
        <span className="spacer" />
        <button onClick={() => setAll(true)}>expand all</button>
        <button onClick={() => setAll(false)}>collapse all</button>
      </div>

      {visibleGroups.length === 0 && <div className="empty">No agent calls match the filter.</div>}

      {visibleGroups.map((g) => {
        const gErr = g.calls.filter((c) => c.status === 'error').length
        const maxDur = Math.max(1, ...g.calls.map((c) => c.duration_ms ?? 0))
        return (
          <details className="phase" key={`${g.title}-${nonce}`} open={openAll}>
            <summary>
              <span>{g.title}</span>
              <span className="spacer" />
              <span className="tag">{g.calls.length} calls{gErr ? ` · ${gErr} err` : ''}</span>
            </summary>
            <div className="body">
              {g.events.length > 0 && (
                <div className="kv" style={{ margin: '4px 0 10px', flexDirection: 'column', gap: 4 }}>
                  {g.events.map((e) => <span key={e.id}>📝 {e.message}</span>)}
                </div>
              )}
              {g.calls.map((c) => (
                <details className="card" key={`${c.id}-${nonce}`} open={openAll && c.status === 'error'}>
                  <summary>
                    <span className={`chip ${chipClass(c.status)}`}>{c.status}</span>
                    <span className="label">{c.label ?? `call #${c.id}`}</span>
                    <span className="spacer" />
                    <span className="tag">{dur(c.duration_ms)}{c.tokens != null ? ` · ${c.tokens} tok` : ''}{c.model ? ` · ${c.model}` : ''}</span>
                  </summary>
                  <div className="body">
                    <div className="bar"><span style={{ width: `${Math.round(((c.duration_ms ?? 0) / maxDur) * 100)}%` }} /></div>
                    {c.error && <><h4>error</h4><pre style={{ borderColor: 'var(--neg-bg)' }}>{c.error}</pre></>}
                    <h4>prompt</h4>
                    <pre>{c.prompt ?? ''}</pre>
                    {c.response_text && <><h4>response</h4><pre>{c.response_text}</pre></>}
                    {c.response_data && <><h4>parsed data</h4><pre>{pretty(c.response_data)}</pre></>}
                  </div>
                </details>
              ))}
            </div>
          </details>
        )
      })}

      <h2>Result</h2>
      <details className="card" open={false} key={`result-${nonce}`}>
        <summary><span className="label">final result</span><span className="spacer" /><span className="tag">{run.result ? `${run.result.length} chars` : 'none'}</span></summary>
        <div className="body"><pre>{run.result ? pretty(run.result) : '—'}</pre></div>
      </details>
      {run.args && (
        <details className="card" open={false} key={`args-${nonce}`}>
          <summary><span className="label">args</span></summary>
          <div className="body"><pre>{pretty(run.args)}</pre></div>
        </details>
      )}
    </div>
  )
}
