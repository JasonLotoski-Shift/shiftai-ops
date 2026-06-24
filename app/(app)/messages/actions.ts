"use server";

// Messaging server actions (B4) — channels + DMs over short-interval polling.
//
// Real-time is polling (3–5s): getMessagesSince(channelId, cursor) on a
// setInterval. No new infra, no client anon key. Supabase Realtime is the
// documented upgrade path the day three partners outgrow polling.
//
// Chat messages are their own system of record (the Message table) — they do
// NOT also write AuditLog/Activity rows (that ledger is for work events, and
// per-line chat audit would be noise). Posting still round-trips into the DB.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateDMChannel } from "@/lib/messaging";

// Message.kind: "chat" for partner chat; "task_assigned" | "deliverable_added"
// | "approval_needed" for typed system notes in the Claude system channel.
export type MessageKindValue =
  | "chat"
  | "task_assigned"
  | "deliverable_added"
  | "approval_needed"
  | "ops_alert";

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string; // ISO
  authorId: string | null;
  authorName: string | null;
  authorInitials: string | null;
  kind: MessageKindValue;
  link: string | null;
  task: { id: string; title: string; done: boolean; due: string | null; priority: string } | null;
};

const MESSAGE_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  authorId: true,
  kind: true,
  link: true,
  author: { select: { name: true, initials: true } },
  task: { select: { id: true, title: true, done: true, due: true, priority: true } },
} as const;

type RawMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  kind: MessageKindValue;
  link: string | null;
  author: { name: string; initials: string } | null;
  task: { id: string; title: string; done: boolean; due: Date | null; priority: string } | null;
};

function shape(m: RawMessage): ChatMessage {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    authorId: m.authorId,
    authorName: m.author?.name ?? null,
    authorInitials: m.author?.initials ?? null,
    kind: m.kind,
    link: m.link,
    task: m.task
      ? {
          id: m.task.id,
          title: m.task.title,
          done: m.task.done,
          due: m.task.due ? m.task.due.toISOString() : null,
          priority: m.task.priority,
        }
      : null,
  };
}

async function assertMember(channelId: string, partnerId: string) {
  const member = await prisma.channelMember.findUnique({
    where: { channelId_partnerId: { channelId, partnerId } },
    select: { partnerId: true },
  });
  if (!member) throw new Error("Not a member of this channel");
}

/** Poll: messages in a channel newer than the cursor (or the latest 50). */
export async function getMessagesSince(
  channelId: string,
  sinceISO?: string,
): Promise<ChatMessage[]> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  await assertMember(channelId, session.user.partnerId);

  if (sinceISO) {
    const since = new Date(sinceISO);
    const rows = await prisma.message.findMany({
      where: { channelId, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      select: MESSAGE_SELECT,
    });
    return rows.map(shape);
  }

  // Initial load — last 50, oldest-first for rendering.
  const rows = await prisma.message.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: MESSAGE_SELECT,
  });
  return rows.reverse().map(shape);
}

/** Post a message into a channel and mark it read for the author. */
export async function postMessage(channelId: string, body: string): Promise<ChatMessage> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  await assertMember(channelId, partnerId);

  const text = body.trim();
  if (!text) throw new Error("Message is empty");
  if (text.length > 4000) throw new Error("Message too long");

  const created = await prisma.message.create({
    data: { channelId, authorId: partnerId, body: text },
    select: MESSAGE_SELECT,
  });

  await prisma.channelMember.update({
    where: { channelId_partnerId: { channelId, partnerId } },
    data: { lastReadAt: new Date() },
  });

  revalidatePath("/messages");
  return shape(created);
}

/** Mark a channel read up to now for the current partner (clears unread badge). */
export async function markChannelRead(channelId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.partnerId) return;
  const partnerId = session.user.partnerId;
  const member = await prisma.channelMember.findUnique({
    where: { channelId_partnerId: { channelId, partnerId } },
    select: { partnerId: true },
  });
  if (!member) return;
  await prisma.channelMember.update({
    where: { channelId_partnerId: { channelId, partnerId } },
    data: { lastReadAt: new Date() },
  });
  revalidatePath("/messages");
}

/** Open (or create) a DM with another partner; returns the channel id. */
export async function openDM(otherPartnerId: string): Promise<{ channelId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const channelId = await findOrCreateDMChannel(prisma, session.user.partnerId, otherPartnerId);
  revalidatePath("/messages");
  return { channelId };
}
