export interface Budget {
  total: number | null
  spent(): number
  remaining(): number
  add(tokens: number): void
}

export function createBudget(total: number | null): Budget {
  let used = 0
  return {
    total,
    spent: () => used,
    remaining: () => (total == null ? Infinity : Math.max(0, total - used)),
    add: (tokens: number) => {
      used += tokens > 0 ? tokens : 0
    },
  }
}
