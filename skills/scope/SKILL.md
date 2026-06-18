# Skill — Scope of work (SOW)

Turn a pipeline opportunity into a high-level scope of work a partner can refine, then hand to the deck. This is the written agreement the deck is built from: what we'll build, the foundation we set up first, how we work, what the client owns, what we need from them, and the investment. Strong structure, real specifics from the deal, nothing invented. Not a finished, sendable contract — the reviewable source the partner edits and the deck renders.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — don't restate them.

## Input you'll get

- **Context block** — the deal and primary contact: company, industry, stage, estimated value, target close, deal notes, and recent interactions.
- **Intake** — what the partner wants this scope to cover (the focus), any fee, subscription, or timeline they've supplied, who's preparing it, and — when one exists — a link to the **prototype** already built for this deal. The prototype is what you demonstrated; the SOW commits to building it for real.

## What to produce

A scope of work in **Markdown**, ready to edit. Use this structure (drop a section only if there's genuinely nothing to say, but keep the spine and the order):

1. **Title** — `# Scope of work: <Company>` and a one-line subtitle naming the system/outcome. (Use a colon in the literal title, never an em dash.)
2. **What we heard** — the client's situation and the pain, in their terms, from the deal notes and interactions. Specific, not generic.
3. **What we'll build, and what's out** — the custom internal system + where AI does real work, concrete to this business. If a prototype exists, tie this to what it demonstrated: the SOW builds the prototype for real. Then state plainly **what's out of this phase**: what we are not building now, what waits for a later module under the subscription, what the client keeps doing as-is. Draw the exclusions from the deal context; the out-list is what keeps a pilot a pilot. If no specific exclusions are known, say the scope is the system above and further modules are added later under the subscription. Never invent a restriction the client would dispute.
4. **The foundation we set up first** — the infrastructure work that comes before features, framed as value, not a parts list. Stand up the environment, connect the client's data sources and the APIs/integrations the system reads and writes (name the real ones from the context where you can), set up access and accounts, deploy the pilot. State plainly that this base is built once and every later module rides on it, so the work compounds and each addition is faster and cheaper than the first. Flag any integration whose access the client must grant as a dependency, not an assumption.
5. **The platform and what you own** — frame the standard build as ownership, not a spec sheet. The client gets its own running instance, its own data, and a runnable version it keeps. The firm keeps the reusable platform/library (patterns, never the client's data). One line on what it's built on for reassurance — a modern, maintainable web stack the firm runs and supports, with the client's data in its own database — kept plain, never a jargon dump.
6. **How we work** — the three phases: **Discovery → Build → Operate**. One short paragraph each, tailored to this engagement. Operate is the ongoing managed service: maintain, improve, add modules.
7. **What we need from you** — the client's side of the work, stated as expectations: a single point of contact, access to the systems and data the build connects to, decisions inside the agreed cadence, and the people the operators need time with. Be concrete; a build slips when these are vague.
8. **What you get, and when** — the recurring deliverables: Weekly Brief (Fridays, one page), Phase Report (end of phase), Operating Review (quarterly during Operate). Plus the system itself at the end of Build.
9. **What success looks like** — measurable outcomes (hours back, time saved, work removed). Tie to what the client said they measure.
10. **Timeline** — phased and flow-based: Discovery, then Build (foundation first, then features), then Operate. Weeks or milestones, **only real dates if supplied** — otherwise `[NEEDS INPUT]`.
11. **Investment** — the one-time build fee **and** the monthly subscription, **only if supplied** (see rules). Otherwise `[NEEDS INPUT]`. Fixed engagement fee, never hourly. A buy-out to full ownership is available and is quoted per deal in the final SOW, named here as an option without a number unless one was given.
12. **Next step** — one clear action (e.g. a scoping call to confirm Discovery).

Return only the scope-of-work Markdown — no preamble, no "here's a draft," no commentary after.

## Rules for this task

- **High-level, not a build spec.** This reads at the altitude an operator decides on: what gets built, the shape of the work, what they own, the cost. Name the standard stack and the foundation as reassurance and as value, never as an engineering document. No file names, no framework version numbers, no schema.
- **Specifics over adjectives.** Pull real details from the context — the named pain, the industry, the contact's words, the systems they run today. A scope that could be sent to any company is a failure.
- **The foundation is a selling point.** The infra/API setup is front-loaded on purpose: once it's set, building on top is faster. Say that plainly. It is the reason the subscription and later modules are worth it.
- **Phases are the method, plainly.** No branded methodology name. Just Discovery / Build / Operate, described for this client.
- **Measured outcomes.** Frame success in hours/time/work returned, not vague value. If the context gives a metric the client cares about, build success measures around it.
- **Right length.** Tight and skimmable — a busy operator reads it in a few minutes. Prose + short lists, not walls of text.
- **No hourly billing.** The firm bills on a fixed engagement fee/value plus the monthly subscription, never hours.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

## When input is missing — never invent

Never fabricate a fee, a subscription price, a date, a timeline, a headcount, a name, an integration the client never mentioned, or a commitment. If the scope needs one that isn't in the context or intake, put `[NEEDS INPUT: <what's needed>]` exactly where it belongs and keep going — the partner fills it before the deck is built. A server-side gate blocks any scope still containing `[NEEDS INPUT]` from being saved, so leaving the marker is the correct, safe move. This is the firm's most important rule.
