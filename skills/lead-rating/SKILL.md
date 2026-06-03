# Skill — Lead rating (score a candidate company 1–10 for segment fit)

Score one discovered candidate company for how well it fits a firm **TargetSegment**, on a 1–10 scale, and flag hard disqualifications. Your output drives whether the lead reaches a partner (`pending`) or is parked (`ghost`).

The firm's voice and hard rules are in the firm context above. The no-hallucination rule is critical here: **ground every judgment ONLY in the data provided**. If a fact isn't in the context, treat it as unknown — never invent revenue, headcount, signals, or relationships.

## Input you'll get

A context block with two parts:

1. **The segment spec** — `industries`, revenue band (CAD), employee band, `geographies`, `priorityLocation`, `buyingSignals`, `disqualifiers`.
2. **The enriched candidate** — `companyName`, `domain`, `industry`/`industryTags`, `employeeEstimate`, `revenueEstimate`, `headquarters`, and a short scraped **signals snippet** from the company's site.

## Rubric

Weigh four factors:

- **Industry match** — does the candidate's industry/tags land in the segment's `industries`? Adjacent ≠ exact; reward close fit, discount loose fit.
- **Size band fit** — does `employeeEstimate` (and `revenueEstimate` when present) sit inside the segment's bands? Treat revenue loosely (currency/precision vary). Near-band is partial credit; far outside is a strong negative.
- **Geography** — is the HQ in the segment's `geographies`? Being in `priorityLocation` is the **strongest positive signal**.
- **Buying signals** — does the scraped snippet show any of the segment's `buyingSignals` (funding, expansion, new exec, system rollout, regulatory deadline)? An active signal lifts the score.

## Disqualifiers — AUTO-FAIL

If the candidate trips ANY of the segment's `disqualifiers` (too small, wrong business model, geography mismatch, already a competitor's customer, etc.), set `disqualified: true` and `score <= 2`, and name which disqualifier in the rationale. A disqualified lead is never a high score regardless of other fit.

## Score bands

- **9–10** — textbook ICP with an active buying signal.
- **7–8** — strong fit, clearly in-segment, signal optional.
- **5–6** — plausible/borderline; some fit, some gaps or unknowns.
- **3–4** — weak fit; mostly out of band or off-industry.
- **1–2** — poor fit or disqualified.

When key facts are unknown (thin enrich), do not guess high — rate on what's verifiable and lean toward the borderline band.

## Output — JSON ONLY

Emit ONLY this JSON object and nothing else (no prose, no markdown fences required):

```
{ "score": <integer 1-10>, "rationale": "<one tight paragraph, grounded only in provided data>", "disqualified": <true|false> }
```

Hard rules:

- `score` is an **integer** 1–10.
- `rationale` is one tight paragraph citing the specific factors that drove the score — only facts from the context.
- `disqualified` is a boolean; if true, `score <= 2` and the rationale names the disqualifier.
- No hallucinated facts. No fields other than the three above.
