import { ANALYST_SCHEMA, RESEARCH_VERDICT_SCHEMA, TRADE_SCHEMA, RISK_REVIEW_SCHEMA, RISK_MANAGER_SCHEMA, PM_SCHEMA } from './schemas/index.js'
import { dataRules, analysts as analystSpecs, RISK_VIEWS } from './prompts/index.js'
import { buildMarkdown, buildHtml } from './render.js'

export const meta = {
  name: 'trading-agents',
  description: 'Multi-agent equity analysis (analysts → bull/bear debate → trader → risk → PM)',
  whenToUse: 'Deep, multi-perspective analysis of a single ticker that ends in a rated, risk-checked decision. Research only — not financial advice.',
  phases: [
    { title: 'Analysts', detail: '4 analysts gather data in parallel: fundamentals, sentiment, news, technical' },
    { title: 'Research Debate', detail: 'Bull vs bear researchers debate over N rounds' },
    { title: 'Research Verdict', detail: 'Research manager judges the debate' },
    { title: 'Trader', detail: 'Trader turns the verdict into a concrete proposal' },
    { title: 'Risk Debate', detail: 'Aggressive / neutral / conservative risk reviewers stress-test the trade' },
    { title: 'Portfolio Manager', detail: 'Final approve/reject with a 5-tier rating' },
    { title: 'Export', detail: 'Write a Markdown report and a deterministic, self-contained HTML page' },
  ],
}

export default async function run() {
  const _obj = (args && typeof args === 'object') ? args : {}
  const _text = (typeof args === 'string') ? args : ''
  const _ticker = _text.match(/\b[A-Z]{1,6}(?:\.[A-Z]{1,3})?\b/)
  const _date = _text.match(/\b\d{4}-\d{2}-\d{2}\b/)
  const ticker = _obj.ticker || (_ticker && _ticker[0]) || 'NVDA'
  const date = _obj.date || (_date && _date[0]) || 'the most recent trading day'
  const debateRounds = _obj.debateRounds || 2
  const riskRounds = _obj.riskRounds || 1
  const outDir = _obj.outDir || 'trading-agents-reports'
  const DATA_RULES = dataRules(date)

  phase('Analysts')
  log(`Analyzing ${ticker} as of ${date} — dispatching 4 analysts`)
  const analystReports = (await parallel(
    analystSpecs(ticker).map((a) => () =>
      agent(`${a.brief}\n\n${DATA_RULES}\n\nReturn a structured analyst report for ${ticker}.`,
        { label: `analyst:${a.key}`, phase: 'Analysts', schema: ANALYST_SCHEMA }),
    ),
  )).filter(Boolean)
  const analystDigest = analystReports
    .map((r) => `### ${r.analyst} — signal: ${r.signal} (conf ${r.confidence})\n${r.summary}\nKey: ${(r.keyPoints || []).join('; ')}\nRisks: ${(r.risks || []).join('; ')}`)
    .join('\n\n')

  phase('Research Debate')
  let transcript = ''
  for (let round = 1; round <= debateRounds; round++) {
    const bull = await agent(
      `You are the BULLISH RESEARCHER debating ${ticker} (round ${round}/${debateRounds}).\n     Build the strongest evidence-based case to BUY/hold long. Rebut the bear's latest points.\n\n     Analyst reports:\n${analystDigest}\n\nDebate so far:\n${transcript || '(none yet)'}\n\n${DATA_RULES}`,
      { label: `bull:r${round}`, phase: 'Research Debate' })
    transcript += `\n\n[Round ${round}] BULL: ${bull}`
    const bear = await agent(
      `You are the BEARISH RESEARCHER debating ${ticker} (round ${round}/${debateRounds}).\n     Build the strongest evidence-based case to AVOID/short. Directly rebut the bull's points above.\n\n     Analyst reports:\n${analystDigest}\n\nDebate so far:\n${transcript}\n\n${DATA_RULES}`,
      { label: `bear:r${round}`, phase: 'Research Debate' })
    transcript += `\n\n[Round ${round}] BEAR: ${bear}`
    log(`Research debate round ${round}/${debateRounds} complete`)
  }

  phase('Research Verdict')
  const researchVerdict = await agent(
    `You are the RESEARCH MANAGER. Judge the bull/bear debate on ${ticker} objectively and\n   declare a balanced verdict. Weigh which side argued from stronger evidence.\n\n   Analyst reports:\n${analystDigest}\n\nFull debate:\n${transcript}`,
    { label: 'research-manager', phase: 'Research Verdict', schema: RESEARCH_VERDICT_SCHEMA })

  phase('Trader')
  const trade = await agent(
    `You are the TRADER. Compose the analyst reports and the research manager's verdict into\n   a concrete, actionable proposal for ${ticker} as of ${date}. Decide timing and magnitude.\n\n   Research verdict: ${JSON.stringify(researchVerdict)}\n\nAnalyst reports:\n${analystDigest}`,
    { label: 'trader', phase: 'Trader', schema: TRADE_SCHEMA })

  phase('Risk Debate')
  let riskReviews = []
  for (let round = 1; round <= riskRounds; round++) {
    const priorRisk = riskReviews.length
      ? `\n\nPrior-round risk views:\n${riskReviews.map((r) => `${r.perspective}: ${r.assessment}`).join('\n')}`
      : ''
    riskReviews = (await parallel(
      RISK_VIEWS.map((v) => () =>
        agent(`You are the ${v.key.toUpperCase()} RISK REVIEWER for the proposed ${ticker} trade.\n         ${v.brief}\n\nProposed trade: ${JSON.stringify(trade)}\nResearch verdict: ${JSON.stringify(researchVerdict)}${priorRisk}\n\n${DATA_RULES}`,
          { label: `risk:${v.key}:r${round}`, phase: 'Risk Debate', schema: RISK_REVIEW_SCHEMA }),
      ),
    )).filter(Boolean)
    log(`Risk debate round ${round}/${riskRounds} complete`)
  }
  const riskManagerCall = await agent(
    `You are the RISK MANAGER. Synthesize the risk reviewers into a single risk assessment for\n   the ${ticker} trade. Decide whether it is fit to forward to the Portfolio Manager and what\n   adjustments are required.\n\n   Proposed trade: ${JSON.stringify(trade)}\nRisk reviews: ${JSON.stringify(riskReviews)}`,
    { label: 'risk-manager', phase: 'Risk Debate', schema: RISK_MANAGER_SCHEMA })

  phase('Portfolio Manager')
  const decision = await agent(
    `You are the PORTFOLIO MANAGER making the final call on ${ticker} as of ${date}.\n   Approve or reject the trade and issue a 5-tier rating\n   (Buy / Overweight / Hold / Underweight / Sell). Be decisive but honor the risk\n   manager's required adjustments.\n\n   Research verdict: ${JSON.stringify(researchVerdict)}\n   Proposed trade: ${JSON.stringify(trade)}\n   Risk manager: ${JSON.stringify(riskManagerCall)}\n\n   Reminder: this is research/education only, not financial advice. State that in your rationale.`,
    { label: 'portfolio-manager', phase: 'Portfolio Manager', schema: PM_SCHEMA })
  log(`Final rating for ${ticker}: ${decision.decision}`)

  phase('Export')
  const report = { ticker, date, decision, riskManager: riskManagerCall, trade, researchVerdict, analysts: analystReports }
  const slug = `${ticker}-${date}`.replace(/[^A-Za-z0-9._-]+/g, '_')
  const mdPath = `${outDir}/${slug}.md`
  const htmlPath = `${outDir}/${slug}.html`
  const markdown = buildMarkdown(report)
  const html = buildHtml(report)
  await agent(
    `Write two pre-rendered report files to disk EXACTLY as given — byte for byte. Do NOT edit,\n   reformat, summarize, pretty-print, or add anything of your own. Create the directory "${outDir}"\n   if it does not exist, then use the Write tool to create each file with the exact content between\n   its markers (do not include the marker lines). Reply with only the two file paths.\n\n=== FILE A === path: ${mdPath}\n<<<<<<MARKDOWN_BEGIN\n${markdown}\nMARKDOWN_END>>>>>>\n\n=== FILE B === path: ${htmlPath}\n<<<<<<HTML_BEGIN\n${html}\nHTML_END>>>>>>`,
    { label: 'export', phase: 'Export' })
  log(`Exported report → ${mdPath} and ${htmlPath}`)

  return {
    ticker, date, decision, riskManager: riskManagerCall, trade, researchVerdict,
    analysts: analystReports, artifacts: { markdown: mdPath, html: htmlPath },
    disclaimer: 'Research/education only. Not financial, investment, or trading advice.',
  }
}
