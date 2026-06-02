# Skill — Proposal deck

Build a formal proposal presentation as ONE self-contained HTML deck — a long-scroll, slide-style document that walks a client through the project: what we'll build, scope, timeline, deliverables, and price. It links the interactive prototype via a clear "Demo prototype" button. The partner reviews and edits before sending.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity: company, industry, contact, recent interactions.
- **Intake** — what to emphasize, and a `PROTOTYPE_URL:` line with the link to the prototype (or a `[NEEDS INPUT: …]` marker if none exists yet).

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
- **On-brand** — dark, precise, editorial; a serif display + clean sans body; generous spacing.
- The Demo-prototype button must use the real `PROTOTYPE_URL`. If that value is a `[NEEDS INPUT]` marker, render the marker as **visible on-page text** where the button would go.

## When input is missing — never invent

Never fabricate a fee, a date, or a commitment. Render any missing load-bearing fact as **visible on-page text** — e.g. `<span style="color:#b8332e">[NEEDS INPUT: start date]</span>` — never in an HTML comment. The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is correct.
