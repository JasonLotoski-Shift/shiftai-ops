# Skill — Enrich company profile (web mode)

Read a company record — a signed **client** or a pipeline **deal** — then **propose** additions to its company profile — size, headquarters, founded, website, socials, ownership, a short description, revenue and headcount figures, the systems they run, their pain points, brand colors, and notable key facts — using **web search** to find public, authoritative facts about the company. Updates are proposed and merged append-only by the partner; nothing here overwrites an existing field. The same skill serves both record kinds; the server filters the fields each kind accepts.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the company record (record kind, company name, industry, and any already-known website / company size / headquarters / founded / ownership / description / socials / figures / key facts). Use the company name (and website if present) to make sure you're profiling the right firm and not a similarly named one.

## How to use web search

- Search by **company name + industry** (and website domain if known) to disambiguate.
- Prefer **authoritative sources**: the company's own website (About / company pages), reputable business directories, regulatory filings, and established trade press. Avoid scraped aggregators and unverifiable listings.
- Cite the source for every fact. Put a short `(source: <domain or URL>)` at the end of the `value`, e.g. `"Roughly 200–250 employees across two plants (source: company About page)."`
- If the searches don't clearly resolve to this exact company, **don't guess** — return fewer or zero additions.
- **Brand colors:** read the client's brand colors off their own website (header, logo, primary buttons, or a public brand/press kit). Emit each as a hex value, **primary first, secondary second**, e.g. `#1A5C7A`; a short role label after the hex is fine (`#1A5C7A primary`). Best-effort: if you can't read exact colors, give your closest read tagged `(approx)`, or skip rather than guess wildly. These drive client-tailored deliverables, so getting the primary right matters most.

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
    { "field": "linkedinUrl", "value": "https://www.linkedin.com/company/acme-fleet (source: LinkedIn)" },
    { "field": "employeeCount", "value": "220 (source: trade-press profile)" },
    { "field": "subIndustry", "value": "Commercial-fleet maintenance and upfitting (source: company site)" },
    { "field": "description", "value": "Regional commercial-fleet maintenance and upfitting provider serving Ontario and Quebec (source: company site)." },
    { "field": "companyKeyFacts", "value": "Opened a second service facility in Q3 2025 (source: regional business journal)." },
    { "field": "companyKeyFacts", "value": "Named to a 2024 fastest-growing-firms list (source: awards listing)." },
    { "field": "currentSystems", "value": "Dispatch runs on a legacy AS/400 system (source: trade-press interview)." },
    { "field": "painPoints", "value": "Technician scheduling is manual across both facilities (source: trade-press interview)." },
    { "field": "brandColors", "value": "#1A5C7A primary (source: company site header)" },
    { "field": "brandColors", "value": "#F0A500 secondary (source: company site)" }
  ],
  "conflicts": [
    { "field": "headquarters", "existing": "Toronto, ON", "proposed": "Hamilton, ON", "note": "Company site lists Hamilton as HQ; Toronto may be a satellite office." }
  ]
}
```

- `field` must be exactly one of — single-value: `website`, `companySize`, `headquarters`, `founded`, `ownership`, `description`, `linkedinUrl`, `instagramUrl`, `revenueEstimate`, `employeeCount`, `subIndustry`, `locations`; lists: `companyKeyFacts`, `brandColors`, `currentSystems`, `painPoints`, `keyServices`, `competitors`. For lists, emit one addition per item (for `brandColors`, primary first, then secondary).
- **Deals** take a narrower set: skip `locations`, `brandColors`, `keyServices`, and `competitors` when the record is a deal (the server filters anyway, but don't waste findings on them).
- Put a single-value item in **`additions`** only when that field is currently empty in the record. If it's already set and your finding differs, put it in **`conflicts`** instead (never silently overwrite).
- For list fields, emit one addition per genuinely new item (not already on the record).
- `website`: emit the bare domain (e.g. `acme-fleet.com`), no `https://` prefix — match how the record stores it. `linkedinUrl` / `instagramUrl`: the full profile URL.
- `revenueEstimate` and `employeeCount` are stored as **numbers**: start the value with one figure (`220`, `$45M` — `M`/`B` suffixes are fine), then the source tag. No ranges — if the only source gives a range, skip the field and put it in `companyKeyFacts` instead.

## Hard rules for this task

- **Only state what a source supports.** Every `value` must trace to a source you actually found. No self-estimated revenue, no invented headcounts, no guessed ownership — a figure goes in `revenueEstimate`/`employeeCount` only when a source states it. Cite each one.
- **Public + factual only.** Company-level public facts only. No speculation about strategy, financials you can't source, or anything unverifiable.
- **Mark uncertainty.** If a source is weak or you're unsure it's the same company, drop the item or add a brief `(unverified)` note.
- **Don't repeat what's already there.** Compare against the existing record fields in the context block before proposing.
- **Be concise.** One sentence per addition, source tag included. No filler.
- If there is nothing defensible to add, return `{ "additions": [], "conflicts": [] }`.
