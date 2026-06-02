// Prompt builders for the full-stack-ship workflow.

/** Shared discipline rules injected into every agent prompt. */
export function rules() {
  return `
Use the tools actually available to you (shell/git/docker, file read & write, search —
discover them via ToolSearch if needed). Ground every claim in what you actually observe
in the repos or command output; never invent file paths, test results, or command output.
If a command fails or you cannot verify something, say so explicitly rather than guessing.`.trim()
}

/** Default repo descriptors; overridable via args.repos. */
export function repoSpecs(repos) {
  const r = repos || {}
  return [
    {
      key: 'frontend',
      kind: 'Next.js frontend',
      path: (r.frontend && r.frontend.path) || 'frontend',
      url: (r.frontend && r.frontend.url) || '',
      stack: 'Next.js (App Router) + TypeScript; tests with the project test runner (e.g. Jest/Vitest); lint via the project lint script.',
    },
    {
      key: 'backend',
      kind: 'Python backend (SQLite)',
      path: (r.backend && r.backend.path) || 'backend',
      url: (r.backend && r.backend.url) || '',
      stack: 'Python service backed by SQLite; tests with pytest; dependencies via the project tooling (uv/pip).',
    },
    {
      key: 'deployment',
      kind: 'pyinfra deployment',
      path: (r.deployment && r.deployment.path) || 'deployment',
      url: (r.deployment && r.deployment.url) || '',
      stack: 'pyinfra deploy scripts (operations/host configs); validated by dry-run/compile and by the Docker deploy test.',
    },
  ]
}

export function setupBrief(specs, baseDir) {
  const lines = specs
    .map((s) => `- ${s.key} (${s.kind}): expected at "${baseDir}/${s.path}"${s.url ? ` — clone from ${s.url} if missing` : ' — no URL provided; report missing if absent'}`)
    .join('\n')
  return `You are the DEV-ENV SETUP step. Ensure the three repositories below exist and are
usable under the base directory "${baseDir}". For each repo: if the directory exists and is a
git repo, record it as "exists"; if it is absent and a clone URL is given, clone it and record
"cloned"; otherwise record "missing". Do NOT modify any source files in this step — only ensure
presence and report the resolved branch/commit where you can.

Repos:
${lines}

Report a structured setup result.`
}

export function planBrief(changeRequest, specs) {
  const repoList = specs.map((s) => `- ${s.key} (${s.kind}) at "${s.path}": ${s.stack}`).join('\n')
  return `You are the PLANNING step — think like the /brainstorming skill: explore the existing
codebases, understand the request, and draft a concrete execution plan BEFORE any code is written.

Change request:
${changeRequest}

Repositories in play:
${repoList}

Investigate each repo enough to decide whether it needs changes for THIS request. Read relevant
files, existing patterns, and tests. Then produce a plan that, for EACH of the three repos, states
needsChanges (true/false), the scope (what changes, or why it is untouched), concrete tasks, and
risks. Be decisive about which repos are in scope — repos with needsChanges=false will be skipped
entirely in implementation. List any open questions that materially affect the plan.`
}

export function implBrief(spec, planEntry, changeRequest) {
  return `You are the ${spec.key.toUpperCase()} IMPLEMENTER (${spec.kind}) working in "${spec.path}".
Implement the planned changes for this repo using strict TEST-DRIVEN DEVELOPMENT: write a failing
test first, make it pass with the minimal change, refactor, and keep the suite green. ${spec.stack}

Original change request:
${changeRequest}

Planned scope for this repo:
${planEntry.scope}
Planned tasks:
${(planEntry.tasks || []).map((t) => `- ${t}`).join('\n') || '- (derive from scope)'}

Make focused commits-worth of changes (do not commit unless the environment expects it), run the
repo's tests, and report exactly which files changed, the test command you ran and its result,
whether tests passed, and any follow-ups. If you become blocked, report status "blocked" with why.`
}

export function reviewBrief(changeRequest, implResults) {
  return `You are the CODE REVIEWER. Review the changes just made across the repos for correctness,
adherence to the change request, test quality, and obvious security/maintainability issues. Inspect
the actual diffs (e.g. via git in each repo). Be specific and cite repo + file. Classify findings
as critical/important/minor and issue an overall verdict (approve / approve_with_changes / reject).

Change request:
${changeRequest}

Implementation results so far:
${JSON.stringify(implResults)}`
}

export function deployBrief(specs, implResults) {
  return `You are the DEPLOYMENT TEST step. Validate the change end-to-end using Docker: build the
images for the changed services, bring the stack up (e.g. docker compose), wait for health, and run
a few smoke checks (frontend reachable, backend responds, a key endpoint works). The pyinfra
deployment repo defines how services are wired — use it to inform the Docker setup. Tear the stack
down when done. Report the docker build outcome, per-service status, smoke-test results, an overall
pass/fail, and a short summary of any failing logs. If Docker is unavailable, report status
"skipped" and explain.

Repos:
${specs.map((s) => `- ${s.key}: ${s.path}`).join('\n')}

Implementation results:
${JSON.stringify(implResults)}`
}
