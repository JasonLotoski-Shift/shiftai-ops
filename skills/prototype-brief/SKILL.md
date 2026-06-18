# Skill — Prototype brief

Final stage of the staged prototype-brief engine. The chain already picked the target, interpreted the client's world into a signal, diverged into directions, and red-teamed them down to one sharpened winner. Your job is to commit that winner into the reviewable brief a partner reads, edits, and approves, then hands to the build. You do NOT re-derive the solution: it is already chosen. You write it up, tight and concrete, grounded in the signal. A partner reads this in two minutes; the build reads it as its sole intake.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity: company, industry, the contact, recent interactions, deal notes, pain points, current systems.
- **Winning direction (sharpened)** — the chosen direction from the red-team stage: its title, the magic moment (one interaction, value in one click), the visual centerpiece, why a buyer leans in, and the 2–4 tabs it implies. This is what you build the brief around.
- **Signal** — the interpreted signal sheet: the target pain in the client's own words (quoted), the real day-to-day workflow, the primary user, the data shape, where the client said AI fits. Your evidence for the problem, user stories, and sample data.

You receive the winner and the signal, not the raw corpus. Trust them. Do not invent a different solution.

## What to produce

A Markdown brief, no preamble, in this exact order. The first section leads.

1. **The magic moment** — the ONE interaction where AI does the hard thing the client hates, value in a single click. State it as the build's primary target.
   > Lead the brief with the single interaction that makes the value land: what the user clicks, what AI does, what visibly changes, in one step. This is the #1 thing the build must make work.
2. **The problem** — in the client's own terms, 2–3 sentences, grounded in the signal. What is painful, what it costs them in time, money, or risk. Quote a line where it lands.
3. **User stories** — 3–6 lines, each `As a <role>, I want <action> so that <outcome>.` Drawn from the signal, not invented.
4. **Key features discussed** — a short bulleted list of the concrete features, each tied to a user story. Mark anything proposed but unconfirmed.
5. **Tabs / sections** — the 2–4 views the single-page prototype needs, named, in order. For each: what it shows and why it matters to that user.
6. **Sample data** — the shape of realistic, generic-but-plausible records for this industry: fields, statuses, a few example rows. Clearly illustrative. Never real client data.
7. **Visual mandate** — where visuals carry the value, per view.
   > Name, per view, where visuals do the heavy lifting and which view is a flat table. The build honors design principles for the how; this section decides the where. A live map is buildable when the problem is spatial.
8. **The "after" picture** — the single outcome the prototype makes obvious, and the one screen state that makes the buyer say "yes, that."
9. **Brand direction** — see below.
10. **Rubric self-check** — one line. Confirm the brief clears all three pillars: the magic moment, exactly-my-world, visual spectacle.

Aim for ~450–650 words. Concrete enough that the build does not have to guess; tight enough that the partner reads and edits it in two minutes.

## Brand direction

The build needs a palette. Resolve it here:

- If the deal has a website or domain, **use web search** to find the company's brand colors: header, logo, primary buttons, a press or brand kit. Emit primary-first hex with a short source note, e.g. `Primary #1B3A5C, Secondary #C9A961 (source: tally.co header + buttons)`.
- If you cannot find brand colors confidently, write exactly `[Shift Edition-06 fallback]` and stop. **Do not guess a hex.** The build has a correct default for this case.

## Rules

- **Specific to this deal.** Reuse the real company, industry, roles, and pain from the signal and context.
- **Plain language, no jargon, no banned words.**
- **Never invent** a metric, name, price, or fact. If a load-bearing fact is missing, write `[NEEDS INPUT: <what's needed>]` in place: the partner resolves it before the build saves. The time-back number and any pricing are the ones to flag rather than guess.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

Return the brief markdown only, no preamble, no code fence.
