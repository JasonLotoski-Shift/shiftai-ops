# Skill — Lead discovery (Firecrawl query crafting + result reading)

Turn a **TargetSegment** into ONE compact Firecrawl `/search` query string that surfaces real candidate company websites, and read the results to extract a company's website + bare domain. This is a discovery aid for the firm's lead engine — Apollo is the primary structured source; Firecrawl widens the net with open-web discovery and confirms firmographics/buying signals via `/scrape`.

The firm's voice, identity, and hard rules are in the firm context above. The no-hallucination rule applies: never invent a company or a domain — only extract what a result actually shows.

## What you're invoked to do

When called via `generate({ skill: "lead-discovery-firecrawl" })`, you receive the segment spec (industries, geographies, priorityLocation, employee/revenue bands, buyingSignals) as the context block and an instruction to craft a query. **Return ONLY a single-line compact search query string** — no prose, no quotes, no JSON, no markdown. The pipeline feeds your line straight into `/search`.

## Query construction (the D22 templates)

Build a short, real search query — the kind a person types, not a sentence:

- Lead with the **1–2 strongest verticals** from `industries` (the most concrete named ones).
- Add the **geography** — prefer `priorityLocation`; else the first entry in `geographies`. Use the place name as a human would ("Ontario", "Texas", "United Kingdom").
- Optionally add **one** intent/buying-signal keyword from `buyingSignals` when it sharpens discovery (e.g. "ERP rollout", "Series B", "expanding").
- Phrase for **site discovery**, not articles. Templates:
  - `<industry> companies in <geo>`
  - `<industry> <geo> <signal>`
  - `<industry> manufacturers <geo>`
- Keep it under ~12 words. A tighter query beats a stuffed one.

**Deterministic fallback** (what the pipeline builds without calling you, so mirror its spirit): `${industries[0]} companies ${priorityLocation ?? geographies[0]} ${buyingSignals[0] ?? ""}`.

## Reading `/search` results

Each result has `title`, `url`, `description`, and optionally `markdown`. To get a candidate company:

- Extract the **root domain** from `url`: strip scheme, `www.`, and any path; lowercase. `https://www.acme-parts.com/about` → `acme-parts.com`.
- **Skip aggregators, directories, social, and news** — they are not companies. Exclude hosts containing: `linkedin.com`, `facebook.com`, `twitter.com`, `x.com`, `instagram.com`, `youtube.com`, `crunchbase.com`, `wikipedia.org`, `glassdoor.com`, `indeed.com`, `yelp.com`, `bloomberg.com`, `reuters.com`, `forbes.com`, `medium.com`, `reddit.com`, and obvious directory/marketplace domains.
- Prefer a result whose domain looks like a single company's own site (the `title`/`description` describe one business, not a list).

## When to `/scrape` a candidate site

After a domain is chosen, scrape its site (homepage or `/about`, `/news`) when Apollo enrich is thin, to confirm:

- **Firmographics** — what they do, rough size, HQ location, the vertical.
- **Buying signals** — recent funding, expansion, a new exec, a system rollout, a regulatory deadline — anything matching the segment's `buyingSignals`.

Keep scrapes scoped to the one candidate's own domain. Pull a short signal snippet, not the whole site.

## Hard rules

- Output (when crafting a query) is exactly one line: the query string. Nothing else.
- Never fabricate a company or a domain — extract only what a result shows.
- Exclude aggregator/social/news/directory hosts from candidate domains.
- Domains are bare and lowercase (no scheme, no `www.`, no path).
