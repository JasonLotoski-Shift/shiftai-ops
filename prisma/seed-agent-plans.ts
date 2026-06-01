// Seed the planned agents into the Firm · Agents tab (AgentPlan rows).
//
// Source of truth: docs/agent-flow-design.md "Build queue". This makes the
// roadmap visible + editable in the tool so the team can shape each agent
// before it's built.
//
// CREATE-ONLY-IF-MISSING by name — safe to re-run. It never updates or
// deletes an existing plan, so team edits made in the UI are preserved.
// (Note: prisma/seed.ts wipes the DB but does NOT touch AgentPlan, so these
// rows also survive a full re-seed.)

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedPlan = {
  name: string;
  goal: string;
  keyTasks: string[];
  notes: string;
  status: "idea" | "active" | "paused" | "done";
};

// Ordered as the build queue in docs/agent-flow-design.md. Status reflects
// real state today: Research is "next" (active); the rest are queued (idea).
const PLANS: SeedPlan[] = [
  {
    name: "Research",
    goal:
      "Paste a prospect and get a full enrichment dossier plus recent news — every item carries a \"why it matters\" line, so it sharpens discovery calls and proposals.",
    keyTasks: [
      "Enrich a contact: persona, communication style, key facts, background, network affiliations",
      "Pull recent news on the company — each item with a \"why\" line",
      "Merge findings non-destructively — add new facts, never overwrite existing ones",
      "Write the dossier back as an Artifact + AuditLog round-trip",
    ],
    notes:
      "Agent #1 — build first. Runs on web + Drive (live today). Triggers: new contact, enrichedAt > 90 days, manual (\"research X before my call\"), weekly sweep. Pairs with the meeting-prep skill.",
    status: "active",
  },
  {
    name: "Lead Scout",
    goal:
      "Run the Research engine in \"find\" mode — surface new prospects that match the firm's ICP across the four beachhead verticals.",
    keyTasks: [
      "Search the web for firms matching the ICP (automotive, motorsport, engineering, construction; $25–200M revenue)",
      "Score each candidate against the ICP and explain the fit",
      "Draft new contact records for partner review",
    ],
    notes:
      "Agent #2 — same engine as Research, find mode. Needs web + Drive (live today). Queued behind Research.",
    status: "idea",
  },
  {
    name: "Proposal Builder",
    goal:
      "Turn a deal moving to the proposal stage into a drafted scope/proposal using the existing /scope skill.",
    keyTasks: [
      "Auto-trigger when a deal stage changes to \"proposal\"",
      "Pull client context and run the /scope skill",
      "Save the draft proposal as an Artifact for partner review",
    ],
    notes:
      "Agent #3 — a wrapper on the existing /scope skill, not a rebuild. Capability is live today; the auto-trigger needs the MCP server.",
    status: "idea",
  },
  {
    name: "Reporting",
    goal:
      "Produce a read-only weekly firm brief — active builds, at-risk flags, pipeline movement. The first agent that writes to the tool: the safe way to build trust.",
    keyTasks: [
      "Read active engagements, pipeline, and tasks via MCP",
      "Summarize the week — what moved, what's at risk, what's gone stale",
      "Write the brief back as an Artifact + AuditLog round-trip",
    ],
    notes:
      "Agent #4 — needs the MCP server (read). Builds after MCP lands. First agent to write to the tool, but read-only, so low risk.",
    status: "idea",
  },
  {
    name: "Pipeline Steward",
    goal:
      "Flag stale deals, draft a re-engagement email matched to the contact's style, and create a next-action task. The first agent that acts on records.",
    keyTasks: [
      "Detect deals that have gone stale (e.g. 14+ days with no movement)",
      "Draft a re-engagement email matched to the contact's communication style",
      "Create a next-action task and log the draft as an Interaction",
    ],
    notes:
      "Agent #5 — needs MCP (read + write). Builds after Reporting proves the rails. The Follow-Up agent is folded into this one flow.",
    status: "idea",
  },
  {
    name: "Client Onboarding",
    goal:
      "When a deal is signed, stand up the new client end-to-end — Client + Project records, Drive folder, kickoff checklist, and an intro-email draft.",
    keyTasks: [
      "Trigger on deal stage → signed",
      "Create the Client + Project records and the Drive folder",
      "Generate a kickoff checklist and draft the intro email",
    ],
    notes:
      "Agent #6 — needs MCP + Drive. Builds when deals start closing.",
    status: "idea",
  },
];

async function main() {
  // Creator: Jason's partner row (Managing Partner · Build). Fall back to the
  // first partner if p-1 is absent in this environment.
  const creator =
    (await prisma.partner.findUnique({ where: { id: "p-1" }, select: { id: true } })) ??
    (await prisma.partner.findFirst({ select: { id: true } }));
  if (!creator) throw new Error("No Partner row found — cannot set createdById.");

  let created = 0;
  let skipped = 0;
  for (const p of PLANS) {
    const existing = await prisma.agentPlan.findFirst({ where: { name: p.name }, select: { id: true } });
    if (existing) {
      console.log(`• skip "${p.name}" — already exists`);
      skipped++;
      continue;
    }
    await prisma.agentPlan.create({
      data: {
        name: p.name,
        goal: p.goal,
        keyTasks: p.keyTasks,
        notes: p.notes,
        status: p.status,
        createdById: creator.id,
      },
    });
    console.log(`✓ created "${p.name}" (${p.status})`);
    created++;
  }
  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
