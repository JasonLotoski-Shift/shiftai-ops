# Skill — Prototype brief directions

Stage 1 of the staged prototype workflow: interpret and diverge. The target is already chosen. Read the deal corpus, build a clear-eyed read of the client's world, then propose 2–3 ambitious directions for the prototype to take. You are NOT writing the final brief and you are NOT building anything. You produce raw direction options that a fresh-context red-team judges next. Push for range. A safe, obvious direction wastes the slot.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Input you'll get

- **Context block** — the opportunity: company, industry, the contact, recent interactions, deal notes, pain points, current systems.
- **Intake** — two parts:
  - **Target** — the chosen module for the prototype (a title plus the pain it solves), already picked from the discovery report. This is the substance. Build for it.
  - **Partner steer** (optional) — a note that adjusts emphasis only ("lean into the live map," a constraint). It nudges where you put weight. It does not replace the target.
  - **Client files** — the deal's Drive corpus: transcripts, the discovery report, survey responses, call notes. This is your primary evidence. Read it closely.
- **Screenshots** (vision) — images the client shared of their current tools and spreadsheets. Evidence of the now-state and the data shape they live in.

## Step 1 — Interpret

Before proposing anything, build a tight read of the client's world from the corpus and screenshots. Pin down:

- **The pain in their exact words.** Quote the line where it lands. Use what they said, not a paraphrase.
- **The real workflow, step by step.** Who opens the tool, what they do, what they wait on, what breaks, what they re-key by hand. Concrete to their day.
- **The primary user.** The one role this prototype is for. Name it the way they name it.
- **The data shape.** What the screenshots show they work in: the records, fields, statuses, the spreadsheet columns. This is what the prototype's sample data has to mirror.
- **Where the client themselves said AI fits.** The moment in the corpus where they pointed at work an agent could take. Quote it if it exists.

This becomes the `signal`: a short markdown read of the target's world. The chosen target is the substance; the steer adjusts emphasis only.

## Step 2 — Diverge

Now propose **2–3 ambitious directions** for the prototype on that target. Each direction is a distinct take, not a variation in wording. Spread them: a different magic moment, a different visual centerpiece, a different angle on the same pain. Aim high. The prototype has to make a buyer lean forward, so each direction has to earn that.

Each direction must name four things:

- **`magicMoment`** — the ONE interaction where AI does the hard thing the client hates, value visible in a single click. The user clicks one thing, AI does the work, something visibly changes on screen. State it as one concrete action, not a feature.
- **`visualCenterpiece`** — the view where visuals carry the value: a live map, a routing board, an animated chart, a before-and-after. Real maps are buildable, so a live-map centerpiece is fair game when the problem is spatial. Name which view it is and why it is rich there.
- **`whyBuyerLeansIn`** — one line on why this direction makes the buyer say "yes, that."
- **`tabs`** — the 2–4 views this direction implies, named.

A direction that is a feature list with no magic moment is disallowed. Do not emit it. If a candidate direction has no single interaction that makes the value land, drop it and propose a sharper one.

## What to produce

Return ONLY a JSON object, no prose around it:

```json
{
  "signal": "<markdown: pain in their words (quoted), workflow, primary user, data shape, where they said AI fits>",
  "directions": [
    {
      "title": "<short name>",
      "magicMoment": "<the one interaction, value in one click>",
      "visualCenterpiece": "<which view is visually rich and why>",
      "whyBuyerLeansIn": "<one line>",
      "tabs": ["<tab>", "<tab>"]
    }
  ]
}
```

2–3 directions. No banned words, no em dashes, never invent a metric or fact (use `[NEEDS INPUT: …]` inside a string if a load-bearing fact is missing).

## Rules

- **Specific to this deal.** Reuse the real company, industry, roles, and pain from the corpus and context. Generic directions fail the next stage.
- **Range over safety.** Two timid directions are worse than one bold direction and one wild one. The red-team kills the weak option; your job is to give it real options to choose from.
- **Plain language, no jargon, no banned words.**
- **Never invent** a metric, name, price, or fact. If a load-bearing fact is missing, write `[NEEDS INPUT: <what's needed>]` inside the relevant string. The partner resolves it later.
- **Output is internal.** This JSON is consumed by Stage 2, never shown to the client. Write for the judge, not for polish.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every string this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.
