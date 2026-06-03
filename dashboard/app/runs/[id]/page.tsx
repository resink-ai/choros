import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getRun, getPhases, getAgentCalls, getEvents } from '@/lib/db'
import { RunView } from './RunView'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = getRun(id)
  if (!run) notFound()

  const phases = getPhases(id)
  const calls = getAgentCalls(id)
  const events = getEvents(id)

  return (
    <main>
      <p className="eyebrow"><Link href="/">← all runs</Link></p>
      <RunView run={run} phases={phases} calls={calls} events={events} />
    </main>
  )
}
