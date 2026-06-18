# Skill — Proposal deck

Build the client-facing proposal as ONE self-contained HTML deck: a long-scroll, slide-style document that carries the scope of work and walks a client through the engagement. It renders the approved scope at pitch altitude (what we'll build, the foundation, what they own, how we work, what we need from them, timeline, price) and links the interactive prototype via a clear "Demo prototype" button. The partner reviews and edits before sending. This is the firm's primary client-facing sell, so make it precise and on-brand.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity: company, industry, contact, recent interactions.
- **Intake** — what to emphasize, the **approved scope of work** (the SOW markdown — your source of truth for scope, phases, what they own, the foundation, what we need from them, timeline, and price), and a `PROTOTYPE_URL:` line with the link to the prototype (or a `[NEEDS INPUT: …]` marker if none exists yet).

You render the SOW into a deck. Pull every load-bearing fact (scope, phases, fee, subscription, timeline, deliverables) from the SOW. Do not invent a fact the SOW does not contain, and do not contradict it.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

## What to produce

A complete HTML document starting with `<!DOCTYPE html>`. No prose before/after, no Markdown code fence.

Structure (full-viewport sections, scroll-navigable). Sections 4, 5, 7, 9, and 10 are the scope-of-work content the deck carries; render them from the SOW:

1. **Cover** — client name, the engagement in one line, Shift mark, date.
2. **What we heard** — the problem in their terms (from the SOW / context). Short.
3. **What we'll build** — the solution, tied to the prototype. Include a prominent button: `<a href="{the PROTOTYPE_URL}" target="_blank">Demo prototype →</a>` styled as the primary CTA. Use the actual URL from the intake.
4. **The foundation we set up first** — the infrastructure standup from the SOW: the environment, the data sources and APIs/integrations connected, access set up, the pilot deployed. Make the compounding point: the base is built once, every later module rides on it, so each addition is faster than the first. One screen, confident, not a parts list.
5. **The platform and what you own** — the client's own running instance, its own data, a runnable version it keeps; the firm keeps the reusable library. One calm line of reassurance on what it's built on. Never a jargon dump.
6. **How it works** — the phases **Discovery → Build → Operate**, one line each. Operate is the ongoing managed service.
7. **Scope** — what's in, and explicitly what's out, both rendered from the SOW (the SOW states the boundaries for this phase). The out-list is what keeps a pilot a pilot; never invent an exclusion the SOW doesn't state.
8. **Timeline** — phased, flow-based; weeks or milestones from the SOW. No invented hard dates.
9. **What you get** — the deliverables the client owns plus the cadence: Weekly Brief, Phase Report, Operating Review. From the SOW.
10. **What we need from you** — the client's responsibilities from the SOW: a point of contact, system/data access, decisions on cadence. Concrete.
11. **Investment** — the fixed build fee and the monthly subscription, from the SOW. Fixed-fee framing, never hourly. The buy-out option named as available. If a number is genuinely absent from the SOW, render a visible `[NEEDS INPUT: …]` marker — do not invent one.
12. **The "after"** — the single outcome that makes them say yes: the measurable result from the SOW's success measures.
13. **Next step** — one clear action.

Requirements:

- **One file, self-contained.** Inline `<style>`, Google Fonts via `<link>` only, no JS required beyond optional smooth-scroll. No external images (CSS/SVG/data-URI only).
- **On-brand (Edition 06)** — dark, precise, editorial. Fonts: Big Shoulders Display 900 (display only), Inter 400/500 (body), JetBrains Mono 500 (eyebrows, labels, data). Palette: Bitumen `#0A0A0B` page, Asphalt `#141416` cards, Track Gold `#C9A961` as the one accent moment per surface, Bone `#F2EEE6` type. Soft 10px radius on cards and controls, pill chips, a subtle shadow (never a glow); no gradients, no glassmorphism. Generous spacing.
- The Demo-prototype button must use the real `PROTOTYPE_URL`. If that value is a `[NEEDS INPUT]` marker, render the marker as **visible on-page text** where the button would go.

## When input is missing — never invent

Never fabricate a fee, a date, or a commitment. The SOW is your source of truth: if a load-bearing fact is genuinely absent from it, render the gap as **visible on-page text** — e.g. `<span style="color:#b8332e">[NEEDS INPUT: start date]</span>` — never in an HTML comment. The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is correct.
