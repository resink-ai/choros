# choros — Cross-Platform AI Agent Workflows

**Date:** 2026-05-31
**Status:** Approved design — ready for implementation planning

## Problem

Multi-agent workflows (e.g. `local/trading-agents.workflow.js`) are written today as a single
self-contained script targeting Claude Code's native `Workflow` tool. That ties a valuable,
reusable orchestration to one agent runtime. We want to author workflows **once** as modular
components and then either:

1. **Pack** them into the self-contained `workflow.js` that a given platform expects, or
2. **Run** them on any agent CLI through a portable runtime that supplies the same globals and
   shells out (e.g. `codex exec`) whenever the workflow calls `agent()`.

## Goals

- Author a workflow as modular JS/TS components (meta, schemas, prompts, phases) under
  `workflows/<flow>/`, preserving full imperative power (loops, accumulating state, conditionals).
- `choros pack --platform claude --flow <name>` bundles components into one self-contained
  `workflow.js` that Claude Code runs natively via its `Workflow` tool.
- `choros run --platform codex …` executes a bundle on a non-Claude agent by injecting the
  workflow globals and dispatching `agent()` calls to that agent's CLI.
- Extensible via a small adapter interface so more platforms (opencode, "pi", etc.) can be added
  later without changing the core.

## Non-Goals (v1)

- Declarative DAG authoring (the `0.1.yaml` / `artifacts.yaml` style). v1 is imperative-JS-first.
- choros managing/provisioning subagent tools or MCP servers. Subagents inherit the target CLI's
  existing config. A declared-requirements + preflight layer is deferred.
- Platforms beyond Claude (pack) and Codex (run). The adapter interface keeps the door open.
- choros making its own LLM API calls. It always delegates to the user's agent CLI.

## Decisions (locked during brainstorming)

| Decision | Choice |
| --- | --- |
| Authoring model | JS/TS modules, bundled (full imperative power retained) |
| `pack` role | A real ES-module bundler (esbuild-style) that inlines imports into one file |
| Schema / structured output in runtime | Native structured output when the CLI exposes it; otherwise prompt + ajv-validate + retry |
| Subagent tools | Inherit the target CLI's existing config now; declared requirements + preflight later |
| v1 platforms | Claude (pack) + Codex (run), end to end |
| Component discovery | ES module `import`s from an entry file; bundler resolves & inlines |
| Implementation stack | TypeScript on Node, npm bin `choros` |
| `pack` output | Emit a file at a predictable path and print it; `--install` is opt-in |

## Architecture

`choros` is a TypeScript CLI on Node with two verbs over one canonical artifact — a self-contained
`workflow.js` bundle.

```
component source ──choros pack──▶ self-contained workflow.js
                                        │
                    ┌───────────────────┴───────────────────┐
            (--platform claude)                      (--platform codex)
            run natively by Claude's            choros run executes the bundle,
            Workflow tool                       providing globals + shelling to `codex exec`
```

- **`pack`** = bundler. Inlines a workflow's JS modules into one self-contained file.
- **`run`** = interpreter. Executes a bundle in Node, injecting the
  `agent / parallel / pipeline / phase / log / args / budget / cwd` globals, and dispatching
  `agent()` calls to a RunAdapter (codex for v1).
- **Claude is a pack target only** — it runs the bundle natively, so choros never interprets a
  bundle for Claude.

## Repo Layout

```
choros/
  src/
    cli/         pack & run arg parsing
    pack/        esbuild wrapper + meta hoisting + meta validation
    runtime/     globals impl (agent, parallel, pipeline, phase, log, budget) + executor
    adapters/    PackTarget + RunAdapter interfaces; claude.ts, codex.ts
    schema/      ajv validate + retry helper
  globals.d.ts   ambient types so component authors get typechecking on the globals
  workflows/
    trading-agents/
      workflow.js        entry: `export const meta = {…}` literal + imports below
      schemas/*.js
      prompts/*.js
      phases/*.js
  dist/          pack output
```

## Component & Bundling Model

- The entry file holds `export const meta = {…}` **as a pure literal** and `import`s the
  schemas/prompts/phases modules.
- Globals are **never imported** — they remain free identifiers that esbuild leaves as ambient
  references. `globals.d.ts` gives component authors type-checking for them.
- **Key packer detail — meta hoisting:** Claude requires the script to *begin* with
  `export const meta` as a pure literal, but esbuild hoists imported module code above the entry
  module. The packer therefore:
  1. Extracts the `meta` literal from the entry file.
  2. Validates it (pure literal; has at least `name` and `description`).
  3. Emits it as the top-of-file prologue, then appends the bundled body (with the original
     `meta` declaration neutralized so it is not duplicated).

  This guarantees Claude's "must begin with `meta`" and "`meta` must be a pure literal"
  constraints.

## Runtime (`choros run`)

Loads the bundle into a Node context (vm/worker) with globals injected:

- `agent(prompt, opts)` → `adapter.runAgent({ prompt, schema, model, label, cwd })`.
- `parallel(thunks)` → concurrency-capped (`min(16, cores − 2)`) via a semaphore; a throwing thunk
  resolves to `null` (matches Claude semantics, so `.filter(Boolean)` works).
- `pipeline(items, …stages)` → per-item fan-out with no barrier; a throwing stage drops that item
  to `null` and skips its remaining stages.
- `budget` → `{ total (from --budget), spent(), remaining() }`; spend is parsed from adapter usage
  when available, otherwise best-effort.
- `phase` / `log` → terminal progress lines (simple grouped output for v1; richer live view later).

## Adapters

```ts
interface PackTarget {            // claude (v1)
  name: string
  // claude: guarantee meta-first finalization; optional slash-command stub on --install
  finalize(bundle: string, meta: WorkflowMeta): string
}

interface RunAdapter {            // codex (v1)
  name: string
  supportsNativeSchema: boolean
  runAgent(req: RunAgentRequest): Promise<{
    text: string
    data?: unknown        // present when a schema was requested and parsed
    usage?: TokenUsage
  }>
}
```

- **codex adapter:** spawns `codex exec` non-interactively in `cwd`, captures stdout.
  - **Schema:** use native structured output **if the CLI exposes it**; otherwise fall back to
    *append-schema-to-prompt → extract JSON block → ajv-validate → retry N times feeding the
    validation error back*. Codex is expected to need the fallback path, so that path is built
    first.
  - **Tools:** the subagent inherits the codex CLI's existing config/MCP. choros does not manage
    tools in v1.

## CLI Surface

```
choros pack --platform claude --flow trading-agents [--out <path>] [--install]
choros run  --platform codex  (--flow <name> | --flow-script <file>) [--args <json>] [--budget <n>]
```

- `pack` writes to `dist/<flow>.<platform>.workflow.js` and prints the path. `--install` (opt-in)
  copies the bundle into the Claude workflows location and/or registers a slash command.
- `run --flow <name>` packs from source in-memory, then runs it.
- `run --flow-script <file>` runs an already-bundled file.

## Error Handling

- Bundler errors (missing import / syntax) → a message naming the offending file.
- `meta` not a pure literal, or missing `name` / `description` → `pack` fails loudly.
- Agent schema validation still failing after N retries → throw naming the **agent label**, the
  last validation error, and the raw output.
- Adapter CLI missing or nonzero exit → an actionable error (e.g. "`codex` not found on PATH").
- A throwing thunk in `parallel` resolves to `null`; a throwing `pipeline` stage drops the item.

## Testing Strategy

- **Unit:** bundler (fixture workflow → single file, `meta` first, imports inlined, globals left as
  free references); schema validate + retry (mock adapter); concurrency cap; budget math; CLI arg
  parsing.
- **Adapter:** codex adapter against a **fake `codex` binary stub** — a script that echoes canned
  JSON — to exercise `runAgent`, structured-output parsing, and the retry loop with zero LLM cost.
- **E2E:** pack `trading-agents` for Claude → snapshot the bundle (assert it is self-contained and
  `meta`-first); run a tiny sample workflow through `run --platform codex` + the stub.

## Implementation Phasing

1. **Pack path:** CLI skeleton, component layout, esbuild bundler, meta-hoisting, `globals.d.ts`,
   meta validation. Deliverable: `trading-agents` packs and runs natively in Claude.
2. **Run path:** runtime globals + executor, `RunAdapter` interface, codex adapter (fallback schema
   path), `run --platform codex`. Deliverable: the same workflow runs via codex.
3. **Polish:** native-schema detection, budget-from-usage, progress rendering, `--install`, error
   UX. Declared tool requirements + preflight checks are deferred to a later phase.

## Open Questions / Future Work

- Declarative DAG authoring as an alternative front-end that compiles down to the same bundle.
- Declared tool/MCP requirements with per-platform config generation and preflight checks.
- Additional adapters: opencode, "pi", and others.
- Richer live progress rendering for `run`.
