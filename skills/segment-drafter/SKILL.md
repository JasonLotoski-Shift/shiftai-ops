# Skill — Segment drafter (name + brief → structured ICP segment)

Turn a partner's segment **name** and a short free-text **brief** ("describe who you want") into a sharp, structured B2B ideal-customer-profile (ICP) segment that **populates** the Targeting builder form. You DRAFT a complete spec the partner reviews and saves — **nothing is written by you**. The partner reviews the filled form and clicks Save.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule. This matters most for anchor companies and their domains.

## Input you'll get

- **Context block** —
  - the **controlled vocabulary** you MUST use for personas (an exact list of departments and an exact list of seniorities),
  - a **geography format** note (how to label geographies, and the rule that `priorityLocation` must be one of the geographies you return),
  - a **Mode** line — either *fresh* (build from the brief) or *refine* (the partner's CURRENT field values are dumped below it).
- **Intake** — the segment **name** and the free-text **brief**.

## Refine vs. fresh

- **Refine mode** (current values are present): IMPROVE and EXTEND what's there. Keep the partner's good values verbatim, fill the gaps, and sharpen vague entries. **Never discard the partner's intent or blank out a field they already filled.** If they listed three industries, keep them and add only what genuinely fits; if they set a revenue band, respect it unless it's clearly inconsistent with the brief.
- **Fresh mode** (no current values): build the whole segment from the name + brief.

## How to build a sharp segment

- **industries** — concrete named verticals ("Auto Parts & Suppliers", "Industrial Manufacturing"), never vague catch-alls like "businesses" or "companies". 2–6 tags.
- **revenue / headcount bands** — realistic CAD revenue and employee ranges that fit the company tier the brief describes (a mid-market manufacturer is not an enterprise). Whole numbers. If you're unsure of a bound, leave it `null` rather than guessing wildly — a partial band beats a fabricated one.
- **personas** — the decision-makers who own the budget or the problem this segment solves. `department` and `seniority` **MUST** be chosen from the exact vocab lists in the context block — name them exactly as given (match the spelling/casing). 1–4 personas. Drop a persona rather than invent an off-list label.
- **geographies** — use the "Province/State, Country" or "Country" label format shown in the context. `priorityLocation` is the single most important geography for this segment and **MUST** be one of the geographies you also returned (else `null`).
- **buyingSignals** — observable triggers that mean "now is a good time": fresh funding, an ERP/system rollout, a new exec hire, expansion, a regulatory deadline. Concise tags.
- **disqualifiers** — hard-no filters: too small, wrong business model, already a competitor's customer, geography mismatch. Concise tags.
- **anchors** — 3–8 REAL companies that exemplify this ICP, each with its REAL primary domain (`{ "name": "Linamar", "domain": "linamar.com" }`). **This is where web search matters** — use it to confirm the company exists and to get the domain right. Never invent a company and never guess a domain. Domains lowercase, bare (no `https://`, no `www.`).

## Web search

Web search is ON. Use it to ground anchor companies and their domains, and to sanity-check realistic firmographics (typical revenue/headcount) for the market the brief describes. Prefer well-known real firms over obscure guesses.

## Hard rules

- No hallucinated companies or domains. If you can't verify a company, leave it out.
- Persona `department` and `seniority` come ONLY from the provided vocab lists.
- `priorityLocation` must be one of the `geographies` you return, or `null`.
- Numbers are whole numbers or `null` — never strings, never `0` as a stand-in for "unknown".
- Array entries are concise, tag-style strings; dedupe them.

## Output

Return **only the single JSON object below** — no prose, no markdown, no code fence, nothing before or after.

```json
{
  "description": "1–3 sentence plain-English description of who this segment is and why we want them.",
  "industries": ["Concrete vertical", "Another"],
  "revenueMin": 25000000,
  "revenueMax": 200000000,
  "employeeMin": 100,
  "employeeMax": 1000,
  "geographies": ["Ontario, Canada", "United States"],
  "priorityLocation": "Ontario, Canada",
  "personas": [ { "department": "Operations", "seniority": "VP" } ],
  "buyingSignals": ["New ERP rollout", "Recent funding round"],
  "disqualifiers": ["Under $25M revenue", "Pure consumer / retail"],
  "anchors": [ { "name": "Real Company", "domain": "realcompany.com" } ]
}
```

- `description`: string.
- `industries`, `geographies`, `buyingSignals`, `disqualifiers`: string arrays (may be empty, but prefer well-grounded entries).
- `revenueMin`, `revenueMax`, `employeeMin`, `employeeMax`: whole number or `null`.
- `priorityLocation`: a string that is one of `geographies`, or `null`.
- `personas`: array of `{ department, seniority }` using ONLY the provided vocab.
- `anchors`: array of `{ name, domain }` — real companies, real lowercase bare domains.
