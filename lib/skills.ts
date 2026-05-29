// Server-side skills registry — reads the canonical skill files off disk.
//
// The Firm Agents tab (B5) renders the actual SKILL.md for each skill the ops
// tool ships, so any partner can see exactly how an agent/Quick Action thinks
// — no hidden prompts. This is read-only and server-only (filesystem access).
//
// "_firm" is the shared firm brain (context.md, not a SKILL.md) — listed
// separately so the tab can show the house style every skill inherits.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR = path.join(process.cwd(), "skills");

export type SkillDoc = {
  /** Folder name under skills/ (also the generatedFromSkill value). */
  name: string;
  /** First markdown H1 (or the folder name if none). */
  title: string;
  /** Full markdown body of SKILL.md. */
  body: string;
};

export type FirmContext = {
  /** Full markdown body of skills/_firm/context.md, or null if absent. */
  body: string | null;
};

function deriveTitle(name: string, body: string): string {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].replace(/^Skill\s*[—-]\s*/i, "").trim();
  return name;
}

/** List every shipped skill (each skills/<name>/SKILL.md), excluding _firm. */
export async function listSkills(): Promise<SkillDoc[]> {
  let entries: string[];
  try {
    entries = await readdir(SKILLS_DIR);
  } catch {
    return [];
  }

  const docs: SkillDoc[] = [];
  for (const name of entries) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    const skillPath = path.join(SKILLS_DIR, name, "SKILL.md");
    try {
      const s = await stat(skillPath);
      if (!s.isFile()) continue;
      const body = await readFile(skillPath, "utf8");
      docs.push({ name, title: deriveTitle(name, body), body });
    } catch {
      // No SKILL.md in this folder — skip silently.
    }
  }
  docs.sort((a, b) => a.name.localeCompare(b.name));
  return docs;
}

/** Read the shared firm brain (skills/_firm/context.md). */
export async function readFirmContext(): Promise<FirmContext> {
  try {
    const body = await readFile(path.join(SKILLS_DIR, "_firm", "context.md"), "utf8");
    return { body };
  } catch {
    return { body: null };
  }
}
