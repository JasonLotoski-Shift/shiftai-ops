// writeAudit — the one helper every mutation calls.
//
// Pattern (canonical): every server action that writes to the DB calls
// writeAudit() before returning. To make a mutation atomic with its audit
// row, run both inside a prisma.$transaction and pass the tx client in
// as `db`. Outside a transaction, pass the singleton from "@/lib/prisma".
//
// Recipe in shiftai-ops/CLAUDE.md "Wire a Quick Action end-to-end".

import type { PrismaClient } from "./generated/prisma/client";
import type { ActivityType } from "./generated/prisma/enums";

// Narrow shape so $transaction tx clients (which omit $transaction etc.)
// satisfy the type without an `as any` at every call site.
type DBClient = Pick<PrismaClient, "auditLog">;
type DBClientActivity = Pick<PrismaClient, "activity">;

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

// ──────────────────────────────────────────────────────────────────────
// writeActivity — the curated, human-facing sibling of writeAudit.
//
// AuditLog is the complete ledger (every write, diligence-grade). Activity
// is the subset worth surfacing in the dashboard feed — deal moved, task
// done, hours logged, outreach sent. Call it in the SAME $transaction as
// the mutation + writeAudit so the feed never drifts from the ledger.
//
// Not every mutation writes an Activity row — only feed-worthy ones.
// ──────────────────────────────────────────────────────────────────────

export type ActivityInput = {
  actor: Actor;
  /** Visual category — drives feed styling (e.g. "ai" renders gold). */
  type: ActivityType; // "touch" | "status" | "hours" | "doc" | "ai"
  /** Short subject, e.g. "Brightline · Dispatch & WO" or a company name. */
  target: string;
  /** Human sentence, e.g. "Logged 3.5h — operator interviews". */
  detail: string;
  /** Optional relative URL ("/pipeline/<id>") to click through to the record. */
  link?: string;
};

/**
 * Append one row to the Activity feed. The actor is stored as its display
 * label ("Jason Lotoski" / "AGENT · CLAUDE") to match the existing feed
 * shape — Activity.actor is a label, not a Partner id (unlike AuditLog).
 */
export async function writeActivity(db: DBClientActivity, input: ActivityInput) {
  const { actorLabel } = resolveActor(input.actor);
  return db.activity.create({
    data: {
      ts: new Date(),
      actor: actorLabel,
      type: input.type,
      target: input.target,
      detail: input.detail,
      link: input.link,
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
