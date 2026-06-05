export function dur(ms: number | null | undefined): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function when(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

export function chipClass(status: string): 'pos' | 'neg' | 'neu' {
  if (status === 'ok') return 'pos'
  if (status === 'error') return 'neg'
  return 'neu'
}

export function pretty(json: string | null): string {
  if (json == null) return ''
  try {
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return json
  }
}
