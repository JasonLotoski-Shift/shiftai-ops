# Skill — Proposal deck

Build a formal proposal presentation as ONE self-contained HTML deck — a long-scroll, slide-style document that walks a client through the project: what we'll build, scope, timeline, deliverables, and price. It links the interactive prototype via a clear "Demo prototype" button. The partner reviews and edits before sending.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity: company, industry, contact, recent interactions.
- **Intake** — what to emphasize, and a `PROTOTYPE_URL:` line with the link to the prototype (or a `[NEEDS INPUT: …]` marker if none exists yet).

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

## What to produce

Return **only the HTML** — a complete document starting with `<!DOCTYPE html>`. No prose before/after, no Markdown code fence.

Structure (full-viewport sections, scroll/keyboard navigable):

1. **Cover** — client name, the engagement in one line, Shift mark, date.
2. **What we heard** — the problem in their terms (from context). Short.
3. **What we'll build** — the solution, tied to the prototype. Include a prominent button: `<a href="{the PROTOTYPE_URL}" target="_blank">Demo prototype →</a>` styled as a primary CTA. Use the actual URL from the intake.
4. **Scope** — phases / workstreams, what's in and explicitly what's out.
5. **Timeline** — phased, flow-based; weeks or milestones, not invented hard dates unless given.
6. **Deliverables** — concrete artifacts the client owns at the end.
7. **Investment** — the fee. Fixed-fee framing (never hourly). If no fee was provided, render a visible `[NEEDS INPUT: fee]` marker — do not invent a number.
8. **Next step** — one clear action.

Requirements:

- **One file, self-contained.** Inline `<style>`, Google Fonts via `<link>` only, no JS required beyond optional smooth-scroll. No external images (CSS/SVG/data-URI only).
- **On-brand (Edition 06)** — dark, precise, editorial. Fonts: Big Shoulders Display 900 (display only), Inter 400/500 (body), JetBrains Mono 500 (eyebrows, labels, data). Palette: Bitumen `#0A0A0B` page, Asphalt `#141416` cards, Track Gold `#C9A961` as the one accent moment per surface, Bone `#F2EEE6` type. Soft 10px radius on cards and controls, pill chips, a subtle shadow (never a glow); no gradients, no glassmorphism. Generous spacing.
- The Demo-prototype button must use the real `PROTOTYPE_URL`. If that value is a `[NEEDS INPUT]` marker, render the marker as **visible on-page text** where the button would go.

## When input is missing — never invent

Never fabricate a fee, a date, or a commitment. Render any missing load-bearing fact as **visible on-page text** — e.g. `<span style="color:#b8332e">[NEEDS INPUT: start date]</span>` — never in an HTML comment. The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is correct.
