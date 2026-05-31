# Skill — Structure deal notes (and lift durable contact facts)

Read a partner's raw deal note and do two things: (a) rewrite it into a tidy, skimmable summary, and (b) extract any **durable** facts about the linked **contact** as append-only enrichment items.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — a short summary of the linked contact (name, title, company, anything already on record).
- **Intake** — the partner's raw deal note: where the lead came from, the opening, the mandate, numbers mentioned, next steps.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "structuredNote": "Referred by Dana at the OEM summit. Looking to consolidate three dispatch tools into one. Budget signalled around $250k; wants a pilot before committing. Next: scope call week of the 12th.",
  "contactKeyFacts": [
    "Holds budget authority up to ~$250k without board sign-off.",
    "Prefers a paid pilot before a full engagement."
  ]
}
```

- **`structuredNote`** — the cleaned-up note. Keep it tight and scannable (short sentences or compact bullets in one string; use `\n` for line breaks). Preserve every concrete fact, name, number, and next step from the raw note. Drop filler and fix grammar. Do **not** add anything that wasn't in the raw note.
- **`contactKeyFacts`** — a list of **durable** facts about the *contact* (the person), suitable as append-only `keyFacts` enrichment: mandate, budget authority, role, constraints, stated preferences. One short sentence per item. Exclude anything deal-transient (a specific meeting date, a one-off scheduling detail) — only facts that stay true about this person going forward.

## Hard rules for this task

- **Only restate what's in the raw note.** Never invent a budget, a title, a timeline, or a relationship that isn't there. No web facts. If the note is thin, the structured note is short and `contactKeyFacts` may be empty.
- **Don't duplicate what the context block already shows** about the contact — only surface genuinely new durable facts.
- **No [NEEDS INPUT] markers** — this is a cleanup pass on the partner's own words, not a generative draft. Just restate; never flag.
- **Be concise.** No filler, no preamble.
- If there are no durable contact facts to lift, return `"contactKeyFacts": []`. Always return a non-empty `structuredNote` (at minimum, the cleaned original).
