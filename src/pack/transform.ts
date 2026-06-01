import * as acorn from 'acorn'
import { extractMeta } from './meta.js'

function parse(code: string): acorn.Program {
  return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as acorn.Program
}

/** Cut [start,end) ranges out of `code`, processing from the end to keep offsets valid. */
function cutRanges(code: string, ranges: Array<{ start: number; end: number }>): string {
  const sorted = [...ranges].sort((a, b) => b.start - a.start)
  let out = code
  for (const r of sorted) out = out.slice(0, r.start) + out.slice(r.end)
  return out
}

export function toCanonicalScript(bundled: string): string {
  const meta = extractMeta(bundled)
  const ast = parse(bundled)

  const def = ast.body.find((n: any) => n.type === 'ExportDefaultDeclaration') as any
  if (!def) throw new Error('workflow entry must `export default` a run function')

  const declStart: number = def.declaration.start
  const declEnd: number = def.declaration.end
  // defSource is the function/class literal, or — if esbuild emits
  // `export default <identifier>` — just the identifier. In the latter case
  // that identifier's declaration still remains in `body`, so the output is
  // still valid and runnable.
  const defSource = bundled.slice(declStart, declEnd)

  // Remove the meta export and the default export from the body; keep deps + other code.
  const body = cutRanges(bundled, [
    { start: meta.declStart, end: meta.declEnd },
    { start: def.start, end: def.end },
  ]).trim()

  return [
    `export const meta = ${meta.source};`,
    body,
    `const __choros_run = ${defSource};`,
    `return await __choros_run();`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n') + '\n'
}
