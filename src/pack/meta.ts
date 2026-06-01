import * as acorn from 'acorn'
import type { WorkflowMeta } from '../adapters/types.js'

export interface ExtractedMeta {
  value: WorkflowMeta
  source: string // the object-literal source text, e.g. "{ name: ... }"
  start: number  // offset of the object literal in the input
  end: number
  declStart: number // offset of the whole `export const meta = ...` statement
  declEnd: number
}

function parse(code: string): acorn.Program {
  return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as unknown as acorn.Program
}

export function extractMeta(code: string): ExtractedMeta {
  const ast = parse(code)
  for (const node of ast.body) {
    if (
      node.type === 'ExportNamedDeclaration' &&
      (node as any).declaration?.type === 'VariableDeclaration'
    ) {
      const decl = (node as any).declaration.declarations.find(
        (d: any) => d.id.type === 'Identifier' && d.id.name === 'meta',
      ) as any
      if (!decl) continue
      const init = decl.init
      if (!init || init.type !== 'ObjectExpression') {
        throw new Error('meta must be a pure literal object (no function calls or variables)')
      }
      const source = code.slice(init.start, init.end)
      // eslint-disable-next-line no-new-func
      const value = new Function(`return (${source})`)() as WorkflowMeta
      if (!value.name || typeof value.name !== 'string') {
        throw new Error('meta is missing a string "name"')
      }
      if (!value.description || typeof value.description !== 'string') {
        throw new Error('meta is missing a string "description"')
      }
      return {
        value,
        source,
        start: init.start,
        end: init.end,
        declStart: (node as any).start,
        declEnd: (node as any).end,
      }
    }
  }
  throw new Error('workflow entry must export a top-level `const meta` object literal')
}
