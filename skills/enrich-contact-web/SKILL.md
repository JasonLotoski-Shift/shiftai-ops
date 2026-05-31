# Skill — Enrich contact (web mode)

Read a contact's record, then **propose** additions to the contact profile — persona, communication style, key facts, background, hobbies, network affiliations — using **web search** to find public, professional facts about the named person. This is the web counterpart to the log-only `enrich-contact` skill: there you infer only from logged history; here you MAY look up authoritative public sources.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the contact record (name, title, company, industry, plus any existing persona / communication style / background / key facts / hobbies / network affiliations). Use the name + title + company to disambiguate the right person.

## How to use web search

- Search for the person by **name + company + title** together, so you find the right individual and not a namesake.
- Prefer **authoritative, professional sources**: the company's own site, the person's verified professional profile, conference/speaker bios, published articles or interviews they authored, reputable trade press.
- Cite the source for every fact. Put a short `(source: <domain or URL>)` at the end of the `value`, e.g. `"Spoke on fleet electrification at the 2025 ACT Expo (source: actexpo.com)."`
- If searches don't clearly resolve to this exact person, **don't guess** — return fewer or zero additions. A wrong-person fact is worse than no fact.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "additions": [
    { "field": "background", "value": "Led ops at a regional logistics firm before joining (source: company About page)." },
    { "field": "networkAffiliations", "value": "Board member, Provincial Trucking Association (source: associations.example.org)." }
  ],
  "conflicts": [
    { "field": "persona", "existing": "Cautious buyer", "proposed": "Public-facing industry advocate", "note": "Frequent conference speaker — more outward than the record suggests." }
  ]
}
```

- `field` must be exactly one of: `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `persona`, `communicationStyle`, `background` are single-value fields. `keyFacts`, `hobbies`, `networkAffiliations` are lists — emit one addition per item.
- Put an item in **`additions`** when the field is currently empty, or when it's a list and your item is genuinely new (not already present).
- Put an item in **`conflicts`** when a single-value field is already set and your finding differs. Never silently overwrite — the partner decides. Include the existing value and your proposed value.

## Hard rules for this task

- **Only state what a source supports.** Every `value` must trace to a source you actually found. No inferred employers, no guessed affiliations, no fabricated interests. Cite each one.
- **Public + professional only.** Stick to facts the person has put in public professional context — role history, published work, speaking, professional affiliations, stated professional interests. **Skip anything private or sensitive**: home address, family, health, finances, religion, politics, protected characteristics, gossip, or anything from a non-authoritative/unverifiable source.
- **Mark uncertainty.** If a source is weak or you're not fully sure it's the same person, either drop the item or add a brief `(unverified)` note — don't present it as fact.
- **Don't repeat what's already there.** Compare against the existing record fields in the context block before proposing.
- **Be concise.** One sentence per addition, source tag included. No filler.
- If there is nothing defensible to add, return `{ "additions": [], "conflicts": [] }`.
