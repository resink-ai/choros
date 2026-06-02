export function dataRules(date) {
  return `
Ground every claim in data you actually retrieve using the tools available to you
(web search, market-data, news, and social tools — discover them via ToolSearch).
Treat the analysis date as ${date} and do not use information from after it.
If you cannot retrieve a figure, say so explicitly under dataGaps — never fabricate
numbers, prices, or quotes.`.trim()
}

export function analysts(ticker) {
  return [
    { key: 'fundamentals', brief: `You are the FUNDAMENTALS ANALYST. Evaluate ${ticker}'s financials and performance metrics — revenue/earnings trend, margins, growth, balance sheet, valuation multiples vs peers. Identify intrinsic value and red flags.` },
    { key: 'sentiment', brief: `You are the SENTIMENT ANALYST. Aggregate recent news headlines, StockTwits, and Reddit chatter on ${ticker} into a single short-term market-mood read.` },
    { key: 'news', brief: `You are the NEWS ANALYST. Monitor global news and macro indicators relevant to ${ticker}; interpret how recent events and the macro backdrop affect it.` },
    { key: 'technical', brief: `You are the TECHNICAL ANALYST. Use technical indicators (trend, MACD, RSI, moving averages, volume, support/resistance) to read ${ticker}'s price action and near-term setup.` },
  ]
}

export const RISK_VIEWS = [
  { key: 'aggressive', brief: 'You favor higher risk/reward; defend the upside and argue for keeping or increasing exposure where justified.' },
  { key: 'neutral', brief: 'You are balanced; weigh reward against downside dispassionately.' },
  { key: 'conservative', brief: 'You prioritize capital preservation; surface tail risks and argue for caution or smaller size.' },
]
