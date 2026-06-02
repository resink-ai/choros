// Structured-output schemas for the full-stack-ship workflow.

export const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ready: { type: 'boolean', description: 'True if all required repos are present and usable' },
    repos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', enum: ['frontend', 'backend', 'deployment'] },
          path: { type: 'string' },
          action: { type: 'string', enum: ['exists', 'cloned', 'missing'] },
          ref: { type: 'string', description: 'Resolved branch/commit, if known' },
        },
        required: ['name', 'path', 'action'],
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ready', 'repos'],
}

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', description: '3-6 sentence read of the request and the approach' },
    repos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', enum: ['frontend', 'backend', 'deployment'] },
          needsChanges: { type: 'boolean' },
          scope: { type: 'string', description: 'What changes here, or why it is untouched' },
          tasks: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'needsChanges', 'scope'],
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'repos'],
}

export const IMPL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    repo: { type: 'string', enum: ['frontend', 'backend', 'deployment'] },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsRun: { type: 'string', description: 'Command(s) run and a one-line result' },
    testsPassed: { type: 'boolean' },
    summary: { type: 'string' },
    followups: { type: 'array', items: { type: 'string' } },
  },
  required: ['repo', 'status', 'summary', 'testsPassed'],
}

export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['approve', 'approve_with_changes', 'reject'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          repo: { type: 'string', enum: ['frontend', 'backend', 'deployment'] },
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          file: { type: 'string' },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['repo', 'severity', 'issue'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['verdict', 'summary'],
}

export const DEPLOY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
    dockerBuild: { type: 'string', enum: ['success', 'failure', 'skipped'] },
    services: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          status: { type: 'string', enum: ['up', 'unhealthy', 'failed'] },
        },
        required: ['name', 'status'],
      },
    },
    smokeTests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          passed: { type: 'boolean' },
        },
        required: ['name', 'passed'],
      },
    },
    logsSummary: { type: 'string' },
  },
  required: ['status', 'dockerBuild'],
}
