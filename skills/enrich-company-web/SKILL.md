# Skill — Enrich company profile (web mode)

Read a client company's record, then **propose** additions to its company profile — company size, headquarters, founded, website, ownership, a short description, and notable key facts — using **web search** to find public, authoritative facts about the company. Updates are proposed and merged append-only by the partner; nothing here overwrites an existing field.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the company record (company name, industry, and any already-known website / company size / headquarters / founded / ownership / description / key facts). Use the company name (and website if present) to make sure you're profiling the right firm and not a similarly named one.

## How to use web search

- Search by **company name + industry** (and website domain if known) to disambiguate.
- Prefer **authoritative sources**: the company's own website (About / company pages), reputable business directories, regulatory filings, and established trade press. Avoid scraped aggregators and unverifiable listings.
- Cite the source for every fact. Put a short `(source: <domain or URL>)` at the end of the `value`, e.g. `"Roughly 200–250 employees across two plants (source: company About page)."`
- If the searches don't clearly resolve to this exact company, **don't guess** — return fewer or zero additions.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "additions": [
    { "field": "headquarters", "value": "Hamilton, Ontario (source: company contact page)" },
    { "field": "founded", "value": "1998 (source: company About page)" },
    { "field": "companySize", "value": "Roughly 200–250 employees (source: trade-press profile)" },
    { "field": "ownership", "value": "Privately held, family-owned (source: company About page)" },
    { "field": "website", "value": "acme-fleet.com (source: company site)" },
    { "field": "description", "value": "Regional commercial-fleet maintenance and upfitting provider serving Ontario and Quebec (source: company site)." },
    { "field": "companyKeyFacts", "value": "Opened a second service facility in Q3 2025 (source: regional business journal)." },
    { "field": "companyKeyFacts", "value": "Named to a 2024 fastest-growing-firms list (source: awards listing)." }
  ],
  "conflicts": [
    { "field": "headquarters", "existing": "Toronto, ON", "proposed": "Hamilton, ON", "note": "Company site lists Hamilton as HQ; Toronto may be a satellite office." }
  ]
}
```

- `field` must be exactly one of: `companySize`, `headquarters`, `founded`, `website`, `ownership`, `description`, `companyKeyFacts`.
- `companySize`, `headquarters`, `founded`, `website`, `ownership`, `description` are single-value fields. `companyKeyFacts` is a **list** — emit one addition per fact.
- Put a single-value item in **`additions`** only when that field is currently empty in the record. If it's already set and your finding differs, put it in **`conflicts`** instead (never silently overwrite).
- For `companyKeyFacts`, emit one addition per genuinely new fact (not already on the record).
- `website`: emit the bare domain (e.g. `acme-fleet.com`), no `https://` prefix — match how the record stores it.

## Hard rules for this task

- **Only state what a source supports.** Every `value` must trace to a source you actually found. No estimated revenue, no invented headcounts, no guessed ownership. Cite each one.
- **Public + factual only.** Company-level public facts only. No speculation about strategy, financials you can't source, or anything unverifiable.
- **Mark uncertainty.** If a source is weak or you're unsure it's the same company, drop the item or add a brief `(unverified)` note.
- **Don't repeat what's already there.** Compare against the existing record fields in the context block before proposing.
- **Be concise.** One sentence per addition, source tag included. No filler.
- If there is nothing defensible to add, return `{ "additions": [], "conflicts": [] }`.
