import Link from 'next/link'
import { listRuns, getStats, distinct } from '@/lib/db'
import { dur, when, chipClass } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type SP = Promise<{ flow?: string; platform?: string; status?: string; q?: string }>

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams
  const filters = { flow: sp.flow, platform: sp.platform, status: sp.status, q: sp.q }
  const runs = listRuns(filters)
  const stats = getStats()
  const flows = distinct('flow')
  const platforms = distinct('platform')

  return (
    <main>
      <p className="eyebrow">choros · run observability</p>
      <h1>Workflow runs</h1>
      <p className="muted">Every <code>choros run</code> is captured to SQLite — phases, agent conversations, results.</p>

      <div className="stats">
        <div className="stat"><div className="n">{stats.total}</div><div className="l">runs</div></div>
        <div className="stat"><div className="n" style={{ color: 'var(--pos-fg)' }}>{stats.ok}</div><div className="l">ok</div></div>
        <div className="stat"><div className="n" style={{ color: stats.error ? 'var(--neg-fg)' : undefined }}>{stats.error}</div><div className="l">error</div></div>
        <div className="stat"><div className="n">{stats.totalAgentCalls}</div><div className="l">agent calls</div></div>
        <div className="stat"><div className="n">{stats.totalTokens.toLocaleString()}</div><div className="l">tokens</div></div>
      </div>

      <form className="filters" method="get">
        <input name="q" placeholder="search flow / id…" defaultValue={sp.q ?? ''} />
        <select name="flow" defaultValue={sp.flow ?? ''}>
          <option value="">all flows</option>
          {flows.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ''}>
          <option value="">all platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ''}>
          <option value="">any status</option>
          <option value="ok">ok</option>
          <option value="error">error</option>
          <option value="running">running</option>
        </select>
        <button type="submit">Filter</button>
        <Link href="/" className="tag">reset</Link>
      </form>

      {runs.length === 0 ? (
        <div className="empty">No runs yet. Run <code>npm run seed</code> in the repo root, or do a <code>choros run</code>.</div>
      ) : (
        <table>
          <thead>
            <tr><th>flow</th><th>platform</th><th>status</th><th>agents</th><th>tokens</th><th>duration</th><th>started</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/runs/${r.id}`}>{r.flow}</Link></td>
                <td className="tag">{r.platform}</td>
                <td>
                  <span className={`chip ${chipClass(r.status)}`}>{r.status}</span>
                  {r.error_count > 0 && <span className="tag" style={{ marginLeft: 6 }}>{r.error_count} err</span>}
                </td>
                <td>{r.agent_count}</td>
                <td>{(r.tokens_spent ?? 0).toLocaleString()}</td>
                <td>{dur(r.duration_ms)}</td>
                <td className="tag">{when(r.started_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
