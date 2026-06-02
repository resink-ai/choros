// Ambient globals available inside a workflow's default-export run() function.
// Authors import nothing for these; pack leaves them as free identifiers and
// the choros runtime (or Claude's harness) injects them.
declare global {
  interface AgentOpts {
    label?: string
    phase?: string
    schema?: Record<string, unknown>
    model?: string
  }
  function agent(prompt: string, opts?: AgentOpts): Promise<any>
  function parallel<T>(thunks: Array<() => Promise<T> | T>): Promise<Array<T | null>>
  function pipeline(items: any[], ...stages: Array<(prev: any, original: any, index: number) => any>): Promise<any[]>
  function phase(title: string): void
  function log(message: string): void
  const args: any
  const cwd: string
  const budget: { total: number | null; spent(): number; remaining(): number }
}
export {}
