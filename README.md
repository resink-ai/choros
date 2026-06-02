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
