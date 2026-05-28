// Singleton Prisma client for the Next.js app.
// In dev, hot-reload creates a fresh module per request — without the global
// cache, every reload spawns a new connection pool and exhausts Postgres.
// In prod, modules are loaded once; the global cache is a no-op.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
