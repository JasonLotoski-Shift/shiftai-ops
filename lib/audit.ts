// writeAudit — the one helper every mutation calls.
//
// Pattern (canonical): every server action that writes to the DB calls
// writeAudit() before returning. To make a mutation atomic with its audit
// row, run both inside a prisma.$transaction and pass the tx client in
// as `db`. Outside a transaction, pass the singleton from "@/lib/prisma".
//
// Recipe in shiftai-ops/CLAUDE.md "Wire a Quick Action end-to-end".

import type { PrismaClient } from "./generated/prisma/client";

// Narrow shape so $transaction tx clients (which omit $transaction etc.)
// satisfy the type without an `as any` at every call site.
type DBClient = Pick<PrismaClient, "auditLog">;

export type Actor =
  | { kind: "partner"; id: string; label: string }
  | { kind: "agent"; name: string }; // e.g. { kind: "agent", name: "draft-email" }

export type AuditInput = {
  actor: Actor;
  /** Dotted verb form: "create.contact", "update.deal.stage", "delete.task". */
  action: string;
  targetType: string; // e.g. "Contact", "Deal", "Artifact"
  targetId?: string;
  /** Before/after diff for updates; new row for creates; previous row for deletes. */
  changes?: unknown;
  /** Optional request context — useful for diligence trails. */
  ip?: string;
  userAgent?: string;
};

function resolveActor(a: Actor): { actor: string; actorLabel: string } {
  if (a.kind === "partner") return { actor: a.id, actorLabel: a.label };
  return { actor: `agent:${a.name}`, actorLabel: `AGENT · ${a.name.toUpperCase()}` };
}

/**
 * Append one row to AuditLog. No-op-safe (never throws synchronously — the
 * caller awaits and can decide whether a write failure rolls back the parent
 * mutation by running both inside the same $transaction).
 *
 * Returns the created row so callers can reference its id if they need to.
 */
export async function writeAudit(db: DBClient, input: AuditInput) {
  const { actor, actorLabel } = resolveActor(input.actor);
  return db.auditLog.create({
    data: {
      actor,
      actorLabel,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      changes: (input.changes as never) ?? undefined,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}

/**
 * Convenience for the common case: "an authenticated partner did X".
 * Use inside server actions where you've already resolved the session.
 */
export function partnerActor(partnerId: string, displayName: string): Actor {
  return { kind: "partner", id: partnerId, label: displayName };
}

/**
 * Convenience for AI surfaces: "the draft-email skill did X".
 * Skill name should match the skill folder (e.g. "draft-email", "scope").
 */
export function agentActor(skillName: string): Actor {
  return { kind: "agent", name: skillName };
}
