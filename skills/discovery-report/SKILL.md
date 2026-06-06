# Skill - Discovery report

Turn the discovery findings into a client-facing **Discovery Report**: a short, branded HTML deck that plays back what we heard, shows what we found, and lays out an idea for the system to build, ending on a question that confirms they see the value. It carries no pricing (that lives in the proposal / SOW). The partner reviews and edits before it goes to the client.

The firm's voice, identity, and hard rules are in the firm context above. Apply them. Two tone rules matter most here and are spelled out below: **the build plan is an idea they buy into, not a plan we impose**, and **the close confirms value, it does not ask for a yes/no buying decision.**

## Input you'll get

- **Context block** - the client/opportunity: company, industry, the primary contact, and the discovery interactions (what they told us, the painful workflows, any numbers they named).
- **Intake** - the partner's discovery findings: the systems worth building, the one new insight to surface, the time-back hypothesis, and the two outcomes the system delivers (the "X and Y" the close asks about).
- **Client brand (when we have it)** - the context block carries the client's saved brand colors (primary, secondary), captured during company enrichment. When present, the deck adopts them (see Brand spec). When absent, it defaults to Shift light mode.

## What to produce

Return **only the HTML** - a complete document starting with `<!DOCTYPE html>`. No prose before or after, no Markdown code fence. Full-viewport, scroll-navigable sections (slides). This is sent to the client, so it has to read as a finished, confident deliverable once the partner refines it.

Section sequence (drop a section only if there is genuinely nothing to say; never pad):

1. **Cover** - SHIFT AI wordmark, the client name, the system in one line, and the outcome it delivers. Date.
2. **What you told us** - replay their pain in their own words, pulled from the discovery interactions. This re-iterates that we listened and frames everything that follows. Specific, quoted where possible.
3. **What we found** - the current state, the workflows eating time. Do two things: confirm what they already feel, **and** surface one thing they had not thought of (a hidden cost, a connection they missed). The new insight is what earns trust.
4. **Our thinking** - the build plan, framed as an idea to buy into, not a verdict. Open it as "here is what we think this could look like" / "our thinking on the system." Describe the scoped pieces, what each does, and where AI does real work, in their language. Confident about the direction, open about the details. They need to see themselves in it.
5. **How it connects** - the integration points: the tools it ties together so the business runs on one floor instead of swivel-chairing between five apps. Plain, concrete to their stack.
6. **Time back** - the measurable target: hours a week, time saved, work removed, tied to the metric the client actually cares about. This is the load-bearing number. If the intake/context did not give one, mark `[NEEDS INPUT: time-back target]` visibly - never invent it.
7. **How we would build it** - the phases, sequenced and simple enough that they follow it. Cover three beats: the **key problem we solve** (and that we solve it better than they thought possible), the **integration + AI piece**, and **security** (state plainly that their data and access are handled). Plain language, no methodology branding.
8. **What you would have** - paint the end of the first build: a working system with **one key feature already live and in use**, not a slide-deck promise. Concrete, theirs, soon.
9. **Does this hit the mark?** - the value-confirmation close. One clear statement that names the two outcomes from the intake: *"Do you see how this system gives you back [X] and [Y]? If anything is off, tell us where, so we hit the mark."* It is built to land a **Yes, I see it** or a **No, but it would need to do Z** - a redirect that surfaces the real gap - never a flat no. Do not phrase it as "do you want to proceed." It confirms they see the value; the proposal is where the decision happens.
10. **Thank you / next step** - thank them plainly and name the next step: the partner follows up with a proposal. Frame the proposal as the natural next move once they see the value, not a hard ask.

## Tone - the two rules that make this work

- **Idea, not edict.** Section 4 must read as a proposal of thinking the client shapes with us, not a finished plan handed down. "Here's what we think could work" beats "here's the plan." Confidence in the direction, humility on the details. An operator buys a system they helped shape.
- **Confirm value, don't ask to buy.** Section 9 is an affirmation, not a close-the-deal question. It invites "yes I see it" or a specific correction. The buying decision waits for the proposal. Never write "are you ready to move forward."

## No pricing

This deck carries **no fees, no rates, no totals**. The Discovery Report scopes the system and proves the value; the proposal and SOW carry the numbers. If the intake includes a price, leave it out and note that it belongs in the proposal.

## Brand spec - light mode, Shift craft, client color

This is a client-facing document, so it runs in **light mode** (Edition 06's document register). Structure, type, spacing, and craft are always Shift. The accent color flexes to the client when we have their brand; otherwise it stays Shift.

**Fonts (always Shift, via Google Fonts `<link>`):**
- Big Shoulders Display 900: the wordmark and section headlines.
- Inter 400 / 500: body and sub-heads.
- JetBrains Mono 500: eyebrows, labels, and the time-back number (all caps, ~0.08em tracking).

**Shift light palette (the default, and the canvas in every case):**
```css
--fog: #ECEDEF;        /* page canvas */
--white: #FFFFFF;      /* cards, raised surfaces */
--hairline: #D7D8DC;   /* borders, used sparingly */
--ink: #15171A;        /* type */
--track-gold: #C9A961; /* Shift accent + the wordmark AI (always) */
--flag-red: #9F2521;   /* visible [NEEDS INPUT] markers only */
```

**Client brand (fuller match, when the context provides it):**
When the context block includes the client's brand colors, adopt them across the deck on the Shift light canvas:
- **Primary** is the dominant accent: section headlines and eyebrows, the time-back number, key rule lines, and one tinted header band per section where it reads clean.
- **Secondary** is the support accent: the "what we found" insight callout, chips, secondary marks.
- Keep Shift neutrals as the canvas (`--fog` page, `--white` cards, `--ink` type) and Shift fonts and layout throughout. Their color, our craft.
- Apply their colors with Shift discipline: one dominant accent per surface, no gradients, no glassmorphism, restraint over decoration. A tailored Shift deliverable, not their template.
- The wordmark's AI stays Track Gold, always (brand rule). Our mark stays ours even in their colors.

**No client brand in context** defaults to Shift light mode: Fog / White / Ink with Track Gold as the single accent. Clean, on-brand, never blocked on missing brand info.

**Layout (always):**
- Full-viewport sections, generous spacing, content capped ~1100px.
- Soft 10px radius on cards and controls, pill on small chips, a subtle shadow for lift (never a glow). No gradients, no glassmorphism.
- One dominant accent moment per section, never a rainbow.
- Hairlines in `--hairline` for structure only, not a line under every row.
- The time-back number in section 6 is the single biggest visual moment, in the dominant accent.

**Wordmark in HTML:**
```html
<span class="wordmark"><span class="sa-shift">SHIFT</span> <span class="sa-ai">AI</span></span>
```
```css
.wordmark { font-family:'Big Shoulders Display',sans-serif; font-weight:900; letter-spacing:-0.02em; display:inline-block; transform:skewX(-12deg); line-height:1; }
.wordmark .sa-shift { color:var(--ink); }      /* ink on the light surface */
.wordmark .sa-ai { color:var(--track-gold); }  /* AI is always Track Gold */
```
Legal name "Shift AI Partners" appears only upright, in the footer. Never "boutique" or "small firm": a senior firm with bench depth.

## When input is missing - never invent

Never fabricate a number, a quote, a metric, a date, or a system the partner did not name. Render any missing load-bearing fact as **visible on-page text**, e.g. `<span style="color:#9F2521">[NEEDS INPUT: time-back target]</span>`, never in an HTML comment. The server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is the correct, safe move. The time-back number and the two close outcomes (X and Y) are the most important facts to get right - mark them rather than guess.

## Output

Single `.html` file. Inline `<style>`. Google Fonts via `<link>`. No external images (CSS/SVG/data-URI only), no required JavaScript beyond optional smooth-scroll. Return only the HTML, starting at `<!DOCTYPE html>`.
