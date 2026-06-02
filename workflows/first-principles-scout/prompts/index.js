// Prompt builders for the first-principles-scout workflow.

/** Shared discipline rules injected into every agent prompt. */
export function rules(since) {
  return `
Use the tools actually available to you (web search, page fetch, news/social tools — discover them
via ToolSearch). Ground EVERY claim in sources you actually retrieve; cite URLs. Consider only
launches from ${since}. If you cannot verify a detail (pricing, traction, who built it), say so —
never fabricate metrics, quotes, or features. This is research/opinion only, not investment advice.`.trim()
}

export function discoveryBrief(sources, maxProducts, since, focus) {
  const focusLine = focus ? `\nBias toward this theme where possible: ${focus}.` : ''
  return `You are the DISCOVERY step. Search ${sources.join(', ')} for the latest LAUNCHED AI
products from ${since} — prefer "Show HN", Product Hunt-style launches, launch threads, and
launch coverage over rumors or funding news. Find up to ${maxProducts} distinct, real products
that actually shipped something usable.${focusLine}

Deduplicate, skip vaporware and pure funding announcements, and for each product capture: name,
URL, the source it surfaced on, a one-line description, roughly when it launched, and a category.
Return a structured discovery result and note any coverage gaps.`
}

export function analysisBrief(product, since) {
  return `You are a FIRST-PRINCIPLES PRODUCT THINKER analyzing a freshly launched AI product.

Product: ${product.name}
URL: ${product.url || '(none given — find it)'}
Source: ${product.source}
Claimed: ${product.oneLiner}
Category: ${product.category || '(infer)'}

First, COMPREHEND the product for real: read its site/launch post/docs and explain what it actually
does and who it is for — not its marketing. Then reason from FIRST PRINCIPLES: strip it to the core
problem, name the assumptions it challenges, and explain why it is viable now (model capability,
cost curve, new distribution, etc.). Assess genuine strengths and weaknesses. Finally propose
concrete product changes you would make and write a sharpened one-paragraph pitch / repositioning
for it. Give a 0-1 confidence reflecting how well you could actually verify the product.`
}
