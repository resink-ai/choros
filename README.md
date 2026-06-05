# choros

Author multi-agent workflows once as modular components; **pack** them into a
self-contained Claude Code `Workflow` script, or **run** that same script on any
agent CLI through the choros runtime.

## Supported platforms

| Platform | Mode | How |
| --- | --- | --- |
| **Claude Code** | pack | `choros pack --platform claude` → a self-contained `Workflow` script Claude runs natively |
| **Codex** | run | `choros run --platform codex` → `codex exec` (prompt on stdin) |
| **Gemini CLI** | run | `choros run --platform gemini` → `gemini -p "<prompt>"` (headless) |

New run adapters are small: see `src/adapters/cli-adapter.ts` (`createCliAdapter`) — codex and gemini are each a few lines of config.

## Usage

```bash
# Bundle workflows/trading-agents/ into a Claude-native workflow script
choros pack --platform claude --flow trading-agents
# → dist/trading-agents.claude.workflow.js

# Run a workflow on a non-Claude agent, packing from source on the fly
choros run --platform codex  --flow trading-agents --args '{"ticker":"NVDA"}'
choros run --platform gemini --flow trading-agents --args '{"ticker":"NVDA"}'

# Or run an already-packed script
choros run --platform gemini --flow-script dist/trading-agents.claude.workflow.js
```

## Authoring a workflow

A workflow lives in `workflows/<name>/` with an entry that exports a pure-literal
`meta` and a default `async function run()`. Use the ambient globals
`agent / parallel / pipeline / phase / log / args / budget / cwd` — do not import
them. Imports from `./schemas`, `./prompts`, etc. are inlined at pack time.

## Observe runs

Every `choros run` is captured to SQLite (`.choros/runs.db` by default) — phases,
each agent conversation (prompt, response, parsed data, tokens, timing, status),
log events, and the final result. Recording never breaks a run.

```bash
choros run --platform codex --flow trading-agents   # records to .choros/runs.db
choros run ... --db /tmp/runs.db                     # custom DB path
choros run ... --no-record                           # disable recording

npm run seed         # generate a sample .choros/runs.db (3 flows + 1 error run)
```

Visualize with the lean Next.js dashboard (reads the same DB):

```bash
cd dashboard && npm install && npm run dev   # http://localhost:4321
# point at any DB:  CHOROS_DB=/path/to/runs.db npm run dev
```

The dashboard shows high-level stats and a runs list (filter by flow/platform/
status/search), and a per-run drill-down: foldable phase sections, agent-call
cards (prompt / response / parsed data / tokens / duration / status), log events,
and the final result — with expand/collapse-all and status/text filtering.

## Development

```bash
npm test              # unit
npm run test:e2e      # full pack→run loop against a codex stub
npm run test:acceptance              # structural acceptance (no tokens)
CHOROS_ACCEPTANCE_LIVE=1 npm run test:acceptance   # live, real codex (costs tokens)

# Verify every flow across claude/codex/gemini and write an HTML report
npm run verify                       # includes a live codex+gemini round-trip
CHOROS_VERIFY_LIVE=0 npm run verify  # stubbed only (no tokens)
# → verification/platform-support-report.html
```
