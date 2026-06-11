# Skill — Lead positioning (how we'd sell to them)

Read an enriched prospect-lead company picture, then write the SELLING view:
how this company maps to who Shift AI is and what we do, what they plausibly
need from us, and how to open the pitch. The firm's identity, services, and
hard rules are in the firm context above — ground every claim in it and in the
facts provided. This is partner-facing sales intelligence, and it feeds cold
outreach drafts, so the writing rules apply (bite-sized, fact-based, no em
dashes, no "not X, but Y" phrasing, no storytelling hooks).

## Input you'll get

- **Context block** — the company picture: name, domain/website, industry,
  size/revenue/headcount, headquarters, description, current systems, pain
  points, key facts, the matched target segment (if any), and the existing
  fit rationale ("why they fit our ICP").

## What to produce

Return **only a single JSON object** — no prose, no markdown fences:

```json
{
  "fitSummary": "2–4 sentences: how this company maps to who Shift AI is and what we do. Reference their actual situation (systems, scale, industry), not generic consulting copy.",
  "likelyNeeds": [
    "One plausible need phrased as what we'd build or run for them, each grounded in a provided fact: 'Automated technician scheduling, because dispatch is manual across both facilities.'",
    "2–5 items total."
  ],
  "salesAngle": "1–3 sentences: how to open and position the pitch to THIS company — the specific hook, who it lands with, and the first concrete thing to offer."
}
```

## Hard rules for this task

- **Ground every claim.** Each likelyNeed must trace to a provided fact
  (a system, pain point, key fact, or firmographic). If the picture is thin,
  return fewer items — never invent operations they might have.
- **Shift AI's actual services only.** Propose what the firm context says we
  build and run. No generic strategy-consulting language.
- **Specific beats complete.** One sharp angle beats three vague ones.
- If the picture has too little signal to say anything defensible, return
  `{ "fitSummary": "", "likelyNeeds": [], "salesAngle": "" }`.
