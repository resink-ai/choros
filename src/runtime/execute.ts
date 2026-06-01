import type { WorkflowGlobals } from './globals.js'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as {
  new (...args: string[]): (...a: unknown[]) => Promise<unknown>
}

/**
 * Execute a canonical Claude-format script (top-level `export const meta`,
 * top-level await, trailing `return`) by stripping the `export` keyword and
 * wrapping the body in an AsyncFunction with the workflow globals injected.
 */
export async function executeCanonicalScript(script: string, g: WorkflowGlobals): Promise<unknown> {
  // The only top-level `export` in a canonical script is `export const meta`.
  const body = script.replace(/^\s*export\s+const\s+meta/m, 'const meta')
  const fn = new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'cwd', 'budget', body)
  return fn(g.agent, g.parallel, g.pipeline, g.phase, g.log, g.args, g.cwd, g.budget)
}
