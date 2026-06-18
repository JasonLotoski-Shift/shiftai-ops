// Composes the agent's system prompt per build kind: the firm brain + the kind's
// skill (html-prototype | proposal-deck) + the design principles + the autonomous
// build/critique loop protocol for that kind. Mirrors lib/ai.ts buildSystemBlocks()
// (firm context first, then the skill), but adds the loop instructions the SDK agent runs.
import fs from "node:fs";
import path from "node:path";
import { SKILLS_DIR } from "./paths";
import type { BuildKind } from "./config";

function readSkill(rel: string): string {
  return fs.readFileSync(path.join(SKILLS_DIR, rel), "utf8");
}

const PROTOTYPE_LOOP_PROTOCOL = `
---

## How you operate — the autonomous build ⇄ critique loop

You build the prototype as ONE self-contained file named \`prototype.html\` in your working
directory, then improve it by LOOKING at your own work and critiquing it, round after round,
until it is good enough. You have these tools beyond Write/Read/Edit:

- \`mcp__eyes__screenshot\` — renders the current \`prototype.html\` in a real headless browser at
  1440px and returns an image of the page so you can SEE it. Call it after every change.
- \`mcp__eyes__interact\` — drives REAL clicks/typing/hovers in your \`prototype.html\` and returns
  which steps hit or missed plus an after-screenshot, so you can VERIFY the key interaction works
  in the DOM — not just how it looks. Use it every round before you score.
- \`mcp__gate__score\` — you submit honest 0–100 sub-scores; it returns the round number and tells
  you to STOP or CONTINUE. The gate enforces a hard cap on rounds.
- \`mcp__library__list_projects\` / \`mcp__library__get_project\` — the firm's library of past
  prototypes. \`get_project\` returns a project's overview, reuse notes, and screenshots of its
  finished UI so you can SEE proven work. Borrow structure, layout patterns, and copy ideas;
  never copy another client's data.

Before you write the first version: call \`mcp__library__list_projects\`, and if a past project is
close to this brief's shape (same kind of board, same interaction), \`get_project\` it and study its
screenshots. Lift what works — don't reinvent a layout the firm already proved. If the library is
empty or unavailable, just proceed from the brief.

Each round:
1. Write or edit \`prototype.html\` (Write/Edit). It must obey the "Build HTML prototype" rules
   above: one self-contained file, a real multi-tab interface, a genuinely working key interaction,
   on-brand, realistic sample data with enough rows to look alive.
2. Call \`mcp__eyes__screenshot\` and study the image like a design reviewer: layout, visual
   hierarchy, spacing, density, color, type, and whether it reads as a real product rather than a
   mockup. Name the specific weaknesses you see in THIS screenshot.
3. Call \`mcp__eyes__interact\` ONCE to perform the brief's single KEY interaction (give the exact CSS
   selectors from the markup you wrote) and confirm it works in the DOM before you score. A \`✗\`
   result means that selector wasn't found and the interaction is broken — score \`interactivity\` low
   and fix it next round (the gate enforces an interactivity floor, so a broken interaction can't
   pass). Test the ONE key interaction per round, not every minor control — and do not run repeated
   interact/screenshot cycles before scoring. One look, one interaction check, then score.
4. Decide the concrete changes for the next round.
5. Call \`mcp__gate__score\` with honest sub-scores (structure, fidelity to the brief, design,
   interactivity), a one-line summary of the single biggest thing to fix next, and the remaining issues.
6. If the gate says CONTINUE, apply your changes and repeat from step 1. If it says STOP, run the
   THEME-CONFIRMATION PASS (below) once, make sure no \`[NEEDS INPUT]\` markers and no banned words
   remain, then finish.

During the rounds, the theme toggle is NOT the key interaction — don't spend the per-round interaction
check on it; keep that for the brief's magic moment. You confirm both themes once, at the very end.

Rules for the loop:
- Keep each round TIGHT: one edit pass → one screenshot → one interaction check → one score. Do not
  churn many edit/screenshot/interact cycles inside a single round before scoring — make your changes,
  look once, test the key interaction once, then SCORE and let the gate decide. Polishing forever
  without scoring wastes the budget and never reaches the gate.
- Always screenshot after you edit the file, then \`mcp__eyes__interact\` to exercise the key
  interaction, and only then score. Never score without having looked AND driven the interaction.
- Be your harshest critic in the early rounds. The score should climb because the file genuinely
  got better, not because you inflated it. A first draft is rarely above ~60.
- **When the gate returns STOP, you are DONE — after the THEME-CONFIRMATION PASS.** Do NOT call
  \`score\` again and do NOT keep polishing. The finish sequence is exactly:
  1. Take ONE final confirmation screenshot (this shows the default theme).
  2. Call \`mcp__eyes__interact\` ONCE to click the theme-toggle button (give its exact selector). This
     both proves the toggle works (a \`✗\` means it's broken — fix it) AND returns a screenshot of the
     OTHER theme. Check that mode reads well: adequate contrast, no invisible/washed-out text, brand
     accent intact, no element that only worked in the default theme.
  3. ONLY if that off-default theme has a real contrast/visibility break, make the minimal fix and
     re-run this pass once. Otherwise you are finished. (Cosmetic nitpicks are not a reason to continue.)
  4. Confirm no \`[NEEDS INPUT]\` markers or banned words remain, and finish.
- Your finished work is \`prototype.html\` on disk. Do not paste the HTML into the conversation.
`;

const DECK_LOOP_PROTOCOL = `
---

## How you operate — the autonomous build ⇄ critique loop

You build the proposal deck as ONE self-contained file named \`deck.html\` in your working
directory, then improve it by LOOKING at your own work and critiquing it, round after round,
until it is good enough. You have these tools beyond Write/Read/Edit:

- \`mcp__eyes__screenshot\` — renders the current \`deck.html\` in a real headless browser at 1440px
  and returns an image of the page so you can SEE it. Call it after every change. The deck is a
  long-scroll document; the screenshot shows the top of the page — that is enough to judge the cover,
  type, palette, spacing, and the first sections. Trust your own markup for the lower sections.
- \`mcp__gate__score\` — you submit honest 0–100 sub-scores (clarity, completeness, design, onbrand);
  it returns the round number and tells you to STOP or CONTINUE. The gate enforces a hard cap on rounds.

Your intake gives you the approved SCOPE OF WORK and a \`PROTOTYPE_URL\`. Render the SOW into the deck:
pull scope, phases, foundation, ownership, what-we-need, timeline, and price FROM the SOW; do not
invent a fact it does not contain. Wire the "Demo prototype" button to the real \`PROTOTYPE_URL\`.

There is no interaction to drive on a deck — do NOT call \`mcp__eyes__interact\`. Judge it as a
client-facing document: does it read clearly, is every scope section present, is the demo button
wired to the real URL, and is it on-brand.

Each round:
1. Write or edit \`deck.html\` (Write/Edit). It must obey the "Proposal deck" rules above: one
   self-contained file, the full section spine (cover, what we heard, what we'll build + demo button,
   the foundation, the platform/ownership, how it works, scope in/out, timeline, what you get,
   what we need from you, investment, the "after", next step), Edition-06 on-brand.
2. Call \`mcp__eyes__screenshot\` and study the image like a design reviewer: cover impact, visual
   hierarchy, spacing, density, color, type, on-brand. Name the specific weaknesses you see.
3. Confirm in your markup that the Demo-prototype button uses the real \`PROTOTYPE_URL\` (not a
   placeholder), and that every scope section is present and carries real content from the SOW.
4. Decide the concrete changes for the next round.
5. Call \`mcp__gate__score\` with honest sub-scores (clarity, completeness, design, onbrand), a
   one-line summary of the single biggest thing to fix next, and the remaining issues.
6. If the gate says CONTINUE, apply your changes and repeat from step 1. If it says STOP, confirm no
   \`[NEEDS INPUT]\` markers and no banned words remain, take one final confirmation screenshot, then finish.

Rules for the loop:
- Keep each round TIGHT: one edit pass → one screenshot → one score. Do not churn many edit/screenshot
  cycles before scoring — make your changes, look once, then SCORE and let the gate decide.
- Be your harshest critic in the early rounds. The score should climb because the deck genuinely got
  better. A first draft is rarely above ~60.
- **When the gate returns STOP, you are DONE.** Do NOT call \`score\` again and do NOT keep polishing.
  Confirm no \`[NEEDS INPUT]\` markers or banned words remain, take one final confirmation screenshot, finish.
- Your finished work is \`deck.html\` on disk. Do not paste the HTML into the conversation.
`;

export function buildSystemPrompt(kind: BuildKind = "prototype"): string {
  const firm = readSkill("_firm/context.md");
  const design = readSkill("_design/principles.md");
  if (kind === "deck") {
    const deckSkill = readSkill("proposal-deck/SKILL.md");
    return [firm, "\n\n---\n\n", deckSkill, "\n\n---\n\n", design, "\n", DECK_LOOP_PROTOCOL].join("");
  }
  const htmlSkill = readSkill("html-prototype/SKILL.md");
  return [firm, "\n\n---\n\n", htmlSkill, "\n\n---\n\n", design, "\n", PROTOTYPE_LOOP_PROTOCOL].join("");
}
