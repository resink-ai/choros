// Structured-output schemas for the first-principles-scout workflow.

export const DISCOVERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    products: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          source: { type: 'string', description: 'Where it surfaced, e.g. Hacker News, X, TechCrunch' },
          oneLiner: { type: 'string', description: 'What it claims to do, in one line' },
          launchedWhen: { type: 'string' },
          category: { type: 'string', description: 'e.g. dev tools, agents, image gen, infra' },
        },
        required: ['name', 'oneLiner', 'source'],
      },
    },
    notes: { type: 'array', items: { type: 'string' }, description: 'Search caveats, dedup notes, coverage gaps' },
  },
  required: ['products'],
}

export const PRODUCT_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    whatItDoes: { type: 'string', description: 'Grounded comprehension of the actual product' },
    targetUser: { type: 'string' },
    firstPrinciples: {
      type: 'object',
      additionalProperties: false,
      properties: {
        coreProblem: { type: 'string', description: 'The fundamental problem, stripped of buzzwords' },
        assumptionsChallenged: { type: 'array', items: { type: 'string' } },
        whyNow: { type: 'string', description: 'What changed (model capability, cost, distribution) that makes this viable now' },
      },
      required: ['coreProblem', 'whyNow'],
    },
    strengths: { type: 'array', items: { type: 'string' } },
    weaknesses: { type: 'array', items: { type: 'string' } },
    suggestedChanges: { type: 'array', items: { type: 'string' }, description: 'Concrete product changes you would make' },
    pitch: { type: 'string', description: 'A sharpened one-paragraph pitch / repositioning' },
    confidence: { type: 'number', description: '0-1 — how well you could actually comprehend it from available info' },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'whatItDoes', 'firstPrinciples', 'suggestedChanges', 'pitch'],
}
