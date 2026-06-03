/**
 * Platform verification harness for choros.
 *
 * Verifies that all shipped flows work on each supported platform:
 *  - claude : flow packs to a valid, self-contained Claude Workflow script that
 *             compiles as a runnable workflow body (Claude Code runs it natively).
 *  - codex  : flow executes through the real codex run adapter (spawn + stdin +
 *             schema extract/validate) driven by a deterministic schema stub.
 *  - gemini : same, through the real gemini run adapter (prompt via `-p` argv).
 *
 * Plus a LIVE round-trip smoke against the real codex / gemini CLIs (plain text
 * and a small schema-constrained call) to prove the real binaries work with the
 * exact invocation each adapter uses.
 *
 * Writes verification/platform-support-report.{html,md,json} and prints a summary.
 *
 * Run: npx tsx scripts/verify-platforms.ts
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { packFlow } from '../src/pack/index.js'
import { runFlowScript } from '../src/runtime/index.js'
import { getRunAdapter } from '../src/adapters/registry.js'
import { extractJson, validate } from '../src/schema/validate.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const flowsDir = resolve(repoRoot, 'workflows')
const stub = resolve(repoRoot, 'tests/fixtures/bin/schema-stub.mjs')
const outDir = resolve(repoRoot, 'verification')

const FLOWS = ['trading-agents', 'full-stack-ship', 'first-principles-scout']
const PLATFORMS = ['claude', 'codex', 'gemini'] as const
const LIVE = process.env.CHOROS_VERIFY_LIVE !== '0' // live smoke on by default; set =0 to skip

const FLOW_ARGS: Record<string, unknown> = {
  'trading-agents': { ticker: 'NVDA', date: '2026-01-15', debateRounds: 1, riskRounds: 1 },
  'full-stack-ship': { changeRequest: 'Add CSV export to the reports page', baseDir: '/tmp' },
  'first-principles-scout': { maxProducts: 3, since: 'the last 7 days' },
}

type Cell = { status: 'pass' | 'fail'; method: string; detail: string; ms: number }
type LiveResult = { available: boolean; plain: string; schema: string; detail: string; version: string }

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as any

function cliVersion(bin: string, args: string[]): string {
  try {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 20000 })
    if (r.status === 0 && r.stdout) return r.stdout.trim().split('\n')[0].slice(0, 60)
    return 'present'
  } catch {
    return 'not found'
  }
}

function summarize(flow: string, result: any): string {
  if (!result || typeof result !== 'object') return String(result)
  if (flow === 'trading-agents') return `rating=${result.decision?.decision}, analysts=${result.analysts?.length}`
  if (flow === 'full-stack-ship') return `reposChanged=[${(result.reposChanged || []).join(',')}], deploy=${result.deploy?.status}`
  if (flow === 'first-principles-scout') return `products=${result.products?.length}, analyses=${result.analyses?.length}`
  return Object.keys(result).join(',')
}

function stubEnvFor(platform: 'codex' | 'gemini') {
  // Point the platform's adapter at the schema stub (run via node).
  if (platform === 'codex') {
    process.env.CHOROS_CODEX_BIN = process.execPath
    process.env.CHOROS_CODEX_ARGS_PREFIX = JSON.stringify([stub, 'exec'])
  } else {
    process.env.CHOROS_GEMINI_BIN = process.execPath
    process.env.CHOROS_GEMINI_ARGS_PREFIX = JSON.stringify([stub])
  }
}
function clearStubEnv() {
  delete process.env.CHOROS_CODEX_BIN
  delete process.env.CHOROS_CODEX_ARGS_PREFIX
  delete process.env.CHOROS_GEMINI_BIN
  delete process.env.CHOROS_GEMINI_ARGS_PREFIX
}

async function packCell(flow: string): Promise<Cell> {
  const t0 = Date.now()
  try {
    const { script, meta } = await packFlow({ flow, platform: 'claude', flowsDir })
    const body = script.replace(/^\s*export\s+const\s+meta/m, 'const meta')
    new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'cwd', 'budget', body)
    const ok = script.trimStart().startsWith('export const meta = {') && script.trimEnd().endsWith('return await __choros_run();')
    return {
      status: ok ? 'pass' : 'fail',
      method: 'pack + compile (native exec)',
      detail: `${meta.phases?.length ?? 0} phases · ${script.length} B · compiles`,
      ms: Date.now() - t0,
    }
  } catch (e) {
    return { status: 'fail', method: 'pack + compile (native exec)', detail: (e as Error).message, ms: Date.now() - t0 }
  }
}

async function runCell(flow: string, platform: 'codex' | 'gemini'): Promise<Cell> {
  const t0 = Date.now()
  try {
    stubEnvFor(platform)
    // The canonical script is platform-neutral; CLI adapters (codex, gemini)
    // have no pack-time step, so the 'claude' pack output IS the correct input
    // for runFlowScript on every run platform.
    const { script } = await packFlow({ flow, platform: 'claude', flowsDir })
    const result = await runFlowScript({
      script,
      adapter: getRunAdapter(platform),
      args: FLOW_ARGS[flow],
      cwd: '/tmp',
      budget: null,
      onLog: () => {},
      onPhase: () => {},
    })
    return {
      status: 'pass',
      method: 'run via adapter (schema stub)',
      detail: summarize(flow, result),
      ms: Date.now() - t0,
    }
  } catch (e) {
    return { status: 'fail', method: 'run via adapter (schema stub)', detail: (e as Error).message, ms: Date.now() - t0 }
  } finally {
    clearStubEnv()
  }
}

function runLiveSmoke(platform: 'codex' | 'gemini'): LiveResult {
  clearStubEnv()
  const bin = platform
  const version = cliVersion(bin, ['--version'])
  const invoke = (prompt: string) =>
    platform === 'codex'
      ? spawnSync(bin, ['exec'], { input: prompt, encoding: 'utf8', timeout: 120000 })
      : spawnSync(bin, ['-p', prompt], { encoding: 'utf8', timeout: 120000 })

  const out: LiveResult = { available: version !== 'not found', plain: 'skipped', schema: 'skipped', detail: '', version }
  if (!out.available) { out.detail = 'binary not found on PATH'; return out }

  // Plain text round-trip
  try {
    const r = invoke('Reply with exactly the word PONG and nothing else.')
    if (r.error) out.plain = `fail (${(r.error as any).code || r.error.message})`
    else if (r.status === 0 && (r.stdout || '').trim()) out.plain = 'pass'
    else out.plain = `fail (exit ${r.status})`
    out.detail = ((r.stdout || r.stderr || '') as string).trim().slice(0, 120)
  } catch (e) {
    out.plain = `fail (${(e as Error).message})`
  }

  // Schema-constrained round-trip (best-effort — depends on model compliance)
  const schema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] }
  try {
    const prompt = `Return ONLY a JSON object with an "answer" field whose value is the word PONG.\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(schema)}`
    const r = invoke(prompt)
    if (r.status === 0 && r.stdout) {
      const parsed = extractJson(r.stdout)
      out.schema = validate(parsed, schema).ok ? 'pass' : 'fail (invalid)'
    } else out.schema = `fail (exit ${r.status})`
  } catch (e) {
    out.schema = `fail (${(e as Error).message})`
  }
  return out
}

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtml(data: any): string {
  const chip = (s: string) => {
    const ok = /^pass$/i.test(s)
    const bad = /fail/i.test(s)
    return `<span class="chip ${ok ? 'pos' : bad ? 'neg' : 'neu'}">${esc(s)}</span>`
  }
  const rows = data.flows.map((flow: string) => {
    const cells = data.platforms.map((p: string) => {
      const c = data.matrix[flow][p]
      return `<td>${chip(c.status)}<div class="meta">${esc(c.method)}<br>${esc(c.detail)}<br><span class="ms">${c.ms} ms</span></div></td>`
    }).join('')
    return `<tr><th>${esc(flow)}</th>${cells}</tr>`
  }).join('')

  const live = ['codex', 'gemini'].map((p) => {
    const l = data.liveSmoke[p]
    return `<tr><th>${esc(p)}</th><td>${esc(l.version)}</td><td>${chip(l.plain)}</td><td>${chip(l.schema)}</td><td class="meta">${esc(l.detail)}</td></tr>`
  }).join('')

  const css = `
  *{box-sizing:border-box}
  body{margin:0;background:#0f1115;color:#e8e8ea;font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{max-width:920px;margin:0 auto;padding:56px 24px 96px}
  .eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:12px;color:#8a90a0;margin:0 0 6px}
  h1{font:800 34px/1.1 "Inter",-apple-system,sans-serif;margin:0 0 10px}
  h2{font:700 19px/1.3 "Inter",sans-serif;margin:40px 0 12px;padding-bottom:6px;border-bottom:1px solid #2a2e38}
  p{margin:0 0 12px}.muted{color:#8a90a0}
  table{width:100%;border-collapse:collapse;margin:0 0 8px}
  th,td{text-align:left;padding:12px 12px;border-bottom:1px solid #232733;vertical-align:top}
  thead th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#8a90a0}
  tbody th{color:#fff;font-weight:700}
  .chip{display:inline-block;padding:2px 11px;border-radius:999px;font-size:12px;font-weight:700}
  .chip.pos{background:#10331f;color:#5ee08a}.chip.neg{background:#3a1414;color:#ff8a8a}.chip.neu{background:#2a2e38;color:#aab2c5}
  .meta{color:#8a90a0;font-size:12px;margin-top:6px}.ms{color:#5b6172}
  footer{margin-top:56px;padding-top:16px;border-top:1px solid #2a2e38;color:#8a90a0;font-size:12px}
  code{background:#1b1f29;padding:1px 6px;border-radius:5px}`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>choros — platform support verification</title><style>${css}</style></head>
<body><main>
  <p class="eyebrow">choros · platform verification</p>
  <h1>All flows × all platforms</h1>
  <p class="muted">Generated ${esc(data.generatedAt)} · ${esc(data.summary.passed)}/${esc(data.summary.total)} matrix cells passed</p>
  <p class="muted">CLIs — claude: <code>${esc(data.cliVersions.claude)}</code> · codex: <code>${esc(data.cliVersions.codex)}</code> · gemini: <code>${esc(data.cliVersions.gemini)}</code></p>

  <h2>Flow × platform matrix</h2>
  <table>
    <thead><tr><th>flow</th>${data.platforms.map((p: string) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="muted">claude = packs to a valid, self-contained Claude Workflow script that compiles as a runnable body (Claude Code executes it natively). codex / gemini = the flow's full orchestration executes through the real run adapter (real process spawn, stdin/<code>-p</code> arg, schema extract→validate→retry) driven by a deterministic schema stub — zero tokens, exercises every phase, <code>parallel</code>/<code>pipeline</code>, and conditional sub-agent spawning.</p>

  <h2>Live CLI round-trip (real binaries)</h2>
  <table>
    <thead><tr><th>cli</th><th>version</th><th>plain text</th><th>schema JSON</th><th>sample output</th></tr></thead>
    <tbody>${live}</tbody>
  </table>
  <p class="muted">Proves the real <code>codex</code> / <code>gemini</code> binaries respond to the exact invocation each adapter uses (<code>codex exec</code> via stdin; <code>gemini -p &lt;prompt&gt;</code>). Schema column is best-effort and depends on the model returning valid JSON.</p>

  <footer>choros platform verification · generated by scripts/verify-platforms.ts</footer>
</main></body></html>
`
}

function buildMarkdown(data: any): string {
  const head = `| flow | ${data.platforms.join(' | ')} |\n|${'---|'.repeat(data.platforms.length + 1)}`
  const rows = data.flows.map((f: string) =>
    `| ${f} | ${data.platforms.map((p: string) => `${data.matrix[f][p].status} (${data.matrix[f][p].detail})`).join(' | ')} |`,
  ).join('\n')
  const live = ['codex', 'gemini'].map((p) => {
    const l = data.liveSmoke[p]
    return `- **${p}** (${l.version}): plain=${l.plain}, schema=${l.schema}${l.detail ? ` — \`${l.detail}\`` : ''}`
  }).join('\n')
  return `# choros — Platform Support Verification

Generated ${data.generatedAt} · ${data.summary.passed}/${data.summary.total} matrix cells passed.

CLIs — claude: ${data.cliVersions.claude} · codex: ${data.cliVersions.codex} · gemini: ${data.cliVersions.gemini}

## Flow × platform matrix

${head}
${rows}

- **claude**: packs to a valid, self-contained Claude Workflow script that compiles as a runnable body (run natively).
- **codex / gemini**: the flow's full orchestration runs through the real run adapter (spawn + stdin/\`-p\` + schema extract→validate) driven by a deterministic schema stub.

## Live CLI round-trip (real binaries)

${live}
`
}

async function main() {
  const generatedAt = new Date().toISOString()
  const cliVersions = {
    claude: cliVersion('claude', ['--version']),
    codex: cliVersion('codex', ['--version']),
    gemini: cliVersion('gemini', ['--version']),
  }
  const matrix: Record<string, Record<string, Cell>> = {}
  for (const flow of FLOWS) {
    matrix[flow] = {}
    matrix[flow].claude = await packCell(flow)
    matrix[flow].codex = await runCell(flow, 'codex')
    matrix[flow].gemini = await runCell(flow, 'gemini')
    const line = PLATFORMS.map((p) => `${p}:${matrix[flow][p].status}`).join('  ')
    console.log(`• ${flow.padEnd(24)} ${line}`)
  }

  const liveSmoke: Record<string, LiveResult> = {}
  for (const p of ['codex', 'gemini'] as const) {
    if (LIVE) {
      console.log(`• live smoke: ${p} …`)
      liveSmoke[p] = runLiveSmoke(p)
    } else {
      liveSmoke[p] = { available: false, plain: 'skipped', schema: 'skipped', detail: 'CHOROS_VERIFY_LIVE=0', version: cliVersions[p] }
    }
  }

  let passed = 0
  let total = 0
  for (const f of FLOWS) for (const p of PLATFORMS) { total++; if (matrix[f][p].status === 'pass') passed++ }

  const data = { generatedAt, cliVersions, flows: FLOWS, platforms: PLATFORMS, matrix, liveSmoke, summary: { passed, total } }

  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, 'platform-support-report.json'), JSON.stringify(data, null, 2))
  writeFileSync(resolve(outDir, 'platform-support-report.html'), buildHtml(data))
  writeFileSync(resolve(outDir, 'platform-support-report.md'), buildMarkdown(data))

  console.log(`\nMatrix: ${passed}/${total} cells passed`)
  console.log(`Live: codex plain=${liveSmoke.codex?.plain} schema=${liveSmoke.codex?.schema} · gemini plain=${liveSmoke.gemini?.plain} schema=${liveSmoke.gemini?.schema}`)
  console.log(`Report → verification/platform-support-report.html`)
  if (passed !== total) process.exitCode = 1
}

main()
