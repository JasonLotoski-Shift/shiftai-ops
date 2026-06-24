# Skill — Discovery questionnaire (final assembler)

This is the LAST round of the discovery-questionnaire chain. The earlier rounds (the `discovery-research` skill) already mapped the prospect's whole company and drafted two pools of candidate questions: a **call-specific** pool (5-6 questions tied to what they raised on the call) and a **whole-company** pool (broad questions spanning every business function). Your job is to critique, dedupe, balance, and assemble those candidates into the final questionnaire the partner reviews and sends.

The partner edits this before it becomes a live form, so aim for thorough and grounded over safe and generic. The firm's voice, identity, and hard rules are in the firm context above. Apply them, especially the no-hallucination rule.

## Input you'll get

- **Context block** — the deal/prospect: company, vertical, stage, the primary contact.
- **Intake** — four parts:
  - The partner's focus / must-ask areas and notes.
  - **Call-specific candidates** — the round-2 question pool (JSON), grounded in the call.
  - **Whole-company candidates** — the round-3 question pool (JSON), spanning the business-area map.
  - The **business-area map** — the vertical, the functions with their confidence, and the open gaps, for section grouping and grounding reference.

You are NOT reading the raw call transcript here. The research rounds already distilled it. Work from the candidate pools and the map.

## What to produce

Return **only a single JSON array** — no prose, no markdown fences, nothing before or after. Each element is one question:

```json
[
  {
    "type": "short_text | long_text | number | email | single_select | multi_select | dropdown | rating | linear_scale | ranking | file_upload",
    "label": "The question, in plain language.",
    "options": ["Only for single_select / multi_select / dropdown / ranking"],
    "required": false,
    "section": "Section heading this question belongs under"
  }
]
```

## Your job — critique, dedupe, balance, assemble

1. **Merge the two pools.** Work from the call-specific candidates and the whole-company candidates together. Neither pool outranks the other by default; grounding and sharpness decide what survives.
2. **Dedupe on grounding, not on pool.** Where two candidates ask the same thing, keep the better-grounded, more specific one and drop the other, regardless of which pool it came from. Do not keep a call-specific question over a broad one just because it was on the call.
3. **Critique each candidate.** Drop any question that is vague, generic, or not grounded in the map or the call. A question that could be sent to any company is a failure. Tighten the wording of the ones you keep into plain language a busy operator answers once.
4. **Balance the coverage — this is the point of the chain.** The final form must do BOTH: dig into what the call raised AND learn the rest of the company. Use the `function` tags on the candidates (both pools carry them) to keep a fair spread across operations, finance, sales & marketing, supply chain, people/HR, IT & systems, and leadership, weighted toward the gaps the map flagged. Aim for roughly **5-6 call-anchored questions, and the rest broad whole-company coverage**. Do not let call topics crowd out the functions the call never touched, those blind spots are exactly why the questionnaire exists. If the whole-company pool is thin, add open 'walk us through how X works today' questions for the under-covered functions rather than piling on more call-specific items.
5. **Group into sections.** 6-10 short section headings (e.g. *The operation today*, *Tools & systems*, *Finance & reporting*, *Sales & customers*, *The team*, *Priorities & outcomes*, *Decision & timeline*). Order the array by section.
6. **End coverage with open questions.** End each major area with an open 'what are we missing here?' and close the whole thing with one open question: *'Anything we didn't ask that we should know?'*

## How deep

- **~30-40 questions** across the sections. A real intake, not a contact form, but every question must earn its place.
- **Specific to this business.** Reference their actual operation, tools, and the workflows the research rounds surfaced. A generic questionnaire is a failure.
- **Anchor on measurable pain.** Keep the questions that ask what eats hours, what gets re-keyed, where customers feel it, how often things break, and ask for rough numbers (hours/week, frequency, headcount) where natural.

## Hard rules for this task

- **Never invent options.** A `single_select` / `multi_select` / `dropdown` / `ranking` is allowed only when the candidate carried real, grounded, mutually-exclusive options you can defend from the map. If a candidate has invented or thin options, convert it to `long_text`. A choice type needs at least two real options or it gets dropped downstream.
- **Ground every question.** If a candidate isn't grounded in the map or the call, either drop it or rewrite it as an open 'Walk us through how X works today.' Never present an industry-typical assumption as a fact about THIS company.
- **Mix question types.** `long_text` for the detailed walk-throughs (the most valuable), `short_text` for a name/role/one-liner, `number` for counts, one or two choice questions where options are real, one `ranking` to force them to prioritise their biggest pains, `rating`/`linear_scale` for a confidence read.
- **`required`** — true only for the handful of must-answer questions; keep most optional so a busy operator isn't blocked.
- **One `file_upload`, optional.** Tell the respondent what file helps: 'If you have a current report, dashboard, or process document that shows this, upload it here (optional). One file is the maximum, email us any extras.'
- **No pricing/commercial questions** beyond a light 'what's your typical decision timeline?' in the closing section. Discovery is about the work, not the deal.
- **Plain language, their words.** No consulting jargon, no banned words, no em dashes, no negation framing, no narrative filler.
- **If a section can't be grounded** (the map flagged it [NEEDS INPUT] or both pools came back thin), emit a single `long_text` whose label carries `[NEEDS INPUT: <what's needed>]` so the partner sees it. The server gate blocks saving while `[NEEDS INPUT]` remains.
