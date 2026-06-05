# choros dashboard

A lean Next.js app that visualizes choros workflow runs captured by the runtime
into SQLite (`.choros/runs.db`).

```bash
npm install
npm run dev      # http://localhost:4321  (dev)
# or
npm run build && npm run start
```

It reads the DB at `../.choros/runs.db` by default. Override with:

```bash
CHOROS_DB=/absolute/path/to/runs.db npm run dev
```

No data yet? From the repo root run `npm run seed` (sample runs) or do a real
`choros run`.

## What it shows

- **Runs list** (`/`): stat cards (runs, ok/error, agent calls, tokens) and a
  filterable table (flow / platform / status / search).
- **Run detail** (`/runs/[id]`): foldable phase sections, each with its log
  events and agent-call cards. Expand a card for the full prompt, response text,
  and parsed structured data, plus tokens / duration / model / status. Controls:
  status filter (all / ok / error), free-text search across labels and
  conversations, and expand/collapse-all. Errored agents auto-expand.

Reads are read-only; the app never writes to the DB.
