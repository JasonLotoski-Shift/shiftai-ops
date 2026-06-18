# Skill — Build HTML prototype

Final step of the prototype workflow. Turn the approved brief into ONE self-contained, **multi-tab interactive HTML app** that shows the client how Shift would solve their problem. The partner reviews and edits before it's shared — your job is a clean, working, on-brand single file. This is the firm's most complex deliverable: make it look and feel like a real product, not a mockup screenshot.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity.
- **Intake** — the approved prototype brief: problem, user stories, key features, the tabs/sections to build, the interaction to simulate, sample-data shape, the "after" picture, and a Brand direction line.
- **Screenshots** (vision) — the client's current tools, when shared. Match the kind of data you see (the real fields, statuses, units) in your sample data.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

## What to produce

Return **only the HTML** — a complete document starting with `<!DOCTYPE html>`. No prose before or after, no Markdown code fence.

Requirements:

- **One file, self-contained.** Inline `<style>` and a single inline `<script>` of vanilla JS. External dependencies allowed: Google Fonts via `<link>`, and — **only when the brief needs a map** — Leaflet + OpenStreetMap tiles from a CDN (see **Maps** below). Otherwise no frameworks, no CDNs, no external images (use CSS/SVG/data-URI only).
- **Maps — use a real one, never a hand-drawn fake.** When a tab or feature involves geography (routes, sites, dispatch coverage, service areas, locations), render a genuine interactive map: **Leaflet** (`https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` + `.../leaflet.js`, **no API key**) with **OpenStreetMap** tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`), centered on the client's real region, with markers at real-ish coordinates for their sites/locations and `L.polyline` for routes. You know the geography — place things plausibly for the client's actual area. NEVER fake a map with a drawn SVG or a flat image. Wrap map init in `try/catch` and show a small styled fallback panel if tiles can't load, so it degrades cleanly offline. (This is the one CDN exception — everything else stays self-contained.)
- **Multi-tab app.** Build the 2–4 tabs/sections named in the brief as a real tabbed interface: a persistent top or side nav, clicking a tab swaps the visible section (real DOM/CSS state, the active tab is highlighted). Each tab is a distinct, populated view — a dashboard, a list/table, a detail or settings view — not the same content relabeled.
- **Genuinely interactive** — implement the one or two interactions from the brief so they actually work (click a row → detail opens; toggle a filter → the list updates; assign/route → a badge recolors). Real DOM updates. Everything else can be static. No dead buttons, no tab that 404s.
- **Plausible sample data** baked in, matching the brief's sample-data shape and the client's industry. Enough rows to look alive (8–15 per table, not 2). Clearly illustrative, never real client data.
- **On-brand and precise** — engineered, confident. **Use the brand colors from the brief's Brand direction line** (primary for headers/active states/key accents, secondary for support chips/callouts) over a neutral Shift base. If the Brand direction says `[Shift Edition-06 fallback]` (or is silent), use the firm Edition-06 floor: dark base, soft ~10px radius, pill chips, a subtle shadow (never a glow), no gradients, Track Gold as the single accent moment. Either way: keep the firm's type feel (Big Shoulders Display for heads, Inter body, a mono for labels) unless the brief says otherwise. Responsive enough to look right on a laptop. No animation gimmicks beyond subtle transitions.
- **Header** names the client and reads, plainly, that this is an illustrative prototype built by Shift.
- **Self-QA before returning:** every tab switches and every interaction works, nothing is lorem/placeholder, no `TODO`, tables have realistic volume, the file renders standalone with no network beyond fonts, and no banned words appear.

## When input is missing — never invent

Don't fabricate a real metric, price, or client fact. If the prototype needs one it doesn't have, render the marker as **visible on-page text** — e.g. `<span style="color:#b8332e">[NEEDS INPUT: target SLA]</span>` — never inside an HTML comment (a hidden marker still blocks the save but the partner can't see it). The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is the correct, safe move.
