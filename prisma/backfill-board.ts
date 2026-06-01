// One-time backfill after the universal-milestones / task-board migration.
//   1. Task.status ← done   (done=true → "done"; else stays "todo")
//   2. Task.category ← scope (has project/client/artifact → "project"; else "other")
//   3. Milestone.category = "project" (all existing milestones are project-scoped)
//   4. Milestone.ownerId ← the project's partnerLead (so board cards have an assignee)
// Idempotent — safe to re-run.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const doneTasks = await prisma.$executeRaw`UPDATE "Task" SET "status" = 'done' WHERE "done" = true AND "status" <> 'done'`;
  console.log(`Tasks set to done: ${doneTasks}`);

  const scoped = await prisma.$executeRaw`UPDATE "Task" SET "category" = 'project' WHERE "category" = 'other' AND ("projectId" IS NOT NULL OR "clientId" IS NOT NULL OR "artifactId" IS NOT NULL)`;
  console.log(`Tasks categorised as project: ${scoped}`);

  const mCat = await prisma.$executeRaw`UPDATE "Milestone" SET "category" = 'project' WHERE "projectId" IS NOT NULL AND "category" = 'other'`;
  console.log(`Milestones categorised as project: ${mCat}`);

  const mOwner = await prisma.$executeRaw`UPDATE "Milestone" m SET "ownerId" = p."partnerLeadId" FROM "Project" p WHERE m."projectId" = p."id" AND m."ownerId" IS NULL`;
  console.log(`Milestones assigned an owner: ${mOwner}`);

  console.log("Backfill complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
