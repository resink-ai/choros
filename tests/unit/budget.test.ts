import { describe, it, expect } from 'vitest'
import { createBudget } from '../../src/runtime/budget.js'

describe('createBudget', () => {
  it('tracks spend and remaining with a total', () => {
    const b = createBudget(1000)
    expect(b.total).toBe(1000)
    expect(b.spent()).toBe(0)
    expect(b.remaining()).toBe(1000)
    b.add(300)
    b.add(200)
    expect(b.spent()).toBe(500)
    expect(b.remaining()).toBe(500)
  })

  it('reports Infinity remaining when total is null', () => {
    const b = createBudget(null)
    expect(b.total).toBeNull()
    b.add(999)
    expect(b.remaining()).toBe(Infinity)
  })

  it('never reports negative remaining', () => {
    const b = createBudget(100)
    b.add(250)
    expect(b.remaining()).toBe(0)
  })
})
