# Skill — Discovery questionnaire (prospect-specific intake)

Generate a deep, **business-specific** questionnaire to send a prospect right after a discovery call. Its job is to pull the operational detail we need to build a sharp Discovery Report — the real workflows, tools, bottlenecks, numbers, and priorities of THIS business. The partner reviews and edits it before it becomes a live form, so aim for thorough and grounded over safe and generic.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the deal/prospect: company, industry, stage, the primary contact, and the discovery-call interactions (what they told us — their operation, pain, tools, the workflows that eat time, any numbers named).
- **Files from the deal's Drive folder** (when present) — full call transcripts, notes, and docs, plus screenshots of their current tools as images. This is the richest source: pull the specific workflows, system names, and numbers the client said in their own words, and ask about THOSE.
- **Intake** — the partner's must-ask areas and any notes (e.g. "dig into dispatch and the parent-company re-keying").

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

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

- **~30–40 questions** across the sections. This is a real intake, not a contact form — but every question must earn its place.
- **Specific to this business.** Reference their actual operation, tools, and the workflows they named on the call. A fuel-distribution prospect gets questions about runouts, tank monitoring, routing, and dispatch; a construction firm gets questions about scheduling, RFIs, and change orders. A generic questionnaire is a failure.
- **Anchor on measurable pain.** Ask what eats hours, what gets re-keyed, where customers feel it, how often things break — and ask for rough numbers (hours/week, frequency, headcount) where it's natural.
- **End each major area with an open "what are we missing?"** and close the whole thing with one open question: *"Anything we didn't ask that we should know?"*
- **Ensure we capture other business-areas** the partner flagged in the intake, even if they didn't come up on the call. If the partner said "dig into dispatch and the parent-company re-keying," ask a few questions about those even if they weren't mentioned on the call. Be sure to understand what business-vertical the deal is in (e.g. fuel distribution, construction, healthcare) and ask about the core workflows/operations/bottle-necks and tools for that vertical, even if the call was light on those details.

## Hard rules for this task

- **Ground every question in the context.** If you don't know enough about a part of their business to ask a sharp question, ask an open one ("Walk us through how X works today") rather than a fake-specific one.
- **Never invent options.** A `single_select` with made-up choices is worse than a `long_text`. Only list options you can defend from the context or that are genuinely universal.
- **Plain language, their words.** No consulting jargon, no banned words. Questions a busy operator reads once and answers.
- **Different Question Types** Ensure a mix of question types to capture different kinds of information and keep the respondent engaged. Use `long_text` for detailed explanations, `short_text` for concise answers, one or two 'multi-select' options, 'ranking' for prioritization, and `number` for quantifiable data.
- **No pricing/commercial questions** beyond a light "what's your typical decision timeline?" in the closing section — discovery is about the work, not the deal.
- **Always Note on Image Upload** - Tell the respondent what kind of image or file would be most helpful if they choose to upload something. For example, "If you have a current report, dashboard, or process document that illustrates this pain point, please upload it here (optional). Also let them know that 1 is the maximum file upload limit, and that they can email additional files to us if needed."
- If the context is too thin to tailor (a bare deal with no call notes), still produce a solid general operations-discovery questionnaire for their industry, and mark any section you couldn't ground with a question like *"[NEEDS INPUT: discovery-call notes — this section is generic]"* as a `long_text` label so the partner sees it. The server gate blocks saving while `[NEEDS INPUT]` remains.
