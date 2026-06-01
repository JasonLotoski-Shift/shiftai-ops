// Board data audit — DRY RUN (read-only). Reports duplicate / mislinked tasks
// & milestones so we can decide what (if anything) to clean up. No writes.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const milestones = await prisma.milestone.findMany({
    select: { id: true, title: true, projectId: true, ownerId: true },
  });
  const tasks = await prisma.task.findMany({
    select: { id: true, title: true, milestoneId: true, projectId: true, clientId: true, ownerId: true },
  });

  // Duplicate milestones (same title + same project scope)
  const mGroups = new Map<string, string[]>();
  for (const m of milestones) {
    const key = `${norm(m.title)}::${m.projectId ?? ""}`;
    mGroups.set(key, [...(mGroups.get(key) ?? []), m.title]);
  }
  const dupMilestones = [...mGroups.values()].filter((g) => g.length > 1);

  // Duplicate tasks (same title + same milestone/project scope)
  const tGroups = new Map<string, string[]>();
  for (const t of tasks) {
    const key = `${norm(t.title)}::${t.milestoneId ?? t.projectId ?? ""}`;
    tGroups.set(key, [...(tGroups.get(key) ?? []), t.title]);
  }
  const dupTasks = [...tGroups.values()].filter((g) => g.length > 1);

  // Mislinked: task under a milestone whose project differs from the milestone's
  const mById = new Map(milestones.map((m) => [m.id, m]));
  const mislinked = tasks.filter((t) => {
    if (!t.milestoneId) return false;
    const m = mById.get(t.milestoneId);
    return m && m.projectId && t.projectId !== m.projectId;
  });

  const unassignedMilestones = milestones.filter((m) => !m.ownerId).length;
  const unassignedTasks = tasks.filter((t) => !t.ownerId).length;

  console.log("── Board audit (dry run) ──");
  console.log(`Milestones: ${milestones.length} (unassigned owner: ${unassignedMilestones})`);
  console.log(`Tasks: ${tasks.length} (unassigned: ${unassignedTasks})`);
  console.log(`Duplicate milestone groups: ${dupMilestones.length}`, dupMilestones.map((g) => g[0]));
  console.log(`Duplicate task groups: ${dupTasks.length}`, dupTasks.map((g) => g[0]));
  console.log(`Tasks mislinked to wrong project (vs their milestone): ${mislinked.length}`, mislinked.map((t) => t.title));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
