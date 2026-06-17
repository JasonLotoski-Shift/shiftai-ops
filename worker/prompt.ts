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
until it is good enough. You have three tools beyond Write/Read/Edit:

- \`mcp__eyes__screenshot\` — renders the current \`prototype.html\` in a real headless browser at
  1440px and returns an image of the page so you can SEE it. Call it after every change.
- \`mcp__gate__score\` — you submit honest 0–100 sub-scores; it returns the round number and tells
  you to STOP or CONTINUE. The gate enforces a hard cap on rounds.

Each round:
1. Write or edit \`prototype.html\` (Write/Edit). It must obey the "Build HTML prototype" rules
   above: one self-contained file, a real multi-tab interface, a genuinely working key interaction,
   on-brand, realistic sample data with enough rows to look alive.
2. Call \`mcp__eyes__screenshot\` and study the image like a design reviewer: layout, visual
   hierarchy, spacing, density, color, type, and whether it reads as a real product rather than a
   mockup. Name the specific weaknesses you see in THIS screenshot.
3. Decide the concrete changes for the next round.
4. Call \`mcp__gate__score\` with honest sub-scores (structure, fidelity to the brief, design,
   interactivity), a one-line summary of the single biggest thing to fix next, and the remaining issues.
5. If the gate says CONTINUE, apply your changes and repeat from step 1. If it says STOP, take one
   final screenshot to confirm, make sure no \`[NEEDS INPUT]\` markers and no banned words remain,
   then finish.

Rules for the loop:
- Always screenshot after you edit the file, and before you score. Never score without having looked.
- Be your harshest critic in the early rounds. The score should climb because the file genuinely
  got better, not because you inflated it. A first draft is rarely above ~60.
- When the gate says STOP, stop editing and finish. Do not exceed the cap.
- Your finished work is \`prototype.html\` on disk. Do not paste the HTML into the conversation.
`;

export function buildSystemPrompt(): string {
  const firm = readSkill("_firm/context.md");
  const htmlSkill = readSkill("html-prototype/SKILL.md");
  return [firm, "\n\n---\n\n", htmlSkill, "\n", LOOP_PROTOCOL].join("");
}
