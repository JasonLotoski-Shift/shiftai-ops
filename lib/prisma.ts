// Singleton Prisma client for the Next.js app.
// In dev, hot-reload creates a fresh module per request — without the global
// cache, every reload spawns a new connection pool and exhausts Postgres.
// In prod, modules are loaded once; the global cache is a no-op.
//
// We do NOT `import "dotenv/config"` here. Next.js loads .env automatically
// via @next/env at server start; importing dotenv again races with that and
// can bake an undefined connection string into the singleton on cold start.
// The seed script (prisma/seed.ts) imports dotenv itself because it runs
// outside the Next.js runtime.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Check .env exists at the project root and the dev server was restarted after creating it.",
    );
  }
  // Cap the underlying pg pool per instance. On Vercel, each warm Lambda runs
  // its own pool; pg's default max is 10, so two concurrent instances (20) blow
  // past Supabase's pooler client limit. Keep max low and release idle clients
  // quickly so connections free up between invocations. The Vercel DATABASE_URL
  // MUST point at the transaction-mode pooler (port 6543), not session mode
  // (5432) — see CLAUDE.md gotcha #1.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 10_000,
    }),
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
