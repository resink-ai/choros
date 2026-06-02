/**
 * full-stack-ship — ship a change across three repos (Next.js frontend,
 * Python/SQLite backend, pyinfra deployment) as a single workflow:
 *
 *   Setup dev env → Plan (brainstorm over the codebases) → parallel TDD
 *   implementers for ONLY the repos that need changes (≤3) → Code review →
 *   Docker deployment test → Export a Markdown + self-contained HTML report.
 *
 * Run it:
 *   Workflow({ scriptPath: ".../full-stack-ship.workflow.js",
 *              args: { changeRequest: "Add CSV export to the reports page",
 *                      baseDir: "~/work", repos: { frontend: { path: "web" } } } })
 */

import { SETUP_SCHEMA, PLAN_SCHEMA, IMPL_SCHEMA, REVIEW_SCHEMA, DEPLOY_SCHEMA } from './schemas/index.js'
import { rules, repoSpecs, setupBrief, planBrief, implBrief, reviewBrief, deployBrief } from './prompts/index.js'
import { buildMarkdown, buildHtml } from './render.js'

export const meta = {
  name: 'full-stack-ship',
  description: 'Ship a change across a Next.js frontend, a Python/SQLite backend, and pyinfra deployment — setup, plan, parallel TDD, review, Docker deploy test',
  whenToUse: 'A change or production request spanning some or all of three repos (frontend / backend / deployment). Sets up the env, plans against the real codebases, implements only the repos that need changes in parallel with TDD, reviews, and validates the deployment in Docker.',
  phases: [
    { title: 'Setup', detail: 'Ensure the frontend, backend, and deployment repos are present (clone if needed)' },
    { title: 'Plan', detail: 'Explore the codebases and draft an execution plan; decide which repos need changes' },
    { title: 'Implement', detail: 'Up to 3 parallel TDD sub-agents — only for repos that need changes' },
    { title: 'Review', detail: 'Code-review the aggregated changes across repos' },
    { title: 'Deploy Test', detail: 'Build and run the stack in Docker; smoke-test it' },
    { title: 'Export', detail: 'Write a Markdown report and a deterministic, self-contained HTML page' },
  ],
}

export default async function run() {
  const _obj = (args && typeof args === 'object') ? args : {}
  const changeRequest = _obj.changeRequest || (typeof args === 'string' ? args : '') || 'No change request provided.'
  const baseDir = _obj.baseDir || cwd || '.'
  const outDir = _obj.outDir || 'full-stack-ship-reports'
  const specs = repoSpecs(_obj.repos)
  const RULES = rules()

  // ---- Phase 1: Setup dev env ---------------------------------------------
  phase('Setup')
  log(`Ensuring repos under ${baseDir}: ${specs.map((s) => s.key).join(', ')}`)
  const setup = await agent(
    `${setupBrief(specs, baseDir)}\n\n${RULES}`,
    { label: 'setup', phase: 'Setup', schema: SETUP_SCHEMA },
  )
  if (!setup.ready) {
    log('Setup reported repos not ready — continuing to plan, but implementation may be limited.')
  }

  // ---- Phase 2: Plan (brainstorm over the codebases) ----------------------
  phase('Plan')
  const plan = await agent(
    `${planBrief(changeRequest, specs)}\n\n${RULES}`,
    { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA },
  )
  const byName = Object.fromEntries((plan.repos || []).map((p) => [p.name, p]))
  const toChange = specs.filter((s) => byName[s.key] && byName[s.key].needsChanges)
  log(`Plan: ${toChange.length ? toChange.map((s) => s.key).join(', ') + ' need changes' : 'no repos need changes'}`)

  // ---- Phase 3: Parallel TDD implementers (only repos that need changes) --
  phase('Implement')
  const implementations = toChange.length
    ? (await parallel(
        toChange.map((s) => () =>
          agent(
            `${implBrief(s, byName[s.key], changeRequest)}\n\n${RULES}`,
            { label: `impl:${s.key}`, phase: 'Implement', schema: IMPL_SCHEMA },
          ),
        ),
      )).filter(Boolean)
    : []
  if (!implementations.length) log('No implementers spawned — no repo required changes.')

  // ---- Phase 4: Code review -----------------------------------------------
  phase('Review')
  const review = await agent(
    `${reviewBrief(changeRequest, implementations)}\n\n${RULES}`,
    { label: 'review', phase: 'Review', schema: REVIEW_SCHEMA },
  )

  // ---- Phase 5: Docker deployment test ------------------------------------
  phase('Deploy Test')
  const deploy = await agent(
    `${deployBrief(specs, implementations)}\n\n${RULES}`,
    { label: 'deploy-test', phase: 'Deploy Test', schema: DEPLOY_SCHEMA },
  )
  log(`Deployment test: ${deploy.status} (build ${deploy.dockerBuild})`)

  // ---- Phase 6: Export deterministic artifacts ----------------------------
  phase('Export')
  const report = { changeRequest, baseDir, setup, plan, implementations, review, deploy }
  const slug = (changeRequest.split('\n')[0] || 'change').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 48) || 'change'
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
    changeRequest,
    setup,
    plan,
    reposChanged: implementations.map((i) => i.repo),
    implementations,
    review,
    deploy,
    artifacts: { markdown: mdPath, html: htmlPath },
  }
}
