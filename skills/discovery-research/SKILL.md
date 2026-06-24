# Skill — Discovery research (business-area map + question rounds)

This skill runs the first three rounds of the discovery-questionnaire chain. It does NOT write the final form. It reads what we have on a prospect, maps their whole company, then drafts two pools of candidate questions that the final round (the `discovery-questionnaire` skill) critiques, dedupes, and assembles into the live form.

The firm's voice, identity, and hard rules are in the firm context above. Apply them, especially the no-hallucination rule: never invent a fact, a number, a system name, or an answer option.

## How the round is selected

The first line of the intake is `PHASE: <map | call-specific | whole-company>`. Read it and do ONLY that phase. The three phases share grounding rules; they differ in scope. Every phase returns a single JSON object, no prose around it, no markdown fences inside the values.

## Input you'll get

- **Context block** — the deal/prospect from our records: company, industry/vertical, stage, the primary contact, enriched deal fields, and the recent interactions (one-line summaries).
- **Intake** — the `PHASE:` line, the partner's focus / must-ask areas and notes, and (per phase) either the full Drive corpus or the distilled output of the earlier rounds.
- **Files from the deal Drive folder** (PHASE: map only) — full call transcripts, notes, docs, plus screenshots of their current tools as images. This is the richest source. Pull the workflows, system names, and numbers in the client's own words.

---

## PHASE: map — research the whole company across every business function

Read the corpus, the screenshots, the enriched deal fields, and the call notes. Build a structured read of the WHOLE company across all of these functions, not only what the call happened to cover:

- **Operations** — the core delivery workflow, what eats hours, what gets re-keyed, what breaks.
- **Finance** — billing, invoicing, AR/AP, margin visibility, reporting cadence.
- **Sales & marketing** — pipeline, lead handling, CRM, quoting, customer comms.
- **Supply chain / inventory / procurement** — what they buy, stock, dispatch, or schedule (if it applies to the vertical).
- **People & HR** — headcount, scheduling, onboarding, the roles that feel the pain.
- **IT & systems** — the tools they run, what's connected, what's a spreadsheet, where data is trapped.
- **Leadership** — how the owner/exec sees the business, what they want to see that they can't today, decision and timeline signals.

For each function, separate what we actually know from what we are guessing. Use the vertical to reason about the functions the call was light on: a fuel-distribution prospect has dispatch, tank monitoring, routing, runouts; a construction firm has scheduling, RFIs, change orders, draws. Name the functions that almost certainly exist for this vertical but were never discussed, and mark them as gaps.

Return ONLY this JSON object:

```json
{
  "vertical": "<the business vertical, e.g. fuel distribution, commercial construction>",
  "companyShape": "<2-3 short sentences: what the company does, rough size signals if stated, how it makes money. Cite the source file or quote for any number.>",
  "functions": [
    {
      "function": "operations | finance | sales-marketing | supply-chain | people-hr | it-systems | leadership",
      "whatWeKnow": "<plain summary of what the corpus/context tells us about this function, or 'not discussed'>",
      "signals": ["<a concrete fact, quote, system name, or number from the source>"],
      "confidence": "high | medium | low",
      "gaps": ["<a specific thing we don't yet know about this function>"]
    }
  ],
  "discussedOnCall": ["<a specific workflow, pain, system, or number the prospect actually raised, in their words>"],
  "crossCutting": ["<a theme that spans functions, e.g. 'data re-keyed between three tools'>"],
  "openGaps": ["<the highest-value things we still need to learn to build a sharp Discovery Report>"]
}
```

Rules for the map:
- Cover every function. If one is genuinely absent for this vertical, say so in `whatWeKnow` rather than dropping it.
- Ground `signals` in the source. An uncited signal is a guess. If you're inferring from the vertical rather than the corpus, set `confidence` to low and put the unknown in `gaps`.
- Quote the prospect's own words in `discussedOnCall`. This list is what the next round is allowed to dig into.
- Never invent a system name, a headcount, or a number. If a load-bearing fact is missing, write `[NEEDS INPUT: <what's needed>]` inside the string.

---

## PHASE: call-specific — 5-6 questions tied only to what was discussed

You get the map's `discussedOnCall` list and the relevant function detail. Draft **5-6** questions that dig deeper into ONLY what the prospect actually raised on the call. Do not broaden to functions they never mentioned, that's the next round's job. Each question pulls the operational detail behind a pain, system, or number they already named.

Return ONLY this JSON object:

```json
{
  "questions": [
    {
      "section": "<short section heading this belongs under>",
      "intent": "<one line: what answering this teaches us>",
      "draftLabel": "<the question in plain language, the prospect's words where possible>",
      "type": "short_text | long_text | number | email | single_select | multi_select | dropdown | rating | linear_scale | ranking | file_upload",
      "options": ["<only if you have real, grounded, mutually-exclusive choices from the corpus — else omit and use long_text>"],
      "function": "operations | finance | sales-marketing | supply-chain | people-hr | it-systems | leadership",
      "groundedIn": "<the call quote, signal, or fact this question follows from>"
    }
  ]
}
```

Rules:
- 5-6 questions, no more. Every one must trace to a `discussedOnCall` item or a high/medium-confidence signal.
- Tag each question with its `function` so the final round can balance the whole form.
- Prefer `long_text` for the 'walk us through how X works today' questions, `number` where they named or implied a count, `rating`/`linear_scale` for a confidence read.
- Never invent answer options. A `single_select` with made-up choices is worse than a `long_text`. Only list options you can defend from the corpus.
- Plain language, no consulting jargon, no banned words, no em dashes.

---

## PHASE: whole-company — broad questions spanning the map

You get the full business-area map and the call-specific questions already drafted. Draft questions that cover the WHOLE company, balanced across every function in the map, so the form teaches us the overall business, not just the part the call touched. Lean into the functions marked low/medium confidence and the `openGaps`. Do not duplicate the call-specific pool.

Return ONLY this JSON object:

```json
{
  "questions": [
    {
      "section": "<short section heading>",
      "intent": "<one line: what answering this teaches us>",
      "draftLabel": "<the question in plain language>",
      "type": "short_text | long_text | number | email | single_select | multi_select | dropdown | rating | linear_scale | ranking | file_upload",
      "options": ["<only real grounded choices, else omit>"],
      "function": "operations | finance | sales-marketing | supply-chain | people-hr | it-systems | leadership",
      "groundedIn": "<the map function, gap, or vertical reasoning this follows from>"
    }
  ]
}
```

Rules:
- Balance across functions. Cover each function in the map at least once; weight toward the gaps. Tag each question with its `function` so the next round can check the spread.
- For a function the call never touched, ask an open `long_text` ('Walk us through how billing works today') rather than a fake-specific question. Use the vertical to make it concrete to their kind of business without inventing their specifics.
- Where a function was marked low confidence or industry-typical (unverified for this company), ask an open question to confirm it rather than asserting it. This is the mechanism that stops the survey inventing facts.
- Include one `ranking` over their biggest pains and one optional `file_upload` for a current report/screenshot/process doc (the final round may keep or drop these).
- Never invent options or numbers. Mark a missing load-bearing fact `[NEEDS INPUT: <what's needed>]` inside the string.
- Plain language, no banned words, no em dashes.

---

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every string this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat.
- Never use negation constructions: 'not X, but Y,' 'this, not that.' State the positive claim alone.
- No narrative arc: no hooks, no scene-setting, no overvalidating filler. The `intent`, `signals`, `groundedIn`, and map fields are internal scaffolding for the next round. The `draftLabel` is the seed of a real question a prospect will read, so write it clean: plain language, their words, no jargon.
- No em dashes anywhere in the output. Use a period, a comma, or a colon.
