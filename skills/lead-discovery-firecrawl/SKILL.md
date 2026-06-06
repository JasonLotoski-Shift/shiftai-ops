---
description: Firecrawl enrichment (site scrape for buying signals) within the lead discovery engine.
---

# Skill — Lead discovery (Firecrawl enrichment)

Scrape a **single chosen company's own website** for buying signals during stage-2 enrichment of the firm's lead engine. Apollo finds and structures the candidate pool; Firecrawl's only job here is to read one finalist's site and surface a short signal snippet that sharpens the AI re-rank. Firecrawl no longer sources or discovers companies — it does not craft search queries and it does not read `/search` results.

The firm's voice, identity, and hard rules are in the firm context above. The no-hallucination rule applies: never invent a company, a fact, or a signal — only report what the scraped page actually shows.

## What you're invoked to do

During stage 2, once a finalist domain is selected, the pipeline calls `firecrawlScrape` on that one company's own site (homepage, or `/about` / `/news` when available). You read the returned markdown and extract a compact signal snippet that confirms firmographics and surfaces buying signals for the segment.

## Scope

- Scrape **only the one candidate's own domain**. Never branch out to other sites, aggregators, directories, social, or news.
- Pull a **short signal snippet**, not the whole site. A few sentences of evidence is enough.

## What to look for

Read the page for firmographic confirmation and any buying signals that match the segment's `buyingSignals`:

- **Firmographics** — what they do, rough size, HQ location, the vertical.
- **Buying signals** — expansion or new facility, an ERP / MES rollout, recent funding, a new executive hire, reshoring, a regulatory or compliance deadline — anything that signals readiness to buy.

Report only signals the page actually states. If the page is thin or shows nothing relevant, say so rather than inferring.

## What to return

Return only the signal snippet, 2-4 sentences, no preamble: firmographic confirmation first (what they do, rough size, HQ, vertical), then any buying signal the page actually states. If the page is thin, return exactly `no relevant signal on page`.

## Hard rules

- Scrape is scoped to the single finalist's own domain — never widen the net.
- Pull a short snippet, not the full site.
- Never fabricate a company, a fact, or a buying signal — report only what the scraped page shows.
- This skill does not discover companies, craft search queries, or read `/search` results.
