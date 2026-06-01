# choros Cross-Platform Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `choros`, a TypeScript CLI that bundles modular workflow components into one self-contained Claude `Workflow` script (`pack`) and executes that same script on non-Claude agents by injecting the workflow globals and shelling out to the agent's CLI (`run`).

**Architecture:** Authors write a workflow as ESM modules — an entry that exports a pure-literal `meta` and a `export default async function run()`, importing `./schemas`, `./prompts`, `./phases`. `pack` uses esbuild to inline imports, then an acorn transform hoists `meta` to the top and rewrites the default export into the Claude top-level-return format (the canonical artifact). Claude runs that natively; `choros run` loads it, strips `export`, wraps it in an `AsyncFunction` with `agent/parallel/pipeline/phase/log/args/budget/cwd` injected, and dispatches `agent()` to a per-platform `RunAdapter` (codex in v1).

**Tech Stack:** TypeScript on Node 22, esbuild (bundling), acorn (AST transform), ajv (schema validation), vitest (tests), tsup (CLI build), `node:util` parseArgs, `node:child_process` spawn.

**Test tiers:**
- **Unit** (`npm test`) — fast, fully mocked, no network/binaries.
- **E2E** (`npm run test:e2e`) — full pack→run loop in-process against a fake `codex` stub binary; deterministic, no tokens.
- **Acceptance** (`npm run test:acceptance`) — gated by env. *Structural* acceptance (no tokens) validates real packed artifacts; *live* acceptance (`CHOROS_ACCEPTANCE_LIVE=1`) runs a real workflow through the real `codex` CLI.

---

## File Structure

**choros tooling (`src/`):**
- `src/cli/index.ts` — bin entry; parse argv; dispatch `pack` / `run`.
- `src/cli/args.ts` — pure arg-parsing helpers (testable without process).
- `src/pack/meta.ts` — locate + validate the `meta` literal via acorn.
- `src/pack/transform.ts` — acorn transform: hoist meta, unwrap default export → canonical script.
- `src/pack/bundle.ts` — esbuild wrapper: flow entry → inlined ESM string.
- `src/pack/index.ts` — `resolveFlow()`, `packFlow()` orchestration.
- `src/adapters/types.ts` — `PackTarget`, `RunAdapter`, `RunAgentRequest`, `TokenUsage`, `WorkflowMeta`.
- `src/adapters/claude.ts` — Claude `PackTarget.finalize`.
- `src/adapters/codex.ts` — Codex `RunAdapter.runAgent` (spawn + schema retry).
- `src/adapters/registry.ts` — name → adapter lookup.
- `src/schema/validate.ts` — `extractJson()`, ajv `validate()`.
- `src/runtime/budget.ts` — budget tracker.
- `src/runtime/concurrency.ts` — semaphore + `parallel()` + `pipeline()`.
- `src/runtime/globals.ts` — assemble the globals object from an adapter + args + budget.
- `src/runtime/execute.ts` — strip export, wrap canonical script in AsyncFunction, run.
- `src/runtime/index.ts` — `runFlow()` orchestration.
- `globals.d.ts` — ambient global types for workflow authors.

**Workflows:**
- `workflows/trading-agents/` — componentized port of `local/trading-agents.workflow.js` (acceptance driver).

**Tests & fixtures:**
- `tests/fixtures/flows/hello-fan/` — tiny deterministic flow (entry + schema).
- `tests/fixtures/bin/codex-stub.mjs` — fake `codex` binary for E2E.
- `tests/unit/*.test.ts`, `tests/e2e/*.e2e.test.ts`, `tests/acceptance/*.accept.test.ts`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (append)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "choros",
  "version": "0.1.0",
  "type": "module",
  "bin": { "choros": "dist/cli/index.js" },
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "tsup src/cli/index.ts --format esm --target node22 --out-dir dist/cli",
    "typecheck": "tsc --noEmit",
    "test": "vitest run tests/unit",
    "test:e2e": "vitest run tests/e2e",
    "test:acceptance": "vitest run tests/acceptance"
  },
  "dependencies": {
    "acorn": "^8.12.0",
    "ajv": "^8.17.0",
    "esbuild": "^0.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"],
    "lib": ["ES2023"]
  },
  "include": ["src", "tests", "globals.d.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,e2e.test,accept.test}.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
```

- [ ] **Step 4: Append build outputs to `.gitignore`**

Add these lines to `.gitignore`:

```
dist/
node_modules/
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: dependencies install; `node_modules/` created; exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold choros TypeScript CLI project"
```

---

## Task 2: Shared adapter & meta types

**Files:**
- Create: `src/adapters/types.ts`
- Create: `globals.d.ts`
- Test: `tests/unit/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/types.test.ts
import { describe, it, expect } from 'vitest'
import type { WorkflowMeta, RunAgentRequest, TokenUsage } from '../../src/adapters/types.js'

describe('adapter types', () => {
  it('shapes compile and accept expected fields', () => {
    const meta: WorkflowMeta = { name: 'x', description: 'y' }
    const usage: TokenUsage = { outputTokens: 10 }
    const req: RunAgentRequest = { prompt: 'hi', cwd: '/tmp', label: 'a' }
    expect(meta.name).toBe('x')
    expect(usage.outputTokens).toBe(10)
    expect(req.prompt).toBe('hi')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: FAIL — cannot find module `src/adapters/types.js`.

- [ ] **Step 3: Create `src/adapters/types.ts`**

```ts
export interface WorkflowMeta {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string; detail?: string; model?: string }>
  model?: string
}

export interface TokenUsage {
  outputTokens: number
}

export interface RunAgentRequest {
  prompt: string
  cwd: string
  schema?: Record<string, unknown>
  model?: string
  label?: string
}

export interface RunAgentResult {
  text: string
  data?: unknown
  usage?: TokenUsage
}

export interface PackTarget {
  name: string
  /** Final platform-specific touches on the canonical script (header, etc.). */
  finalize(canonicalScript: string, meta: WorkflowMeta): string
}

export interface RunAdapter {
  name: string
  supportsNativeSchema: boolean
  runAgent(req: RunAgentRequest): Promise<RunAgentResult>
}
```

- [ ] **Step 4: Create `globals.d.ts`**

```ts
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
  function parallel<T>(thunks: Array<() => Promise<T>>): Promise<Array<T | null>>
  function pipeline(items: any[], ...stages: Array<(prev: any, original: any, index: number) => any>): Promise<any[]>
  function phase(title: string): void
  function log(message: string): void
  const args: any
  const cwd: string
  const budget: { total: number | null; spent(): number; remaining(): number }
}
export {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/types.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/types.ts globals.d.ts tests/unit/types.test.ts
git commit -m "feat: add adapter/meta types and workflow global declarations"
```

---

## Task 3: Meta extraction & validation (acorn)

**Files:**
- Create: `src/pack/meta.ts`
- Test: `tests/unit/meta.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/meta.test.ts
import { describe, it, expect } from 'vitest'
import { extractMeta } from '../../src/pack/meta.js'

const GOOD = `
export const meta = { name: 'demo', description: 'a demo', phases: [{ title: 'A' }] }
export default async function run() { return 1 }
`

describe('extractMeta', () => {
  it('returns the meta literal source and parsed object', () => {
    const r = extractMeta(GOOD)
    expect(r.value.name).toBe('demo')
    expect(r.value.description).toBe('a demo')
    expect(r.source.startsWith('{')).toBe(true)
    expect(r.start).toBeGreaterThan(0)
    expect(r.end).toBeGreaterThan(r.start)
  })

  it('throws when meta is missing', () => {
    expect(() => extractMeta(`export default async function run(){}`))
      .toThrow(/meta/i)
  })

  it('throws when meta is not an object literal', () => {
    expect(() => extractMeta(`export const meta = makeMeta()\nexport default async function run(){}`))
      .toThrow(/pure literal/i)
  })

  it('throws when name or description missing', () => {
    expect(() => extractMeta(`export const meta = { name: 'x' }\nexport default async function run(){}`))
      .toThrow(/description/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/meta.test.ts`
Expected: FAIL — cannot find module `src/pack/meta.js`.

- [ ] **Step 3: Create `src/pack/meta.ts`**

```ts
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
      node.declaration?.type === 'VariableDeclaration'
    ) {
      const decl = node.declaration.declarations.find(
        (d: any) => d.id.type === 'Identifier' && d.id.name === 'meta',
      ) as any
      if (!decl) continue
      const init = decl.init
      if (!init || init.type !== 'ObjectExpression') {
        throw new Error('meta must be a pure object literal (no function calls or variables)')
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/meta.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/pack/meta.ts tests/unit/meta.test.ts
git commit -m "feat: extract and validate workflow meta literal via acorn"
```

---

## Task 4: Canonical-script transform (hoist meta, unwrap default export)

**Files:**
- Create: `src/pack/transform.ts`
- Test: `tests/unit/transform.test.ts`

This transform takes a **bundled ESM string** (meta + default export + inlined deps, no imports) and returns the canonical Claude-format script: `meta` first, deps next, then `const __choros_run = <default>;` and `return await __choros_run()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/transform.test.ts
import { describe, it, expect } from 'vitest'
import { toCanonicalScript } from '../../src/pack/transform.js'

const BUNDLED = `
var SCHEMA = { type: "object" };
export const meta = { name: "demo", description: "d" };
export default async function run() {
  const x = await agent("hi", { schema: SCHEMA });
  return { x };
}
`

describe('toCanonicalScript', () => {
  const out = toCanonicalScript(BUNDLED)

  it('begins with the meta literal export', () => {
    expect(out.trimStart().startsWith('export const meta = {')).toBe(true)
  })

  it('keeps inlined dependency code', () => {
    expect(out).toContain('var SCHEMA = { type: "object" }')
  })

  it('rewrites default export into a named run binding', () => {
    expect(out).toContain('const __choros_run =')
    expect(out).not.toContain('export default')
  })

  it('appends a top-level return call', () => {
    expect(out.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('handles anonymous default function expression', () => {
    const anon = `export const meta = { name: "a", description: "b" }\nexport default async function () { return 7 }`
    const r = toCanonicalScript(anon)
    expect(r).toContain('const __choros_run = async function')
    expect(r).toContain('return await __choros_run();')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transform.test.ts`
Expected: FAIL — cannot find module `src/pack/transform.js`.

- [ ] **Step 3: Create `src/pack/transform.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transform.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/pack/transform.ts tests/unit/transform.test.ts
git commit -m "feat: transform bundled ESM into canonical Claude-format script"
```

---

## Task 5: esbuild bundler

**Files:**
- Create: `src/pack/bundle.ts`
- Create: `tests/fixtures/flows/hello-fan/workflow.js`
- Create: `tests/fixtures/flows/hello-fan/schemas/hello.js`
- Test: `tests/unit/bundle.test.ts`

- [ ] **Step 1: Create the fixture flow entry**

```js
// tests/fixtures/flows/hello-fan/workflow.js
import { HELLO_SCHEMA } from './schemas/hello.js'

export const meta = {
  name: 'hello-fan',
  description: 'Two greeters run in parallel and a summarizer combines them',
  phases: [{ title: 'Greet' }, { title: 'Summarize' }],
}

export default async function run() {
  phase('Greet')
  const names = (args && args.names) || ['Ada', 'Linus']
  const greetings = await parallel(
    names.map((n) => () =>
      agent(`Greet ${n} in one short sentence.`, { label: `greet:${n}`, schema: HELLO_SCHEMA }),
    ),
  )
  phase('Summarize')
  const summary = await agent(
    `Summarize these greetings in one line: ${JSON.stringify(greetings)}`,
    { label: 'summarize' },
  )
  log(`done: ${names.length} greeted`)
  return { greetings, summary }
}
```

- [ ] **Step 2: Create the fixture schema**

```js
// tests/fixtures/flows/hello-fan/schemas/hello.js
export const HELLO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    greeting: { type: 'string' },
  },
  required: ['name', 'greeting'],
}
```

- [ ] **Step 3: Write the failing test**

```ts
// tests/unit/bundle.test.ts
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { bundleEntry } from '../../src/pack/bundle.js'

const entry = fileURLToPath(new URL('../fixtures/flows/hello-fan/workflow.js', import.meta.url))

describe('bundleEntry', () => {
  it('inlines imports into a single self-contained ESM string', async () => {
    const code = await bundleEntry(entry)
    expect(code).toContain('export const meta')
    expect(code).toContain('export default')
    // The imported schema must be inlined, not left as an import.
    expect(code).toContain('additionalProperties')
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toMatch(/require\(/)
    // Globals must remain free identifiers (not resolved/renamed away).
    expect(code).toContain('agent(')
    expect(code).toContain('parallel(')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/unit/bundle.test.ts`
Expected: FAIL — cannot find module `src/pack/bundle.js`.

- [ ] **Step 5: Create `src/pack/bundle.ts`**

```ts
import { build } from 'esbuild'

/** Bundle a workflow entry into a single self-contained ESM string (imports inlined). */
export async function bundleEntry(entryPath: string): Promise<string> {
  const result = await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
  })
  const file = result.outputFiles?.[0]
  if (!file) throw new Error(`esbuild produced no output for ${entryPath}`)
  return file.text
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/bundle.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pack/bundle.ts tests/fixtures/flows/hello-fan tests/unit/bundle.test.ts
git commit -m "feat: add esbuild bundler and hello-fan fixture flow"
```

---

## Task 6: Claude PackTarget, adapter registry, and packFlow

**Files:**
- Create: `src/adapters/claude.ts`
- Create: `src/adapters/codex.ts` (registry stub for now; full impl in Task 11)
- Create: `src/adapters/registry.ts`
- Create: `src/pack/index.ts`
- Test: `tests/unit/pack.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/pack.test.ts
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'

const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))

describe('packFlow (claude)', () => {
  it('produces a meta-first, self-contained canonical script', async () => {
    const { script, meta } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    expect(meta.name).toBe('hello-fan')
    expect(script.trimStart().startsWith('export const meta = {')).toBe(true)
    expect(script).not.toMatch(/^\s*import\s/m)
    expect(script).not.toContain('export default')
    expect(script.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('throws a clear error for an unknown flow', async () => {
    await expect(packFlow({ flow: 'nope', platform: 'claude', flowsDir }))
      .rejects.toThrow(/flow "nope" not found/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/pack.test.ts`
Expected: FAIL — cannot find module `src/pack/index.js`.

- [ ] **Step 3: Create `src/adapters/claude.ts`**

```ts
import type { PackTarget, WorkflowMeta } from './types.js'

export const claudePackTarget: PackTarget = {
  name: 'claude',
  finalize(canonicalScript: string, _meta: WorkflowMeta): string {
    // Claude runs the canonical script as-is. Reserved for future install-time
    // touches (slash-command registration handled separately by --install).
    return canonicalScript
  },
}
```

- [ ] **Step 4: Create `src/adapters/codex.ts` (stub; full runAgent in Task 11)**

```ts
import type { RunAdapter, RunAgentRequest, RunAgentResult } from './types.js'

export const codexRunAdapter: RunAdapter = {
  name: 'codex',
  supportsNativeSchema: false,
  async runAgent(_req: RunAgentRequest): Promise<RunAgentResult> {
    throw new Error('codex runAgent not implemented yet')
  },
}
```

- [ ] **Step 5: Create `src/adapters/registry.ts`**

```ts
import type { PackTarget, RunAdapter } from './types.js'
import { claudePackTarget } from './claude.js'
import { codexRunAdapter } from './codex.js'

const PACK_TARGETS: Record<string, PackTarget> = {
  claude: claudePackTarget,
}

const RUN_ADAPTERS: Record<string, RunAdapter> = {
  codex: codexRunAdapter,
}

export function getPackTarget(name: string): PackTarget {
  const t = PACK_TARGETS[name]
  if (!t) throw new Error(`no pack target for platform "${name}" (have: ${Object.keys(PACK_TARGETS).join(', ')})`)
  return t
}

export function getRunAdapter(name: string): RunAdapter {
  const a = RUN_ADAPTERS[name]
  if (!a) throw new Error(`no run adapter for platform "${name}" (have: ${Object.keys(RUN_ADAPTERS).join(', ')})`)
  return a
}
```

- [ ] **Step 6: Create `src/pack/index.ts`**

```ts
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { bundleEntry } from './bundle.js'
import { toCanonicalScript } from './transform.js'
import { extractMeta } from './meta.js'
import { getPackTarget } from '../adapters/registry.js'
import type { WorkflowMeta } from '../adapters/types.js'

export function resolveFlow(flow: string, flowsDir: string): string {
  const dir = resolve(flowsDir, flow)
  for (const name of ['workflow.js', 'workflow.ts', 'index.js', 'index.ts']) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`flow "${flow}" not found under ${flowsDir} (looked for workflow.js/ts, index.js/ts)`)
}

export interface PackOptions {
  flow: string
  platform: string
  flowsDir: string
}

export interface PackResult {
  script: string
  meta: WorkflowMeta
}

export async function packFlow(opts: PackOptions): Promise<PackResult> {
  const entry = resolveFlow(opts.flow, opts.flowsDir)
  const bundled = await bundleEntry(entry)
  const canonical = toCanonicalScript(bundled)
  const meta = extractMeta(canonical).value
  const target = getPackTarget(opts.platform)
  return { script: target.finalize(canonical, meta), meta }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/unit/pack.test.ts`
Expected: PASS (both cases).

- [ ] **Step 8: Commit**

```bash
git add src/adapters src/pack/index.ts tests/unit/pack.test.ts
git commit -m "feat: claude pack target, adapter registry, and packFlow orchestration"
```

---

## Task 7: CLI arg parsing + `pack` command

**Files:**
- Create: `src/cli/args.ts`
- Create: `src/cli/index.ts`
- Test: `tests/unit/args.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/args.test.ts
import { describe, it, expect } from 'vitest'
import { parseCli } from '../../src/cli/args.js'

describe('parseCli', () => {
  it('parses pack with platform and flow', () => {
    const r = parseCli(['pack', '--platform', 'claude', '--flow', 'trading-agents'])
    expect(r).toEqual({ command: 'pack', platform: 'claude', flow: 'trading-agents', out: undefined, install: false })
  })

  it('parses run with flow-script, args json, and budget', () => {
    const r = parseCli(['run', '--platform', 'codex', '--flow-script', 'a.js', '--args', '{"x":1}', '--budget', '500000'])
    expect(r).toEqual({
      command: 'run', platform: 'codex', flow: undefined, flowScript: 'a.js',
      args: { x: 1 }, budget: 500000,
    })
  })

  it('throws on unknown command', () => {
    expect(() => parseCli(['frobnicate'])).toThrow(/unknown command/i)
  })

  it('throws when run has neither --flow nor --flow-script', () => {
    expect(() => parseCli(['run', '--platform', 'codex'])).toThrow(/--flow or --flow-script/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/args.test.ts`
Expected: FAIL — cannot find module `src/cli/args.js`.

- [ ] **Step 3: Create `src/cli/args.ts`**

```ts
import { parseArgs } from 'node:util'

export type PackArgs = {
  command: 'pack'
  platform: string
  flow: string
  out: string | undefined
  install: boolean
}

export type RunArgs = {
  command: 'run'
  platform: string
  flow: string | undefined
  flowScript: string | undefined
  args: unknown
  budget: number | null
}

export type CliArgs = PackArgs | RunArgs

export function parseCli(argv: string[]): CliArgs {
  const [command, ...rest] = argv
  if (command === 'pack') {
    const { values } = parseArgs({
      args: rest,
      options: {
        platform: { type: 'string' },
        flow: { type: 'string' },
        out: { type: 'string' },
        install: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    })
    if (!values.platform) throw new Error('pack requires --platform')
    if (!values.flow) throw new Error('pack requires --flow')
    return { command: 'pack', platform: values.platform, flow: values.flow, out: values.out, install: !!values.install }
  }
  if (command === 'run') {
    const { values } = parseArgs({
      args: rest,
      options: {
        platform: { type: 'string' },
        flow: { type: 'string' },
        'flow-script': { type: 'string' },
        args: { type: 'string' },
        budget: { type: 'string' },
      },
      allowPositionals: false,
    })
    if (!values.platform) throw new Error('run requires --platform')
    if (!values.flow && !values['flow-script']) throw new Error('run requires --flow or --flow-script')
    return {
      command: 'run',
      platform: values.platform,
      flow: values.flow,
      flowScript: values['flow-script'],
      args: values.args ? JSON.parse(values.args) : undefined,
      budget: values.budget ? Number(values.budget) : null,
    }
  }
  throw new Error(`unknown command "${command ?? ''}" (expected: pack | run)`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/args.test.ts`
Expected: PASS (all 4 cases).

- [ ] **Step 5: Create `src/cli/index.ts` (pack wired; run wired in Task 14)**

```ts
#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseCli } from './args.js'
import { packFlow } from '../pack/index.js'

async function main(): Promise<void> {
  const parsed = parseCli(process.argv.slice(2))

  if (parsed.command === 'pack') {
    const flowsDir = resolve(process.cwd(), 'workflows')
    const { script } = await packFlow({ flow: parsed.flow, platform: parsed.platform, flowsDir })
    const out = parsed.out ?? resolve(process.cwd(), 'dist', `${parsed.flow}.${parsed.platform}.workflow.js`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, script, 'utf8')
    process.stdout.write(`${out}\n`)
    return
  }

  // parsed.command === 'run' — implemented in Task 14.
  throw new Error('run command not implemented yet')
}

main().catch((err) => {
  process.stderr.write(`choros: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
```

- [ ] **Step 6: Run typecheck and the pack-command smoke**

Run: `npm run typecheck`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/cli tests/unit/args.test.ts
git commit -m "feat: CLI arg parsing and pack command"
```

---

## Task 8: Budget tracker

**Files:**
- Create: `src/runtime/budget.ts`
- Test: `tests/unit/budget.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/budget.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/budget.test.ts`
Expected: FAIL — cannot find module `src/runtime/budget.js`.

- [ ] **Step 3: Create `src/runtime/budget.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/budget.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/budget.ts tests/unit/budget.test.ts
git commit -m "feat: add token budget tracker"
```

---

## Task 9: Concurrency — semaphore, parallel, pipeline

**Files:**
- Create: `src/runtime/concurrency.ts`
- Test: `tests/unit/concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/concurrency.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/concurrency.test.ts`
Expected: FAIL — cannot find module `src/runtime/concurrency.js`.

- [ ] **Step 3: Create `src/runtime/concurrency.ts`**

```ts
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
```

Note: in `parallel`, a thunk that throws becomes `null`; in `pipeline`, a stage that throws makes the item's worker throw, which `makeParallel` catches → `null`. This matches the documented Claude semantics.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/concurrency.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/concurrency.ts tests/unit/concurrency.test.ts
git commit -m "feat: concurrency-capped parallel and pipeline primitives"
```

---

## Task 10: Schema validation — extractJson + ajv validate

**Files:**
- Create: `src/schema/validate.ts`
- Test: `tests/unit/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/validate.test.ts
import { describe, it, expect } from 'vitest'
import { extractJson, validate } from '../../src/schema/validate.js'

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: { name: { type: 'string' } },
  required: ['name'],
}

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    expect(extractJson('{"name":"x"}')).toEqual({ name: 'x' })
  })

  it('extracts JSON from a fenced code block', () => {
    const text = 'Here:\n```json\n{ "name": "y" }\n```\nthanks'
    expect(extractJson(text)).toEqual({ name: 'y' })
  })

  it('extracts the last balanced object from surrounding prose', () => {
    expect(extractJson('blah { "name": "z" } end')).toEqual({ name: 'z' })
  })

  it('throws when no JSON object is present', () => {
    expect(() => extractJson('no json here')).toThrow(/no json/i)
  })
})

describe('validate', () => {
  it('returns ok for valid data', () => {
    expect(validate({ name: 'x' }, SCHEMA)).toEqual({ ok: true, data: { name: 'x' } })
  })

  it('returns errors for invalid data', () => {
    const r = validate({ nope: 1 }, SCHEMA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toMatch(/name/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL — cannot find module `src/schema/validate.js`.

- [ ] **Step 3: Create `src/schema/validate.ts`**

```ts
import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, strict: false })

/** Pull a JSON object out of model output: bare, fenced, or embedded in prose. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim()
  // 1) Fenced ```json ... ``` or ``` ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fence) candidates.push(fence[1].trim())
  candidates.push(trimmed)
  // 2) Last balanced {...} in the string.
  const balanced = lastBalancedObject(trimmed)
  if (balanced) candidates.push(balanced)

  for (const c of candidates) {
    try {
      const v = JSON.parse(c)
      if (v && typeof v === 'object') return v
    } catch {
      /* try next */
    }
  }
  throw new Error('no JSON object found in agent output')
}

function lastBalancedObject(s: string): string | null {
  let depth = 0
  let start = -1
  let best: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) best = s.slice(start, i + 1)
    }
  }
  return best
}

export type ValidateResult =
  | { ok: true; data: unknown }
  | { ok: false; errors: string }

export function validate(data: unknown, schema: Record<string, unknown>): ValidateResult {
  const fn = ajv.compile(schema)
  if (fn(data)) return { ok: true, data }
  return { ok: false, errors: ajv.errorsText(fn.errors, { separator: '; ' }) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS (all 6 cases).

- [ ] **Step 5: Commit**

```bash
git add src/schema/validate.ts tests/unit/validate.test.ts
git commit -m "feat: JSON extraction and ajv schema validation"
```

---

## Task 11: Codex run adapter (spawn + schema retry)

**Files:**
- Modify: `src/adapters/codex.ts`
- Create: `tests/fixtures/bin/codex-stub.mjs`
- Test: `tests/unit/codex.test.ts`

The adapter spawns the codex binary (name from `CHOROS_CODEX_BIN`, default `codex`) as `codex exec` with the prompt on stdin, captures stdout, and — when a schema is requested and native structured output is unavailable — runs an extract→validate→retry loop.

- [ ] **Step 1: Create the fake codex stub**

```js
// tests/fixtures/bin/codex-stub.mjs
#!/usr/bin/env node
// Mimics `codex exec`: reads the prompt from stdin and prints a canned reply.
// Behavior is driven by markers in the prompt so tests are deterministic.
import { readFileSync } from 'node:fs'

const prompt = readFileSync(0, 'utf8')

if (prompt.includes('RETURN_INVALID_THEN_VALID')) {
  // First attempt: invalid (missing required "name"). Retry preamble flips it valid.
  if (prompt.includes('Previous attempt failed validation')) {
    process.stdout.write('```json\n{ "name": "ok", "greeting": "hi" }\n```\n')
  } else {
    process.stdout.write('```json\n{ "greeting": "hi" }\n```\n')
  }
} else if (prompt.includes('RETURN_SCHEMA_OBJECT')) {
  process.stdout.write('Sure!\n```json\n{ "name": "Ada", "greeting": "Hello Ada" }\n```\n')
} else {
  process.stdout.write('plain text reply\n')
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/codex.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const stub = fileURLToPath(new URL('../fixtures/bin/codex-stub.mjs', import.meta.url))

beforeAll(() => {
  chmodSync(stub, 0o755)
  process.env.CHOROS_CODEX_BIN = process.execPath // run the stub with node
  process.env.CHOROS_CODEX_ARGS_PREFIX = JSON.stringify([stub, 'exec'])
})

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { name: { type: 'string' }, greeting: { type: 'string' } },
  required: ['name', 'greeting'],
}

describe('codexRunAdapter.runAgent', () => {
  it('returns plain text when no schema is given', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'say hi', cwd: process.cwd() })
    expect(r.text).toContain('plain text reply')
    expect(r.data).toBeUndefined()
  })

  it('returns validated data when a schema is given', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'RETURN_SCHEMA_OBJECT', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'Ada', greeting: 'Hello Ada' })
  })

  it('retries on validation failure and succeeds', async () => {
    const r = await codexRunAdapter.runAgent({ prompt: 'RETURN_INVALID_THEN_VALID', cwd: process.cwd(), schema: SCHEMA })
    expect(r.data).toEqual({ name: 'ok', greeting: 'hi' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/codex.test.ts`
Expected: FAIL — `codex runAgent not implemented yet`.

- [ ] **Step 4: Implement `src/adapters/codex.ts`**

```ts
import { spawn } from 'node:child_process'
import type { RunAdapter, RunAgentRequest, RunAgentResult } from './types.js'
import { extractJson, validate } from '../schema/validate.js'

const MAX_SCHEMA_RETRIES = 3

function codexCommand(): { bin: string; argsPrefix: string[] } {
  const bin = process.env.CHOROS_CODEX_BIN || 'codex'
  const prefix = process.env.CHOROS_CODEX_ARGS_PREFIX
    ? (JSON.parse(process.env.CHOROS_CODEX_ARGS_PREFIX) as string[])
    : ['exec']
  return { bin, argsPrefix: prefix }
}

function runCodexOnce(prompt: string, cwd: string): Promise<string> {
  const { bin, argsPrefix } = codexCommand()
  return new Promise((resolve, reject) => {
    const child = spawn(bin, argsPrefix, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', (e) =>
      reject(new Error(`failed to spawn "${bin}": ${e.message} (is it on PATH?)`)),
    )
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${bin} exited with code ${code}: ${err.trim() || out.trim()}`))
    })
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function schemaPrompt(prompt: string, schema: Record<string, unknown>): string {
  return `${prompt}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`
}

export const codexRunAdapter: RunAdapter = {
  name: 'codex',
  supportsNativeSchema: false,
  async runAgent(req: RunAgentRequest): Promise<RunAgentResult> {
    if (!req.schema) {
      const text = await runCodexOnce(req.prompt, req.cwd)
      return { text }
    }

    let prompt = schemaPrompt(req.prompt, req.schema)
    let lastErr = ''
    for (let attempt = 1; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
      const text = await runCodexOnce(prompt, req.cwd)
      try {
        const parsed = extractJson(text)
        const res = validate(parsed, req.schema)
        if (res.ok) return { text, data: res.data }
        lastErr = res.errors
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
      prompt = `${schemaPrompt(req.prompt, req.schema)}\n\nPrevious attempt failed validation: ${lastErr}\nReturn corrected JSON only.`
    }
    throw new Error(
      `agent "${req.label ?? 'unlabeled'}" failed schema validation after ${MAX_SCHEMA_RETRIES} attempts: ${lastErr}`,
    )
  },
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/codex.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 6: Commit**

```bash
git add src/adapters/codex.ts tests/fixtures/bin/codex-stub.mjs tests/unit/codex.test.ts
git commit -m "feat: codex run adapter with spawn and schema retry loop"
```

---

## Task 12: Globals assembly

**Files:**
- Create: `src/runtime/globals.ts`
- Test: `tests/unit/globals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/globals.test.ts
import { describe, it, expect } from 'vitest'
import { createGlobals } from '../../src/runtime/globals.js'
import type { RunAdapter } from '../../src/adapters/types.js'

function fakeAdapter(): RunAdapter {
  return {
    name: 'fake',
    supportsNativeSchema: false,
    async runAgent(req) {
      return { text: `echo:${req.prompt}`, data: { p: req.prompt }, usage: { outputTokens: 7 } }
    },
  }
}

describe('createGlobals', () => {
  it('agent() returns text without a schema and data with one', async () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: undefined, cwd: '/tmp', budgetTotal: null })
    expect(await g.agent('hi')).toBe('echo:hi')
    expect(await g.agent('hi', { schema: { type: 'object' } })).toEqual({ p: 'hi' })
  })

  it('agent() accrues token usage into budget', async () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: undefined, cwd: '/tmp', budgetTotal: 100 })
    await g.agent('a')
    await g.agent('b')
    expect(g.budget.spent()).toBe(14)
    expect(g.budget.remaining()).toBe(86)
  })

  it('exposes args and cwd; phase/log do not throw', () => {
    const g = createGlobals({ adapter: fakeAdapter(), args: { k: 1 }, cwd: '/work', budgetTotal: null })
    expect(g.args).toEqual({ k: 1 })
    expect(g.cwd).toBe('/work')
    expect(() => { g.phase('P'); g.log('hello') }).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/globals.test.ts`
Expected: FAIL — cannot find module `src/runtime/globals.js`.

- [ ] **Step 3: Create `src/runtime/globals.ts`**

```ts
import type { RunAdapter } from '../adapters/types.js'
import { createBudget, type Budget } from './budget.js'
import { makeParallel, makePipeline, defaultConcurrency } from './concurrency.js'

export interface GlobalsOptions {
  adapter: RunAdapter
  args: unknown
  cwd: string
  budgetTotal: number | null
  concurrency?: number
  onLog?: (line: string) => void
  onPhase?: (title: string) => void
}

export interface WorkflowGlobals {
  agent(prompt: string, opts?: { label?: string; phase?: string; schema?: Record<string, unknown>; model?: string }): Promise<any>
  parallel: ReturnType<typeof makeParallel>
  pipeline: ReturnType<typeof makePipeline>
  phase(title: string): void
  log(message: string): void
  args: unknown
  cwd: string
  budget: Budget
}

export function createGlobals(opts: GlobalsOptions): WorkflowGlobals {
  const cap = opts.concurrency ?? defaultConcurrency()
  const budget = createBudget(opts.budgetTotal)
  const onLog = opts.onLog ?? ((l) => process.stderr.write(`${l}\n`))
  const onPhase = opts.onPhase ?? ((t) => process.stderr.write(`\n=== ${t} ===\n`))

  async function agent(
    prompt: string,
    o?: { label?: string; phase?: string; schema?: Record<string, unknown>; model?: string },
  ): Promise<any> {
    const res = await opts.adapter.runAgent({
      prompt,
      cwd: opts.cwd,
      schema: o?.schema,
      model: o?.model,
      label: o?.label,
    })
    if (res.usage) budget.add(res.usage.outputTokens)
    return o?.schema ? res.data : res.text
  }

  return {
    agent,
    parallel: makeParallel(cap),
    pipeline: makePipeline(cap),
    phase: (t) => onPhase(t),
    log: (m) => onLog(m),
    args: opts.args,
    cwd: opts.cwd,
    budget,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/globals.test.ts`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/runtime/globals.ts tests/unit/globals.test.ts
git commit -m "feat: assemble workflow globals over a run adapter"
```

---

## Task 13: Execute — wrap canonical script in AsyncFunction

**Files:**
- Create: `src/runtime/execute.ts`
- Test: `tests/unit/execute.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/execute.test.ts
import { describe, it, expect } from 'vitest'
import { executeCanonicalScript } from '../../src/runtime/execute.js'
import { createGlobals } from '../../src/runtime/globals.js'
import type { RunAdapter } from '../../src/adapters/types.js'

const adapter: RunAdapter = {
  name: 'fake',
  supportsNativeSchema: false,
  async runAgent(req) { return { text: `R:${req.prompt}`, usage: { outputTokens: 1 } } },
}

const SCRIPT = `export const meta = { name: "t", description: "d" };

const PREFIX = "hi ";

const __choros_run = async function () {
  phase("only");
  const a = await agent(PREFIX + (args && args.who || "world"));
  log("ran");
  return { a, cwd, budget: budget.spent() };
};

return await __choros_run();
`

describe('executeCanonicalScript', () => {
  it('strips export, injects globals, and returns the run result', async () => {
    const g = createGlobals({ adapter, args: { who: 'Ada' }, cwd: '/here', budgetTotal: 50,
      onLog: () => {}, onPhase: () => {} })
    const result = await executeCanonicalScript(SCRIPT, g)
    expect(result).toEqual({ a: 'R:hi Ada', cwd: '/here', budget: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/execute.test.ts`
Expected: FAIL — cannot find module `src/runtime/execute.js`.

- [ ] **Step 3: Create `src/runtime/execute.ts`**

```ts
import type { WorkflowGlobals } from './globals.js'

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as
  (...args: string[]) => (...a: unknown[]) => Promise<unknown>

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/execute.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/execute.ts tests/unit/execute.test.ts
git commit -m "feat: execute canonical script via AsyncFunction with injected globals"
```

---

## Task 14: runFlow orchestration + wire `run` CLI command

**Files:**
- Create: `src/runtime/index.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/unit/run-flow.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/run-flow.test.ts
import { describe, it, expect } from 'vitest'
import { runFlowScript } from '../../src/runtime/index.js'
import type { RunAdapter } from '../../src/adapters/types.js'

const adapter: RunAdapter = {
  name: 'fake',
  supportsNativeSchema: false,
  async runAgent(req) { return { text: `[${req.prompt}]`, usage: { outputTokens: 2 } } },
}

const SCRIPT = `export const meta = { name: "s", description: "d" };
const __choros_run = async function () { return await agent("go " + (args.n || 0)); };
return await __choros_run();
`

describe('runFlowScript', () => {
  it('runs a canonical script with an injected adapter and returns its result', async () => {
    const out = await runFlowScript({ script: SCRIPT, adapter, args: { n: 3 }, cwd: '/tmp', budget: null,
      onLog: () => {}, onPhase: () => {} })
    expect(out).toBe('[go 3]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/run-flow.test.ts`
Expected: FAIL — cannot find module `src/runtime/index.js`.

- [ ] **Step 3: Create `src/runtime/index.ts`**

```ts
import { readFile } from 'node:fs/promises'
import type { RunAdapter } from '../adapters/types.js'
import { createGlobals } from './globals.js'
import { executeCanonicalScript } from './execute.js'

export interface RunFlowScriptOptions {
  script: string
  adapter: RunAdapter
  args: unknown
  cwd: string
  budget: number | null
  onLog?: (line: string) => void
  onPhase?: (title: string) => void
}

export async function runFlowScript(opts: RunFlowScriptOptions): Promise<unknown> {
  const globals = createGlobals({
    adapter: opts.adapter,
    args: opts.args,
    cwd: opts.cwd,
    budgetTotal: opts.budget,
    onLog: opts.onLog,
    onPhase: opts.onPhase,
  })
  return executeCanonicalScript(opts.script, globals)
}

export async function loadScriptFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/run-flow.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the `run` command in `src/cli/index.ts`**

Replace the `// parsed.command === 'run'` block and the trailing throw with:

```ts
  // parsed.command === 'run'
  const { getRunAdapter } = await import('../adapters/registry.js')
  const { runFlowScript, loadScriptFile } = await import('../runtime/index.js')
  const adapter = getRunAdapter(parsed.platform)
  const cwd = process.cwd()

  let script: string
  if (parsed.flowScript) {
    script = await loadScriptFile(resolve(cwd, parsed.flowScript))
  } else {
    const flowsDir = resolve(cwd, 'workflows')
    const { packFlow } = await import('../pack/index.js')
    script = (await packFlow({ flow: parsed.flow!, platform: 'claude', flowsDir })).script
  }

  const result = await runFlowScript({
    script, adapter, args: parsed.args, cwd, budget: parsed.budget,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return
```

Also add the matching import near the top of `src/cli/index.ts` is unnecessary (dynamic imports used above), but confirm `resolve` is already imported from `node:path` (it is, from Task 7).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/runtime/index.ts src/cli/index.ts tests/unit/run-flow.test.ts
git commit -m "feat: runFlow orchestration and wire run CLI command"
```

---

## Task 15: E2E — full pack → run loop with the codex stub

**Files:**
- Test: `tests/e2e/pack-run.e2e.test.ts`

This proves the real seam: pack the `hello-fan` fixture to a canonical script, then run that exact script through the real `codexRunAdapter` against the stub binary — no mocks of choros's own code.

- [ ] **Step 1: Extend the codex stub to handle hello-fan prompts**

Append to `tests/fixtures/bin/codex-stub.mjs` (inside the final `else`, before the plain-text fallback — replace the final `else` block):

```js
} else if (prompt.includes('Greet ')) {
  const name = (prompt.match(/Greet (\w+)/) || [])[1] || 'Someone'
  process.stdout.write('```json\n' + JSON.stringify({ name, greeting: `Hello ${name}` }) + '\n```\n')
} else if (prompt.includes('Summarize these greetings')) {
  process.stdout.write('Everyone was greeted warmly.\n')
} else {
  process.stdout.write('plain text reply\n')
}
```

- [ ] **Step 2: Write the E2E test**

```ts
// tests/e2e/pack-run.e2e.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'
import { runFlowScript } from '../../src/runtime/index.js'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))
const stub = fileURLToPath(new URL('../fixtures/bin/codex-stub.mjs', import.meta.url))

beforeAll(() => {
  chmodSync(stub, 0o755)
  process.env.CHOROS_CODEX_BIN = process.execPath
  process.env.CHOROS_CODEX_ARGS_PREFIX = JSON.stringify([stub, 'exec'])
})

describe('pack → run end to end (codex stub)', () => {
  it('packs hello-fan and runs it to a structured result', async () => {
    const { script, meta } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    expect(meta.name).toBe('hello-fan')

    const result = (await runFlowScript({
      script,
      adapter: codexRunAdapter,
      args: { names: ['Ada', 'Linus'] },
      cwd: process.cwd(),
      budget: null,
      onLog: () => {},
      onPhase: () => {},
    })) as { greetings: Array<{ name: string; greeting: string }>; summary: string }

    expect(result.greetings).toHaveLength(2)
    expect(result.greetings[0]).toEqual({ name: 'Ada', greeting: 'Hello Ada' })
    expect(result.greetings[1]).toEqual({ name: 'Linus', greeting: 'Hello Linus' })
    expect(result.summary).toContain('greeted')
  })
})
```

- [ ] **Step 3: Run the E2E test**

Run: `npm run test:e2e`
Expected: PASS — the packed `hello-fan` runs, parallel greeters return schema-validated objects via the stub, summarizer returns text.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/pack-run.e2e.test.ts tests/fixtures/bin/codex-stub.mjs
git commit -m "test: end-to-end pack and run loop with codex stub"
```

---

## Task 16: Port trading-agents into componentized form

**Files:**
- Create: `workflows/trading-agents/workflow.js`
- Create: `workflows/trading-agents/schemas/index.js`
- Create: `workflows/trading-agents/prompts/index.js`
- Create: `workflows/trading-agents/render.js`

Refactor `local/trading-agents.workflow.js` into modules. The entry must export a pure-literal `meta` and `export default async function run()`; all schema objects, prompt builders, and the Markdown/HTML renderers move into imported modules. **Behavior must be preserved** — same phases, same agent prompts, same returned shape.

- [ ] **Step 1: Create `workflows/trading-agents/schemas/index.js`**

Move the six schema consts (`ANALYST_SCHEMA`, `RESEARCH_VERDICT_SCHEMA`, `TRADE_SCHEMA`, `RISK_REVIEW_SCHEMA`, `RISK_MANAGER_SCHEMA`, `PM_SCHEMA`) verbatim from `local/trading-agents.workflow.js` (lines 61–143), each prefixed with `export`. Example for the first:

```js
// workflows/trading-agents/schemas/index.js
export const ANALYST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    analyst: { type: 'string' },
    summary: { type: 'string', description: 'Tight 3-6 sentence read' },
    signal: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
    confidence: { type: 'number', description: '0-1' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    dataGaps: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['analyst', 'summary', 'signal', 'confidence', 'keyPoints'],
}
// ...export the remaining five schemas identically (verbatim from the original).
```

- [ ] **Step 2: Create `workflows/trading-agents/prompts/index.js`**

Move the static descriptor arrays and prompt fragments into exported builders. Keep text identical to the original.

```js
// workflows/trading-agents/prompts/index.js
export function dataRules(date) {
  return `
Ground every claim in data you actually retrieve using the tools available to you
(web search, market-data, news, and social tools — discover them via ToolSearch).
Treat the analysis date as ${date} and do not use information from after it.
If you cannot retrieve a figure, say so explicitly under dataGaps — never fabricate
numbers, prices, or quotes.`.trim()
}

export function analysts(ticker) {
  return [
    { key: 'fundamentals', brief: `You are the FUNDAMENTALS ANALYST. Evaluate ${ticker}'s financials and performance metrics — revenue/earnings trend, margins, growth, balance sheet, valuation multiples vs peers. Identify intrinsic value and red flags.` },
    { key: 'sentiment', brief: `You are the SENTIMENT ANALYST. Aggregate recent news headlines, StockTwits, and Reddit chatter on ${ticker} into a single short-term market-mood read.` },
    { key: 'news', brief: `You are the NEWS ANALYST. Monitor global news and macro indicators relevant to ${ticker}; interpret how recent events and the macro backdrop affect it.` },
    { key: 'technical', brief: `You are the TECHNICAL ANALYST. Use technical indicators (trend, MACD, RSI, moving averages, volume, support/resistance) to read ${ticker}'s price action and near-term setup.` },
  ]
}

export const RISK_VIEWS = [
  { key: 'aggressive', brief: 'You favor higher risk/reward; defend the upside and argue for keeping or increasing exposure where justified.' },
  { key: 'neutral', brief: 'You are balanced; weigh reward against downside dispassionately.' },
  { key: 'conservative', brief: 'You prioritize capital preservation; surface tail risks and argue for caution or smaller size.' },
]
```

- [ ] **Step 3: Create `workflows/trading-agents/render.js`**

Move the pure functions `esc`, `chipClass`, `mdList`, `htmlList`, `paras`, `buildMarkdown`, `buildHtml` verbatim from the original (lines 336–513), exporting `buildMarkdown` and `buildHtml`:

```js
// workflows/trading-agents/render.js
function esc(s) { /* verbatim from original */ }
function chipClass(v) { /* verbatim */ }
function mdList(items) { /* verbatim */ }
function htmlList(items) { /* verbatim */ }
function paras(text) { /* verbatim */ }
export function buildMarkdown(r) { /* verbatim */ }
export function buildHtml(r) { /* verbatim */ }
```

- [ ] **Step 4: Create `workflows/trading-agents/workflow.js` (entry)**

```js
import { ANALYST_SCHEMA, RESEARCH_VERDICT_SCHEMA, TRADE_SCHEMA, RISK_REVIEW_SCHEMA, RISK_MANAGER_SCHEMA, PM_SCHEMA } from './schemas/index.js'
import { dataRules, analysts as analystSpecs, RISK_VIEWS } from './prompts/index.js'
import { buildMarkdown, buildHtml } from './render.js'

export const meta = {
  name: 'trading-agents',
  description: 'Multi-agent equity analysis (analysts → bull/bear debate → trader → risk → PM)',
  whenToUse: 'Deep, multi-perspective analysis of a single ticker that ends in a rated, risk-checked decision. Research only — not financial advice.',
  phases: [
    { title: 'Analysts', detail: '4 analysts gather data in parallel: fundamentals, sentiment, news, technical' },
    { title: 'Research Debate', detail: 'Bull vs bear researchers debate over N rounds' },
    { title: 'Research Verdict', detail: 'Research manager judges the debate' },
    { title: 'Trader', detail: 'Trader turns the verdict into a concrete proposal' },
    { title: 'Risk Debate', detail: 'Aggressive / neutral / conservative risk reviewers stress-test the trade' },
    { title: 'Portfolio Manager', detail: 'Final approve/reject with a 5-tier rating' },
    { title: 'Export', detail: 'Write a Markdown report and a deterministic, self-contained HTML page' },
  ],
}

export default async function run() {
  const _obj = (args && typeof args === 'object') ? args : {}
  const _text = (typeof args === 'string') ? args : ''
  const _ticker = _text.match(/\b[A-Z]{1,6}(?:\.[A-Z]{1,3})?\b/)
  const _date = _text.match(/\b\d{4}-\d{2}-\d{2}\b/)
  const ticker = _obj.ticker || (_ticker && _ticker[0]) || 'NVDA'
  const date = _obj.date || (_date && _date[0]) || 'the most recent trading day'
  const debateRounds = _obj.debateRounds || 2
  const riskRounds = _obj.riskRounds || 1
  const outDir = _obj.outDir || 'trading-agents-reports'
  const DATA_RULES = dataRules(date)

  phase('Analysts')
  log(`Analyzing ${ticker} as of ${date} — dispatching 4 analysts`)
  const analystReports = (await parallel(
    analystSpecs(ticker).map((a) => () =>
      agent(`${a.brief}\n\n${DATA_RULES}\n\nReturn a structured analyst report for ${ticker}.`,
        { label: `analyst:${a.key}`, phase: 'Analysts', schema: ANALYST_SCHEMA }),
    ),
  )).filter(Boolean)
  const analystDigest = analystReports
    .map((r) => `### ${r.analyst} — signal: ${r.signal} (conf ${r.confidence})\n${r.summary}\nKey: ${(r.keyPoints || []).join('; ')}\nRisks: ${(r.risks || []).join('; ')}`)
    .join('\n\n')

  phase('Research Debate')
  let transcript = ''
  for (let round = 1; round <= debateRounds; round++) {
    const bull = await agent(
      `You are the BULLISH RESEARCHER debating ${ticker} (round ${round}/${debateRounds}).\n     Build the strongest evidence-based case to BUY/hold long. Rebut the bear's latest points.\n\n     Analyst reports:\n${analystDigest}\n\nDebate so far:\n${transcript || '(none yet)'}\n\n${DATA_RULES}`,
      { label: `bull:r${round}`, phase: 'Research Debate' })
    transcript += `\n\n[Round ${round}] BULL: ${bull}`
    const bear = await agent(
      `You are the BEARISH RESEARCHER debating ${ticker} (round ${round}/${debateRounds}).\n     Build the strongest evidence-based case to AVOID/short. Directly rebut the bull's points above.\n\n     Analyst reports:\n${analystDigest}\n\nDebate so far:\n${transcript}\n\n${DATA_RULES}`,
      { label: `bear:r${round}`, phase: 'Research Debate' })
    transcript += `\n\n[Round ${round}] BEAR: ${bear}`
    log(`Research debate round ${round}/${debateRounds} complete`)
  }

  phase('Research Verdict')
  const researchVerdict = await agent(
    `You are the RESEARCH MANAGER. Judge the bull/bear debate on ${ticker} objectively and\n   declare a balanced verdict. Weigh which side argued from stronger evidence.\n\n   Analyst reports:\n${analystDigest}\n\nFull debate:\n${transcript}`,
    { label: 'research-manager', phase: 'Research Verdict', schema: RESEARCH_VERDICT_SCHEMA })

  phase('Trader')
  const trade = await agent(
    `You are the TRADER. Compose the analyst reports and the research manager's verdict into\n   a concrete, actionable proposal for ${ticker} as of ${date}. Decide timing and magnitude.\n\n   Research verdict: ${JSON.stringify(researchVerdict)}\n\nAnalyst reports:\n${analystDigest}`,
    { label: 'trader', phase: 'Trader', schema: TRADE_SCHEMA })

  phase('Risk Debate')
  let riskReviews = []
  for (let round = 1; round <= riskRounds; round++) {
    const priorRisk = riskReviews.length
      ? `\n\nPrior-round risk views:\n${riskReviews.map((r) => `${r.perspective}: ${r.assessment}`).join('\n')}`
      : ''
    riskReviews = (await parallel(
      RISK_VIEWS.map((v) => () =>
        agent(`You are the ${v.key.toUpperCase()} RISK REVIEWER for the proposed ${ticker} trade.\n         ${v.brief}\n\nProposed trade: ${JSON.stringify(trade)}\nResearch verdict: ${JSON.stringify(researchVerdict)}${priorRisk}\n\n${DATA_RULES}`,
          { label: `risk:${v.key}:r${round}`, phase: 'Risk Debate', schema: RISK_REVIEW_SCHEMA }),
      ),
    )).filter(Boolean)
    log(`Risk debate round ${round}/${riskRounds} complete`)
  }
  const riskManagerCall = await agent(
    `You are the RISK MANAGER. Synthesize the risk reviewers into a single risk assessment for\n   the ${ticker} trade. Decide whether it is fit to forward to the Portfolio Manager and what\n   adjustments are required.\n\n   Proposed trade: ${JSON.stringify(trade)}\nRisk reviews: ${JSON.stringify(riskReviews)}`,
    { label: 'risk-manager', phase: 'Risk Debate', schema: RISK_MANAGER_SCHEMA })

  phase('Portfolio Manager')
  const decision = await agent(
    `You are the PORTFOLIO MANAGER making the final call on ${ticker} as of ${date}.\n   Approve or reject the trade and issue a 5-tier rating\n   (Buy / Overweight / Hold / Underweight / Sell). Be decisive but honor the risk\n   manager's required adjustments.\n\n   Research verdict: ${JSON.stringify(researchVerdict)}\n   Proposed trade: ${JSON.stringify(trade)}\n   Risk manager: ${JSON.stringify(riskManagerCall)}\n\n   Reminder: this is research/education only, not financial advice. State that in your rationale.`,
    { label: 'portfolio-manager', phase: 'Portfolio Manager', schema: PM_SCHEMA })
  log(`Final rating for ${ticker}: ${decision.decision}`)

  phase('Export')
  const report = { ticker, date, decision, riskManager: riskManagerCall, trade, researchVerdict, analysts: analystReports }
  const slug = `${ticker}-${date}`.replace(/[^A-Za-z0-9._-]+/g, '_')
  const mdPath = `${outDir}/${slug}.md`
  const htmlPath = `${outDir}/${slug}.html`
  const markdown = buildMarkdown(report)
  const html = buildHtml(report)
  await agent(
    `Write two pre-rendered report files to disk EXACTLY as given — byte for byte. Do NOT edit,\n   reformat, summarize, pretty-print, or add anything of your own. Create the directory "${outDir}"\n   if it does not exist, then use the Write tool to create each file with the exact content between\n   its markers (do not include the marker lines). Reply with only the two file paths.\n\n=== FILE A === path: ${mdPath}\n<<<<<<MARKDOWN_BEGIN\n${markdown}\nMARKDOWN_END>>>>>>\n\n=== FILE B === path: ${htmlPath}\n<<<<<<HTML_BEGIN\n${html}\nHTML_END>>>>>>`,
    { label: 'export', phase: 'Export' })
  log(`Exported report → ${mdPath} and ${htmlPath}`)

  return {
    ticker, date, decision, riskManager: riskManagerCall, trade, researchVerdict,
    analysts: analystReports, artifacts: { markdown: mdPath, html: htmlPath },
    disclaimer: 'Research/education only. Not financial, investment, or trading advice.',
  }
}
```

- [ ] **Step 5: Verify it packs (structural check)**

Run: `npx tsx -e "import('./src/pack/index.js').then(m=>m.packFlow({flow:'trading-agents',platform:'claude',flowsDir:process.cwd()+'/workflows'})).then(r=>{const s=r.script; if(!s.trimStart().startsWith('export const meta = {')) throw new Error('not meta-first'); if(/^\s*import\s/m.test(s)) throw new Error('has imports'); if(s.includes('export default')) throw new Error('has default export'); console.log('OK length',s.length)})"`
Expected: prints `OK length <n>` — packs to a meta-first, import-free, self-contained script.

- [ ] **Step 6: Commit**

```bash
git add workflows/trading-agents
git commit -m "feat: componentize trading-agents workflow for choros pack"
```

---

## Task 17: Structural acceptance tests (no tokens)

**Files:**
- Create: `tests/acceptance/structural.accept.test.ts`

These run in any environment (no LLM, no real codex). They assert that real packed artifacts satisfy the production constraints Claude's `Workflow` tool imposes.

- [ ] **Step 1: Write the acceptance test**

```ts
// tests/acceptance/structural.accept.test.ts
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { packFlow } from '../../src/pack/index.js'

const flowsDir = resolve(process.cwd(), 'workflows')

describe('production structural acceptance: trading-agents packs to a valid Claude workflow', () => {
  it('is meta-first, self-contained, and ends with a return call', async () => {
    const { script, meta } = await packFlow({ flow: 'trading-agents', platform: 'claude', flowsDir })

    // Claude requires the script to BEGIN with the meta literal.
    expect(script.trimStart().startsWith('export const meta = {')).toBe(true)
    // meta must carry name + description and the seven declared phases.
    expect(meta.name).toBe('trading-agents')
    expect(meta.description.length).toBeGreaterThan(0)
    expect(meta.phases).toHaveLength(7)
    // Self-contained: no imports/requires survived bundling.
    expect(script).not.toMatch(/^\s*import\s/m)
    expect(script).not.toMatch(/\brequire\(/)
    expect(script).not.toContain('export default')
    // The inlined renderers and schemas are present.
    expect(script).toContain('buildMarkdown')
    expect(script).toContain('ANALYST_SCHEMA')
    // Trailing top-level return so Claude's harness yields the workflow result.
    expect(script.trimEnd().endsWith('return await __choros_run();')).toBe(true)
  })

  it('the packed script parses as a runnable AsyncFunction body', async () => {
    const { script } = await packFlow({ flow: 'trading-agents', platform: 'claude', flowsDir })
    const body = script.replace(/^\s*export\s+const\s+meta/m, 'const meta')
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as any
    // Construct (compile) but do not invoke — this fails if the body is not valid JS.
    expect(() => new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'cwd', 'budget', body)).not.toThrow()
  })
})
```

- [ ] **Step 2: Run the acceptance test**

Run: `npm run test:acceptance -- tests/acceptance/structural.accept.test.ts`
Expected: PASS (both cases).

- [ ] **Step 3: Commit**

```bash
git add tests/acceptance/structural.accept.test.ts
git commit -m "test: structural acceptance for packed trading-agents artifact"
```

---

## Task 18: Live acceptance test (gated, real codex)

**Files:**
- Create: `tests/acceptance/live-codex.accept.test.ts`

Runs the `hello-fan` flow through the **real** `codex` CLI. Gated by `CHOROS_ACCEPTANCE_LIVE=1` so it never runs (or costs tokens) by default.

- [ ] **Step 1: Write the gated live test**

```ts
// tests/acceptance/live-codex.accept.test.ts
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { packFlow } from '../../src/pack/index.js'
import { runFlowScript } from '../../src/runtime/index.js'
import { codexRunAdapter } from '../../src/adapters/codex.js'

const live = process.env.CHOROS_ACCEPTANCE_LIVE === '1'
const flowsDir = fileURLToPath(new URL('../fixtures/flows', import.meta.url))

describe.runIf(live)('production live acceptance: real codex runs hello-fan', () => {
  it('packs and runs hello-fan against the real codex CLI', async () => {
    // Uses the real `codex` on PATH (no CHOROS_CODEX_BIN override).
    delete process.env.CHOROS_CODEX_BIN
    delete process.env.CHOROS_CODEX_ARGS_PREFIX

    const { script } = await packFlow({ flow: 'hello-fan', platform: 'claude', flowsDir })
    const result = (await runFlowScript({
      script, adapter: codexRunAdapter, args: { names: ['Ada'] },
      cwd: process.cwd(), budget: null,
    })) as { greetings: Array<{ name: string; greeting: string }>; summary: string }

    expect(Array.isArray(result.greetings)).toBe(true)
    expect(result.greetings.length).toBe(1)
    expect(typeof result.greetings[0].name).toBe('string')
    expect(typeof result.greetings[0].greeting).toBe('string')
    expect(typeof result.summary).toBe('string')
  }, 120_000)
})
```

- [ ] **Step 2: Verify it is skipped by default**

Run: `npm run test:acceptance -- tests/acceptance/live-codex.accept.test.ts`
Expected: the suite is skipped (0 tests run / suite marked skipped) because `CHOROS_ACCEPTANCE_LIVE` is unset.

- [ ] **Step 3: (Optional, manual) Confirm `codex exec` invocation shape before running live**

Run: `codex exec --help`
Read the output and confirm `codex exec` accepts a prompt on stdin. If the real flag shape differs from `['exec']` + stdin, adjust `codexCommand()` in `src/adapters/codex.ts` accordingly (this is the one place the real CLI contract is encoded), then re-run unit tests: `npm test`.

- [ ] **Step 4: (Optional, manual) Run the live test**

Run: `CHOROS_ACCEPTANCE_LIVE=1 npm run test:acceptance -- tests/acceptance/live-codex.accept.test.ts`
Expected: PASS — real codex returns greetings and a summary. (Costs tokens.)

- [ ] **Step 5: Commit**

```bash
git add tests/acceptance/live-codex.accept.test.ts
git commit -m "test: gated live acceptance running hello-fan through real codex"
```

---

## Task 19: Full suite green + README

**Files:**
- Create: `README.md`
- Test: all

- [ ] **Step 1: Run the full unit + e2e + structural-acceptance suite**

Run: `npm run typecheck && npm test && npm run test:e2e && npm run test:acceptance`
Expected: typecheck clean; all unit, e2e, and structural-acceptance tests PASS; live acceptance skipped.

- [ ] **Step 2: Write `README.md`**

```markdown
# choros

Author multi-agent workflows once as modular components; **pack** them into a
self-contained Claude Code `Workflow` script, or **run** that same script on any
agent CLI through the choros runtime.

## Usage

```bash
# Bundle workflows/trading-agents/ into a Claude-native workflow script
choros pack --platform claude --flow trading-agents
# → dist/trading-agents.claude.workflow.js

# Run a workflow on a non-Claude agent (codex), packing from source on the fly
choros run --platform codex --flow trading-agents --args '{"ticker":"NVDA"}'

# Or run an already-packed script
choros run --platform codex --flow-script dist/trading-agents.claude.workflow.js
```

## Authoring a workflow

A workflow lives in `workflows/<name>/` with an entry that exports a pure-literal
`meta` and a default `async function run()`. Use the ambient globals
`agent / parallel / pipeline / phase / log / args / budget / cwd` — do not import
them. Imports from `./schemas`, `./prompts`, etc. are inlined at pack time.

## Development

```bash
npm test              # unit
npm run test:e2e      # full pack→run loop against a codex stub
npm run test:acceptance              # structural acceptance (no tokens)
CHOROS_ACCEPTANCE_LIVE=1 npm run test:acceptance   # live, real codex (costs tokens)
```
```

- [ ] **Step 3: Build the CLI and smoke-test the binary**

Run: `npm run build && node dist/cli/index.js pack --platform claude --flow trading-agents`
Expected: prints `dist/trading-agents.claude.workflow.js`; the file exists and begins with `export const meta`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add choros README; full suite green"
```

---

## Notes for the implementer

- **Globals are free identifiers, never imported.** esbuild leaves unresolved free identifiers alone; the runtime supplies them as `AsyncFunction` parameters; Claude supplies them natively. Never add `import { agent } …` to a workflow.
- **The canonical script is the one artifact.** `pack` emits it for Claude; `run` consumes the identical shape. The only top-level `export` it contains is `export const meta`.
- **The codex CLI contract lives in one place** — `codexCommand()` in `src/adapters/codex.ts`. Tests pin behavior via `CHOROS_CODEX_BIN` + `CHOROS_CODEX_ARGS_PREFIX`, so the real flag shape can change there without touching the rest of the system.
- **Deferred (per design spec):** native structured-output detection per adapter, budget-derived-from-real-usage parsing, declared tool/MCP requirements + preflight, `--install` slash-command registration, richer live progress rendering. Build these only when picked up as follow-on work.
```
