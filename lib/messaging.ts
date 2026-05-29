// Messaging helpers (B4) — server-only. No "use server": these are plain
// functions callable from server actions and server components, and they
// accept a Prisma tx client so a caller (e.g. createTask) can post a
// task-card message inside its own transaction.

import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@/lib/generated/prisma/client";

// Anything with the model accessors we touch — the singleton or a $transaction
// tx client both satisfy this.
type DB = Pick<PrismaClient, "channel" | "channelMember" | "message" | "partner">;

export const DEFAULT_CHANNELS = ["general", "pipeline", "deals"] as const;

/**
 * Ensure the firm's default channels exist and that every partner is a member
 * of each. Idempotent — safe to call on every Messages page load. Guarantees
 * prod has channels without depending on a seed run.
 */
export async function ensureFirmChannels(): Promise<void> {
  const partners = await prisma.partner.findMany({ select: { id: true } });
  if (partners.length === 0) return;

  for (const name of DEFAULT_CHANNELS) {
    let channel = await prisma.channel.findFirst({
      where: { kind: "channel", name },
      select: { id: true },
    });
    if (!channel) {
      channel = await prisma.channel.create({
        data: { kind: "channel", name },
        select: { id: true },
      });
    }
    // Add any partner who isn't already a member (also backfills new partners).
    const existing = await prisma.channelMember.findMany({
      where: { channelId: channel.id },
      select: { partnerId: true },
    });
    const have = new Set(existing.map((m) => m.partnerId));
    const missing = partners.filter((p) => !have.has(p.id));
    if (missing.length > 0) {
      await prisma.channelMember.createMany({
        data: missing.map((p) => ({ channelId: channel!.id, partnerId: p.id })),
      });
    }
  }
}

/**
 * Find (or create) the 1:1 DM channel between two partners. A DM is a
 * Channel of kind "dm" whose membership is exactly those two partners.
 * Works inside a transaction when `db` is a tx client.
 */
export async function findOrCreateDMChannel(
  db: DB,
  partnerA: string,
  partnerB: string,
): Promise<string> {
  if (partnerA === partnerB) throw new Error("Cannot open a DM with yourself");

  // A DM channel both partners belong to. With exactly-two-member DMs, a
  // channel containing both is unique.
  const candidates = await db.channelMember.findMany({
    where: { partnerId: partnerA, channel: { kind: "dm" } },
    select: { channelId: true },
  });
  for (const c of candidates) {
    const members = await db.channelMember.findMany({
      where: { channelId: c.channelId },
      select: { partnerId: true },
    });
    const ids = members.map((m) => m.partnerId).sort();
    const want = [partnerA, partnerB].sort();
    if (ids.length === 2 && ids[0] === want[0] && ids[1] === want[1]) {
      return c.channelId;
    }
  }

  const created = await db.channel.create({
    data: {
      kind: "dm",
      members: { create: [{ partnerId: partnerA }, { partnerId: partnerB }] },
    },
    select: { id: true },
  });
  return created.id;
}
