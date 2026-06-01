# Skill — Scope-pricing ingest (scope doc → pricing/hours/cost breakdown)

Read a project scoping document and **extract ONLY its pricing breakdown** — the people/roles, their hours, the rate paid (cost) and/or the rate billed to the client, and the total. Ignore everything else: narrative, deliverables, timelines, methodology, risks. You propose; the partner reviews every line before any economics are written.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the focused project (name, value) and the firm's active consultant roster as `- <name> (<role>) — pays $<rate>/hr`. Use the roster to set `consultantHint` when a line clearly maps to a named person.
- **Intake** — the raw scope/pricing document text.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "total": 120000,
  "lines": [
    {
      "role": "Senior Engineer",
      "consultantHint": "Jack Mercer or null",
      "hours": 160,
      "payRateCents": 15000,
      "billRateCents": 22500,
      "isExtra": false
    }
  ],
  "notes": ["Anything uncertain or floated", "Travel costs mentioned but not priced — [NEEDS INPUT]"]
}
```

- **Rates are in CENTS per hour.** $150/hr → `15000`. `total` is whole dollars.
- `payRateCents` = what the FIRM PAYS that person (cost). If the doc doesn't state it, use `null` — the server fills the roster default. Never guess a pay rate.
- `billRateCents` = what the CLIENT is billed per hour for that role. If the doc gives a line total and hours but no rate, you may compute the implied rate (total ÷ hours) and put it here; if you can't, use `0` and note it.
- `isExtra: true` only for explicit out-of-scope / change-order / add-on lines. Base scope is `false`.
- `consultantHint`: a roster NAME only when the doc clearly names that person or the role unambiguously maps to one roster entry. Otherwise `null`.

## Hard rules for this task

- **Pricing only.** Extract solely the cost/hours/rate breakdown and the total. Do not extract deliverables, milestones, scope narrative, or tasks — that's a different ingest.
- **Extract, don't invent.** Every line must trace to the document. No fabricated people, hours, or rates. If a number is floated or ambiguous, put it in `notes`, not a line.
- **Unknown pay rate → null.** Never invent what we pay someone; the roster default fills it.
- **Mark gaps.** Where a needed figure is genuinely missing, add a `notes` entry with `[NEEDS INPUT]` rather than guessing.
- If the document has no parseable pricing, return `{ "total": null, "lines": [], "notes": ["No pricing breakdown found"] }`.
