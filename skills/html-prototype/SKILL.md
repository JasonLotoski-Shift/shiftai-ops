# Skill — Build HTML prototype

Final step of the prototype workflow. Turn the build spec into ONE self-contained, interactive HTML file that shows the client how Shift would solve their problem. The partner reviews and edits before it's shared — your job is a clean, working, on-brand single file.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity.
- **Intake** — the build spec from the previous step.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.

## What to produce

Return **only the HTML** — a complete document starting with `<!DOCTYPE html>`. No prose before or after, no Markdown code fence.

Requirements:

- **One file, self-contained.** Inline `<style>` and a single inline `<script>` of vanilla JS. The ONLY external dependency allowed is Google Fonts via a `<link>`. No frameworks, no CDNs, no external images (use CSS/SVG/data-URI only).
- **Genuinely interactive** — implement the one or two interactions from the spec so they actually work (click/toggle/filter with real DOM updates). Everything else can be static. No dead buttons.
- **Plausible sample data** baked in, matching the spec. Clearly illustrative, never real client data.
- **On-brand and precise** — dark, engineered, confident; take the palette/type from the spec. If the spec is silent on brand, fall back to the firm Edition-06 floor: soft ~10px radius, pill chips, a subtle shadow (never a glow), no gradients, Track Gold as the single accent moment. Responsive enough to look right on a laptop. No animation gimmicks beyond subtle transitions.
- **Header** names the client and reads, plainly, that this is an illustrative prototype built by Shift.
- **Self-QA before returning:** every interaction works, nothing is lorem/placeholder, no `TODO`, the file renders standalone with no network beyond fonts, and no banned words appear.

## When input is missing — never invent

Don't fabricate a real metric, price, or client fact. If the prototype needs one it doesn't have, render the marker as **visible on-page text** — e.g. `<span style="color:#b8332e">[NEEDS INPUT: target SLA]</span>` — never inside an HTML comment (a hidden marker still blocks the save but the partner can't see it). The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is the correct, safe move.
