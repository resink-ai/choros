/**
 * first-principles-scout — find newly launched AI products and reason about
 * them from first principles:
 *
 *   Discover (search Hacker News / X / news for fresh AI launches)
 *   → Analyze each product in parallel (comprehend it for real, strip it to
 *     first principles, critique it, and pitch concrete changes)
 *   → Export a Markdown report + a deterministic, self-contained HTML page.
 *
 * Run it:
 *   Workflow({ scriptPath: ".../first-principles-scout.workflow.js",
 *              args: { maxProducts: 5, since: "the last 7 days",
 *                      focus: "developer agents" } })
 *
 * Research/opinion only — not investment advice.
 */

import { DISCOVERY_SCHEMA, PRODUCT_ANALYSIS_SCHEMA } from './schemas/index.js'
import { rules, discoveryBrief, analysisBrief } from './prompts/index.js'
import { buildMarkdown, buildHtml } from './render.js'

export const meta = {
  name: 'first-principles-scout',
  description: 'Scout newly launched AI products (Hacker News / X / news), then reason from first principles to comprehend each and pitch improvements',
  whenToUse: 'Find the latest launched AI products and get a first-principles teardown plus an improvement pitch for each. Research/opinion only — not investment advice.',
  phases: [
    { title: 'Discover', detail: 'Search Hacker News, X, and news for the latest launched AI products' },
    { title: 'Analyze', detail: 'For each product, comprehend it and reason from first principles; pitch changes' },
    { title: 'Export', detail: 'Write a Markdown report and a deterministic, self-contained HTML page' },
  ],
}

export default async function run() {
  const _obj = (args && typeof args === 'object') ? args : {}
  const _text = (typeof args === 'string') ? args : ''
  const sources = _obj.sources || ['Hacker News', 'X/Twitter', 'tech news']
  const maxProducts = _obj.maxProducts || 5
  const since = _obj.since || (_text.match(/\b\d{4}-\d{2}-\d{2}\b/) ? `since ${_text.match(/\b\d{4}-\d{2}-\d{2}\b/)[0]}` : 'the last 7 days')
  const focus = _obj.focus || (_text && !/\d{4}-\d{2}-\d{2}/.test(_text) ? _text : '')
  const outDir = _obj.outDir || 'first-principles-scout-reports'
  const RULES = rules(since)

  // ---- Phase 1: Discover ---------------------------------------------------
  phase('Discover')
  log(`Searching ${sources.join(', ')} for AI launches (${since})`)
  const discovery = await agent(
    `${discoveryBrief(sources, maxProducts, since, focus)}\n\n${RULES}`,
    { label: 'discover', phase: 'Discover', schema: DISCOVERY_SCHEMA },
  )
  const products = (discovery.products || []).slice(0, maxProducts)
  log(`Discovered ${products.length} product(s): ${products.map((p) => p.name).join(', ') || '(none)'}`)

  // ---- Phase 2: Analyze each product (fan out) ----------------------------
  phase('Analyze')
  const analyses = (await pipeline(
    products,
    (product) =>
      agent(
        `${analysisBrief(product, since)}\n\n${RULES}`,
        { label: `analyze:${(product.name || 'product').slice(0, 24)}`, phase: 'Analyze', schema: PRODUCT_ANALYSIS_SCHEMA },
      ),
  )).filter(Boolean)
  log(`Analyzed ${analyses.length} product(s)`)

  // ---- Phase 3: Export deterministic artifacts ----------------------------
  phase('Export')
  const report = { since, sources, discoveryNotes: discovery.notes, analyses }
  const slug = `ai-launches-${since}`.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 48)
  const mdPath = `${outDir}/${slug}.md`
  const htmlPath = `${outDir}/${slug}.html`
  const markdown = buildMarkdown(report)
  const html = buildHtml(report)
  await agent(
    `Write two pre-rendered report files to disk EXACTLY as given — byte for byte. Do NOT edit,
   reformat, summarize, or add anything of your own. Create the directory "${outDir}" if it does not
   exist, then use the Write tool to create each file with the exact content between its markers (do
   not include the marker lines). Reply with only the two file paths.

=== FILE A === path: ${mdPath}
<<<<<<MARKDOWN_BEGIN
${markdown}
MARKDOWN_END>>>>>>

=== FILE B === path: ${htmlPath}
<<<<<<HTML_BEGIN
${html}
HTML_END>>>>>>`,
    { label: 'export', phase: 'Export' },
  )
  log(`Exported report → ${mdPath} and ${htmlPath}`)

  return {
    since,
    sources,
    products,
    analyses,
    artifacts: { markdown: mdPath, html: htmlPath },
    disclaimer: 'Research/opinion only. Not investment advice.',
  }
}
