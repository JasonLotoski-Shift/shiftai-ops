"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import type { ArchitectureNoteDTO } from "@/components/architecture-map/lib/notes";

// Team notes on architecture-map cards. Every note is authored by the
// signed-in partner; any signed-in partner can delete any note. Each write
// round-trips one AuditLog row via the canonical writeAudit helper.

const MAX_BODY = 2000;

const SELECT = {
  id: true,
  nodeId: true,
  body: true,
  authorId: true,
  createdAt: true,
  author: { select: { name: true, initials: true } },
} as const;

type Row = {
  id: string;
  nodeId: string;
  body: string;
  authorId: string;
  createdAt: Date;
  author: { name: string; initials: string };
};

function toDTO(r: Row): ArchitectureNoteDTO {
  return {
    id: r.id,
    nodeId: r.nodeId,
    body: r.body,
    authorId: r.authorId,
    authorName: r.author.name,
    authorInitials: r.author.initials,
    createdAt: r.createdAt.toISOString(),
  };
}

async function requirePartner() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) throw new Error("Not signed in");
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { name: true },
  });
  return { partnerId, name: partner?.name ?? "Partner" };
}

/** All notes, grouped by node id (oldest first). Hydrates the map on load. */
export async function listArchitectureNotes(): Promise<
  Record<string, ArchitectureNoteDTO[]>
> {
  const rows = await prisma.architectureNote.findMany({
    orderBy: { createdAt: "asc" },
    select: SELECT,
  });
  const byNode: Record<string, ArchitectureNoteDTO[]> = {};
  for (const r of rows) (byNode[r.nodeId] ??= []).push(toDTO(r));
  return byNode;
}

/** Add a note to a card, authored by the signed-in partner. */
export async function addArchitectureNote(
  nodeId: string,
  body: string,
): Promise<ArchitectureNoteDTO> {
  const { partnerId, name } = await requirePartner();
  const text = body.trim().slice(0, MAX_BODY);
  if (!nodeId || !text) throw new Error("A node and note text are required");

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.architectureNote.create({
      data: { nodeId, body: text, authorId: partnerId },
      select: SELECT,
    });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "create.architectureNote",
      targetType: "ArchitectureNote",
      targetId: created.id,
      changes: { nodeId, body: text },
    });
    return created;
  });
  return toDTO(row);
}

/** Delete a note. Any signed-in partner can delete any note. */
export async function deleteArchitectureNote(id: string): Promise<void> {
  const { partnerId, name } = await requirePartner();
  await prisma.$transaction(async (tx) => {
    const row = await tx.architectureNote.findUnique({
      where: { id },
      select: { id: true, nodeId: true, body: true, authorId: true },
    });
    if (!row) return;
    await tx.architectureNote.delete({ where: { id } });
    await writeAudit(tx, {
      actor: partnerActor(partnerId, name),
      action: "delete.architectureNote",
      targetType: "ArchitectureNote",
      targetId: id,
      changes: row,
    });
  });
}
