# choros — Platform Support Verification

Generated 2026-06-02T13:46:05.204Z · 9/9 matrix cells passed.

CLIs — claude: 2.1.160 (Claude Code) · codex: codex-cli 0.135.0 · gemini: 0.44.1

## Flow × platform matrix

| flow | claude | codex | gemini |
|---|---|---|---|
| trading-agents | pass (7 phases · 20063 B · compiles) | pass (rating=Buy, analysts=4) | pass (rating=Buy, analysts=4) |
| full-stack-ship | pass (6 phases · 21624 B · compiles) | pass (reposChanged=[frontend], deploy=pass) | pass (reposChanged=[frontend], deploy=pass) |
| first-principles-scout | pass (3 phases · 13764 B · compiles) | pass (products=1, analyses=1) | pass (products=1, analyses=1) |

- **claude**: packs to a valid, self-contained Claude Workflow script that compiles as a runnable body (run natively).
- **codex / gemini**: the flow's full orchestration runs through the real run adapter (spawn + stdin/`-p` + schema extract→validate) driven by a deterministic schema stub.

## Live CLI round-trip (real binaries)

- **codex** (codex-cli 0.135.0): plain=pass, schema=pass — `PONG`
- **gemini** (0.44.1): plain=pass, schema=pass — `PONG`
