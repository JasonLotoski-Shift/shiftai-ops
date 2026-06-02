# Skill — Prototype spec

Second step of the prototype workflow. Turn the problem brief into a concrete build spec the HTML step can implement directly. Still no HTML — this is the blueprint.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity.
- **Intake** — the problem brief from the previous step.

## What to produce

A Markdown spec, no preamble:

1. **Screens / sections** — the 1–3 views the single-page prototype needs, named, in order. For each: what it shows and why it matters to the user.
2. **The interaction to simulate** — the ONE thing a viewer clicks/toggles that makes the value land (e.g. "click a job → it routes and the ETA-risk badge recolors"). Keep it to one or two fake interactions — enough to feel real, not a full app.
3. **Sample data** — realistic, generic-but-plausible example records for this industry (names, numbers, statuses). Enough rows to look alive. Never real client data.
4. **The "wow" moment** — the single screen state that makes the buyer say "yes, that."
5. **Visual direction** — a short note: tone, a small palette (2–3 colors), and type feel that fits the firm and the client's industry. Dark, precise, engineered — not playful.

Aim for ~250–350 words. Concrete enough that the build step doesn't have to guess.

## Rules

- **Buildable in one self-contained HTML file** — inline CSS + a little vanilla JS. Don't spec anything needing a backend, a framework, or external assets beyond Google Fonts.
- **Plain language, no jargon, no banned words.**
- **Never invent** real client facts; sample data is clearly illustrative. If something load-bearing is missing, write `[NEEDS INPUT: <what's needed>]`.
