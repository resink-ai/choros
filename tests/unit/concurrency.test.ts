import { describe, it, expect } from 'vitest'
import { makeParallel, makePipeline } from '../../src/runtime/concurrency.js'

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('makeParallel', () => {
  it('returns results in input order', async () => {
    const parallel = makeParallel(4)
    const out = await parallel([
      () => Promise.resolve('a'),
      async () => { await tick(); return 'b' },
      () => Promise.resolve('c'),
    ])
    expect(out).toEqual(['a', 'b', 'c'])
  })

  it('respects the concurrency cap', async () => {
    const parallel = makeParallel(2)
    let active = 0
    let peak = 0
    const make = () => async () => {
      active++; peak = Math.max(peak, active); await tick(); active--; return 1
    }
    await parallel([make(), make(), make(), make(), make()])
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('resolves a throwing thunk to null', async () => {
    const parallel = makeParallel(4)
    const out = await parallel([
      () => Promise.resolve('ok'),
      async () => { throw new Error('boom') },
    ])
    expect(out).toEqual(['ok', null])
  })
})

describe('makePipeline', () => {
  it('runs each item through all stages and passes (prev, original, index)', async () => {
    const pipeline = makePipeline(4)
    const seen: Array<[any, any, number]> = []
    const out = await pipeline(
      ['x', 'y'],
      (prev) => `${prev}1`,
      (prev, original, index) => { seen.push([prev, original, index]); return `${prev}-${original}-${index}` },
    )
    expect(out).toEqual(['x1-x-0', 'y1-y-1'])
    expect(seen[0]).toEqual(['x1', 'x', 0])
  })

  it('drops an item to null if a stage throws', async () => {
    const pipeline = makePipeline(4)
    const out = await pipeline(
      ['a', 'b'],
      (prev) => { if (prev === 'a') throw new Error('x'); return prev },
      (prev) => `${prev}!`,
    )
    expect(out).toEqual([null, 'b!'])
  })
})
