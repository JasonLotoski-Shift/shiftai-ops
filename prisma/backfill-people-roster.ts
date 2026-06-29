// One-time, idempotent backfill for the unified People model: ensure every
// Partner is on the people roster (a Consultant row linked by partnerId). The
// roster is now the single People table — partners who are not on it would be
// missing from the people pickers. Re-runnable: it skips partners that already
// have a linked roster row, and never touches external (no-partner) rows.
//
// Run against the shared Supabase (same DATABASE_URL as prod):
//   npx tsx prisma/backfill-people-roster.ts
//
// Read-mostly + additive: it only INSERTS missing roster rows. No deletes, no
// updates to existing data.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const partners = await prisma.partner.findMany({
    select: { id: true, name: true, role: true, consultantProfile: { select: { id: true } } },
    orderBy: { name: "asc" },
  });

  let created = 0;
  for (const p of partners) {
    if (p.consultantProfile) continue; // already on the roster
    await prisma.consultant.create({
      data: {
        name: p.name,
        // Keep their firm role as the roster role (e.g. "Managing Partner · Build").
        role: p.role || "Partner",
        partnerId: p.id,
        active: true,
        defaultPayRateCents: 0, // set their billable rate on the Team page
      },
    });
    created++;
    console.log(`  + roster row for ${p.name}`);
  }

  console.log(`Done. Created ${created} roster row(s); ${partners.length - created} partner(s) already on the roster.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
