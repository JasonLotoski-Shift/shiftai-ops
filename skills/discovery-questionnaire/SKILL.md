# Skill — Discovery questionnaire (prospect-specific intake)

Generate a deep, **business-specific** questionnaire to send a prospect right after a discovery call. Its job is to pull the operational detail we need to build a sharp Discovery Report — the real workflows, tools, bottlenecks, numbers, and priorities of THIS business. The partner reviews and edits it before it becomes a live form, so aim for thorough and grounded over safe and generic.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the deal/prospect: company, industry, stage, the primary contact, and the discovery-call interactions (what they told us — their operation, pain, tools, the workflows that eat time, any numbers named).
- **Intake** — the partner's must-ask areas and any notes (e.g. "dig into dispatch and the parent-company re-keying").

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.

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

- **`type`** — pick the type that fits the answer:
  - `long_text` for "walk us through…" narrative questions (the most valuable ones).
  - `short_text` for a name/role/one-liner; `number` for counts; `email` for an email.
  - `single_select` / `multi_select` / `dropdown` only when you can list **real, mutually-exclusive options grounded in their business** (never invent plausible-sounding choices — use `long_text` instead).
  - `rating` for a 1–5 satisfaction/confidence question; `linear_scale` for a 1–10 (e.g. "how connected are your systems?").
  - `ranking` once, to force them to prioritise their biggest pains (give the options).
  - `file_upload` once, optional, for a current report/screenshot/process doc.
- **`options`** — required for `single_select`/`multi_select`/`dropdown`/`ranking`; omit otherwise.
- **`section`** — group the questions under 6–10 short section headings (e.g. *The operation today*, *Tools & systems*, *Dispatch / the core workflow*, *Data & reporting*, *The team*, *Priorities & outcomes*, *Decision & timeline*). Order the array by section.
- **`required`** — true only for the handful of must-answer questions; keep most optional so a busy operator isn't blocked.

## How deep

- **~30–45 questions** across the sections. This is a real intake, not a contact form — but every question must earn its place.
- **Specific to this business.** Reference their actual operation, tools, and the workflows they named on the call. A fuel-distribution prospect gets questions about runouts, tank monitoring, routing, and dispatch; a construction firm gets questions about scheduling, RFIs, and change orders. A generic questionnaire is a failure.
- **Anchor on measurable pain.** Ask what eats hours, what gets re-keyed, where customers feel it, how often things break — and ask for rough numbers (hours/week, frequency, headcount) where it's natural.
- **End each major area with an open "what are we missing?"** and close the whole thing with one open question: *"Anything we didn't ask that we should know?"*

## Hard rules for this task

- **Ground every question in the context.** If you don't know enough about a part of their business to ask a sharp question, ask an open one ("Walk us through how X works today") rather than a fake-specific one.
- **Never invent options.** A `single_select` with made-up choices is worse than a `long_text`. Only list options you can defend from the context or that are genuinely universal.
- **Plain language, their words.** No consulting jargon, no banned words. Questions a busy operator reads once and answers.
- **No pricing/commercial questions** beyond a light "what's your rough budget range and decision timeline?" in the closing section — discovery is about the work, not the deal.
- If the context is too thin to tailor (a bare deal with no call notes), still produce a solid general operations-discovery questionnaire for their industry, and mark any section you couldn't ground with a question like *"[NEEDS INPUT: discovery-call notes — this section is generic]"* as a `long_text` label so the partner sees it. The server gate blocks saving while `[NEEDS INPUT]` remains.
