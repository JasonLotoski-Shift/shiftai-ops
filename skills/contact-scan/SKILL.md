# Skill — Contact scan (rank imported contacts for fit, two axes)

Score a **batch** of a partner's imported contacts (from a LinkedIn / CRM export) for how useful each one is to the firm's business development. You judge two axes at once and combine them into a 1–10 score. Your output decides which contacts a partner pushes into the pipeline, so be precise and grounded.

The firm's voice and hard rules are in the firm context above. The no-hallucination rule is critical: **judge ONLY from the data given for each contact** (name, title, company, domain, email). Do not invent a person's seniority, a company's industry, revenue, or size. If the company is unknown or blank, you cannot assess company fit — say so and score low.

## What you're given

1. A numbered list of **Target segments** (in a system block above) — the firm's "fitting company" definition. Each `Segment N` has industries, revenue/employee bands, geographies, buying signals, and disqualifiers. These define what a *good client company* looks like.
2. A user message with an array of **contacts**, each `{ index, name, title, company, domain?, email? }`.

## The two axes

**Axis A — Company fit.** Does the contact's `company` match one of the Target segments (industry, geography, size where inferable)? Pick the best-matching `Segment N` or decide none fits. You won't have revenue/headcount in the export — infer industry fit from the company name + title and be honest about uncertainty. Never fabricate firmographics.

**Axis B — Person role.** From the `title`, decide the person's leverage:
- **decision_maker** — owner, founder, partner, C-suite, President, VP, Head of, or a Director with real authority: someone who could actually *buy* our services.
- **connector** — a senior or management person (Senior X, Manager, Lead, Principal, Advisor, Board member) who is unlikely to be the buyer themselves but is well-placed to **introduce** us to a decision-maker at a fitting company — even if their *own* employer isn't a target.
- **none** — junior/individual-contributor, irrelevant function, or no plausible BD value.

## Combine into a score + leadType

Set `leadType` to the Axis-B verdict, and `score` from how the two axes combine:

- **9–10** — decision_maker at a textbook-fit company (clear Segment match).
- **7–8** — strong decision_maker at a plausible-fit company, OR a well-placed connector who can clearly reach decision-makers in a fitting segment.
- **5–6** — a plausible connector, or a decision_maker at a borderline/uncertain-fit company.
- **3–4** — weak: wrong function, company clearly outside every segment, or thin signal.
- **1–2** — no BD value, or company trips a segment disqualifier.

Rules of thumb: a decision_maker whose company fits NO segment is NOT a high score (cap ~4) — they can't buy what they don't need, though they may still be a `connector` if senior. A blank/unknown company means Axis A fails → `leadType:"none"`, `score:1`, rationale "insufficient data." When the title is senior but the company is unknown, prefer `connector` at a low-middle score rather than guessing company fit.

## Output — JSON ONLY

Emit ONLY a JSON array, one object per input contact, and nothing else (no prose, no markdown fences required). Use the SAME `index` you were given:

```
[ { "index": 0, "score": 8, "leadType": "decision_maker", "matchedSegmentIndex": 1, "rationale": "<one short line, grounded in the title/company given>" } ]
```

Hard rules:

- One object per input contact; preserve every `index`.
- `score` is an **integer** 1–10.
- `leadType` is exactly one of `decision_maker`, `connector`, `none`.
- `matchedSegmentIndex` is the integer number of the best-matching `Segment N`, or `null` if no segment fits.
- `rationale` is one short line citing the specific title/company facts that drove the call — only facts from the input.
- No fields other than the five above. No hallucinated firmographics.
