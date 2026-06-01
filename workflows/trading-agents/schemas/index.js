export const ANALYST_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        analyst: { type: 'string' },
        summary: { type: 'string', description: 'Tight 3-6 sentence read' },
        signal: { type: 'string', enum: ['bullish', 'bearish', 'neutral'] },
        confidence: { type: 'number', description: '0-1' },
        keyPoints: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        dataGaps: { type: 'array', items: { type: 'string' } },
        sources: { type: 'array', items: { type: 'string' } },
    },
    required: ['analyst', 'summary', 'signal', 'confidence', 'keyPoints'],
}

export const RESEARCH_VERDICT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        stance: { type: 'string', enum: ['bullish', 'bearish', 'mixed'] },
        conviction: { type: 'number', description: '0-1' },
        lean: { type: 'string', enum: ['buy', 'hold', 'sell'] },
        strongestBullArgument: { type: 'string' },
        strongestBearArgument: { type: 'string' },
        rationale: { type: 'string' },
    },
    required: ['stance', 'conviction', 'lean', 'rationale'],
}

export const TRADE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        action: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
        sizePct: { type: 'number', description: 'Suggested position size as % of book' },
        entry: { type: 'string' },
        stopLoss: { type: 'string' },
        takeProfit: { type: 'string' },
        timeframe: { type: 'string' },
        rationale: { type: 'string' },
    },
    required: ['action', 'rationale'],
}

export const RISK_REVIEW_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        perspective: { type: 'string' },
        assessment: { type: 'string' },
        mainConcern: { type: 'string' },
        suggestedAdjustment: { type: 'string' },
        verdict: { type: 'string', enum: ['approve', 'approve_with_changes', 'reject'] },
    },
    required: ['perspective', 'assessment', 'verdict'],
}

export const RISK_MANAGER_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        riskRating: { type: 'string', enum: ['low', 'medium', 'high'] },
        approvedForPM: { type: 'boolean' },
        requiredAdjustments: { type: 'array', items: { type: 'string' } },
        rationale: { type: 'string' },
    },
    required: ['riskRating', 'approvedForPM', 'rationale'],
}

export const PM_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        decision: { type: 'string', enum: ['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'] },
        finalAction: { type: 'string' },
        positionSizePct: { type: 'number' },
        rationale: { type: 'string' },
        keyRisks: { type: 'array', items: { type: 'string' } },
        conditions: { type: 'array', items: { type: 'string' } },
    },
    required: ['decision', 'finalAction', 'rationale'],
}
