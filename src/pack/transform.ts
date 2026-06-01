import * as acorn from 'acorn'

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

/**
 * Convert an esbuild-bundled ESM string into the canonical Claude-format script.
 *
 * esbuild de-exports declarations and aggregates exports into one trailing
 * statement, e.g.:
 *     var meta = { ... };
 *     async function run() { ... }
 *     export { run as default, meta };
 *
 * We hoist meta to the top as `export const meta = <literal>`, drop the
 * aggregated export, keep all other (dependency + run) code, then alias the
 * default-exported binding to __choros_run and invoke it with a top-level
 * return. Aliasing the local binding handles both named and anonymous defaults.
 */
export function toCanonicalScript(bundled: string): string {
  const ast = parse(bundled)

  const agg = ast.body.find(
    (n: any) =>
      n.type === 'ExportNamedDeclaration' &&
      !n.declaration &&
      Array.isArray(n.specifiers) &&
      n.specifiers.length > 0,
  ) as any
  if (!agg) {
    throw new Error('bundled workflow has no aggregated export statement (expected esbuild output)')
  }

  const exportedName = (s: any): string =>
    s.exported.type === 'Identifier' ? s.exported.name : String(s.exported.value)
  const defaultSpec = agg.specifiers.find((s: any) => exportedName(s) === 'default')
  const metaSpec = agg.specifiers.find((s: any) => exportedName(s) === 'meta')
  if (!defaultSpec) throw new Error('workflow entry must `export default` a run function')
  if (!metaSpec) throw new Error('workflow entry must export a `meta` object literal')
  const defaultLocal: string = defaultSpec.local.name
  const metaLocal: string = metaSpec.local.name

  // Locate `var meta = {…}` to recover the literal source and its statement range.
  let metaInit: any
  let metaDeclRange: { start: number; end: number } | undefined
  for (const node of ast.body as any[]) {
    if (node.type === 'VariableDeclaration') {
      const d = node.declarations.find(
        (x: any) => x.id.type === 'Identifier' && x.id.name === metaLocal,
      )
      if (d && d.init) {
        metaInit = d.init
        metaDeclRange = { start: node.start, end: node.end }
        break
      }
    }
  }
  if (!metaInit || !metaDeclRange) {
    throw new Error('could not locate the meta object literal in the bundled output')
  }
  const metaSource = bundled.slice(metaInit.start, metaInit.end)

  const body = cutRanges(bundled, [metaDeclRange, { start: agg.start, end: agg.end }]).trim()

  return [
    `export const meta = ${metaSource};`,
    body,
    `const __choros_run = ${defaultLocal};`,
    `return await __choros_run();`,
  ]
    .filter((s) => s.length > 0)
    .join('\n\n') + '\n'
}
