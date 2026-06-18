// Composes the agent's system prompt: the firm brain + the html-prototype skill
// + the autonomous build/critique loop protocol. Mirrors lib/ai.ts buildSystemBlocks()
// (firm context first, then the skill), but adds the loop instructions the SDK agent runs.
import fs from "node:fs";
import path from "node:path";
import { SKILLS_DIR } from "./paths";

function readSkill(rel: string): string {
  return fs.readFileSync(path.join(SKILLS_DIR, rel), "utf8");
}

const LOOP_PROTOCOL = `
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
3. Call \`mcp__eyes__interact\` to actually PERFORM the brief's key interaction (give the exact CSS
   selectors from the markup you wrote) and confirm it works in the DOM before you score. A \`✗\`
   result means that selector wasn't found and the interaction is broken — you MUST score
   \`interactivity\` low until \`interact\` reports every step \`✓\` and the after-screenshot shows the
   intended effect. The gate enforces an interactivity floor, so a broken interaction cannot pass.
4. Decide the concrete changes for the next round.
5. Call \`mcp__gate__score\` with honest sub-scores (structure, fidelity to the brief, design,
   interactivity), a one-line summary of the single biggest thing to fix next, and the remaining issues.
6. If the gate says CONTINUE, apply your changes and repeat from step 1. If it says STOP, take one
   final screenshot to confirm, make sure no \`[NEEDS INPUT]\` markers and no banned words remain,
   then finish.

Rules for the loop:
- Always screenshot after you edit the file, then \`mcp__eyes__interact\` to exercise the key
  interaction, and only then score. Never score without having looked AND driven the interaction.
- Be your harshest critic in the early rounds. The score should climb because the file genuinely
  got better, not because you inflated it. A first draft is rarely above ~60.
- When the gate says STOP, stop editing and finish. Do not exceed the cap.
- Your finished work is \`prototype.html\` on disk. Do not paste the HTML into the conversation.
`;

export function buildSystemPrompt(): string {
  const firm = readSkill("_firm/context.md");
  const htmlSkill = readSkill("html-prototype/SKILL.md");
  const design = readSkill("_design/principles.md");
  return [firm, "\n\n---\n\n", htmlSkill, "\n\n---\n\n", design, "\n", LOOP_PROTOCOL].join("");
}
