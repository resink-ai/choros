import { cpus } from 'node:os'

export function defaultConcurrency(): number {
  return Math.min(16, Math.max(1, cpus().length - 2))
}

/** Run thunks with a concurrency cap, preserving input order; failures become null. */
export function makeParallel(cap: number) {
  return async function parallel<T>(thunks: Array<() => Promise<T> | T>): Promise<Array<T | null>> {
    const results = new Array<T | null>(thunks.length)
    let next = 0
    async function worker(): Promise<void> {
      while (true) {
        const i = next++
        if (i >= thunks.length) return
        try {
          results[i] = (await thunks[i]()) as T
        } catch {
          results[i] = null
        }
      }
    }
    const workers = Array.from({ length: Math.min(cap, thunks.length) }, () => worker())
    await Promise.all(workers)
    return results
  }
}

/** Fan each item through sequential stages independently; a throwing stage drops the item to null. */
export function makePipeline(cap: number) {
  const parallel = makeParallel(cap)
  return async function pipeline(
    items: any[],
    ...stages: Array<(prev: any, original: any, index: number) => any>
  ): Promise<any[]> {
    return parallel(
      items.map((original, index) => async () => {
        let prev: any = original
        for (const stage of stages) {
          prev = await stage(prev, original, index)
        }
        return prev
      }),
    )
  }
}
