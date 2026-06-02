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

/**
 * Recursively verifies that an AST node is a pure literal value — i.e. it
 * contains only literal strings/numbers/booleans/null, arrays, objects, and
 * unary +/- applied to a literal.  No identifiers, call expressions, or other
 * dynamic nodes are allowed.
 *
 * Throws if any non-literal node is encountered.
 */
function assertPureLiteral(node: any): void {
  if (!node) return
  switch (node.type) {
    case 'Literal':
      return
    case 'UnaryExpression':
      if (node.operator !== '-' && node.operator !== '+') {
        throw new Error('meta must be a pure literal object (no function calls or variables)')
      }
      if (!node.argument || node.argument.type !== 'Literal') {
        throw new Error('meta must be a pure literal object (no function calls or variables)')
      }
      return
    case 'ArrayExpression':
      for (const element of (node.elements as any[])) {
        if (element != null) assertPureLiteral(element)
      }
      return
    case 'ObjectExpression':
      for (const prop of (node.properties as any[])) {
        if (prop.computed) {
          throw new Error('meta must be a pure literal object (no function calls or variables)')
        }
        const keyType = prop.key?.type
        if (keyType !== 'Identifier' && keyType !== 'Literal') {
          throw new Error('meta must be a pure literal object (no function calls or variables)')
        }
        assertPureLiteral(prop.value)
      }
      return
    default:
      throw new Error('meta must be a pure literal object (no function calls or variables)')
  }
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
      // Verify every value in the object is a pure literal before evaluating.
      assertPureLiteral(init)
      const source = code.slice(init.start, init.end)
      // new Function is safe here because assertPureLiteral has already
      // confirmed the source contains only literal-valued nodes.
      // eslint-disable-next-line no-new-func
      const value = new Function(`return (${source})`)() as WorkflowMeta
      if (typeof value.name !== 'string' || value.name.trim() === '') {
        throw new Error('meta.name must be a non-empty string')
      }
      if (typeof value.description !== 'string' || value.description.trim() === '') {
        throw new Error('meta.description must be a non-empty string')
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
