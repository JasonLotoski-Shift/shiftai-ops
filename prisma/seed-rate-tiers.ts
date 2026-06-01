// Idempotent, NON-destructive seed of the firm rate card (RateTier rows).
// Safe to run against the shared/prod DB — upserts by `key`, touches nothing
// else. Run: npx tsx prisma/seed-rate-tiers.ts
//
// (The full prisma/seed.ts is destructive — do not run that against prod.)

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { RATE_CARD } from "../lib/billing/rate-card";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const t of RATE_CARD) {
    await prisma.rateTier.upsert({
      where: { key: t.key },
      update: { name: t.name, billRateCents: t.billRateCents, payRateCents: t.payRateCents, sortOrder: t.sortOrder, active: true },
      create: { key: t.key, name: t.name, billRateCents: t.billRateCents, payRateCents: t.payRateCents, sortOrder: t.sortOrder },
    });
    console.log(`Upserted tier ${t.key} — ${t.name} ($${t.billRateCents / 100}/$${t.payRateCents / 100})`);
  }
  console.log("Rate card seeded.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
