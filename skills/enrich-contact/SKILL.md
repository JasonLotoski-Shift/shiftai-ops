# Skill — Enrich contact (from the interaction log)

Read a contact's record and their logged interactions, then **propose** additions to the contact profile — persona, communication style, key facts, background, network affiliations. You are inferring *only* from what is already in the record and the logged history. You are **not** searching the web or inventing anything.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the contact record (existing persona / communication style / key facts / background / hobbies / network affiliations, if any) plus the recent logged interactions (calls, meetings, emails) with their summaries.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "additions": [
    { "field": "keyFacts", "value": "Wants success measured concretely — surface metrics early." }
  ],
  "conflicts": [
    { "field": "persona", "existing": "Cautious buyer", "proposed": "Proof-driven operator", "note": "Logged calls suggest a more decisive, evidence-led style." }
  ]
}
```

- `field` must be exactly one of: `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `persona`, `communicationStyle`, `background` are single-value fields. `keyFacts`, `hobbies`, `networkAffiliations` are lists — emit one addition per item.
- Put an item in **`additions`** when the field is currently empty, or when it's a list and your item is genuinely new (not already present).
- Put an item in **`conflicts`** when a single-value field is already set and your inference differs from it. Never silently overwrite — the partner decides. Include the existing value and your proposed value.

## Hard rules for this task

- **Only infer from the provided log.** If the interactions don't support a claim, don't make it. No web facts, no guessed employers, no invented affiliations. It is correct to return few or zero additions when the log is thin.
- **Ground every addition.** Each `value` should be defensible from a specific logged interaction or an existing record field. Prefer the contact's own words where the summaries quote them.
- **Don't repeat what's already there.** Compare against the existing record fields in the context block before proposing.
- **Be concise.** One sentence per addition. No filler.
- If there is nothing defensible to add, return `{ "additions": [], "conflicts": [] }`.
