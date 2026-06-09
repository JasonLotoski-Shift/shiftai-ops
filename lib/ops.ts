// Operational telemetry — the write side of the "System status" feature.
//
// logOps() records one OpsEvent per Claude call / cron run / ingest / integration
// check / MCP tool call (success AND failure), with latency + token usage. It is
// FIRE-AND-FORGET: it wraps its own write in try/catch and NEVER throws into the
// caller — telemetry must not break the path it observes. Sibling of writeAudit
// (mutations) / writeActivity (human feed) in lib/audit.ts.
//
// Also here: failure notifications (de-duped to the ok→error transition),
// retention pruning, the managing-partner recipient lookup, and an APPROXIMATE
// $ cost estimate. Server-only.

import type { PrismaClient } from "./generated/prisma/client";
import type { OpsKind, OpsStatus } from "./generated/prisma/enums";
import { prisma } from "./prisma";
import { notifyPartner } from "./messaging";
import { isManagingPartner } from "./permissions";

type DBClient = Pick<PrismaClient, "opsEvent">;

export type OpsInput = {
  kind: OpsKind;
  name: string;
  status: OpsStatus;
  actor?: string;
  actorLabel?: string;
  detail?: string;
  error?: string | null;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  model?: string;
  clientId?: string;
  meta?: unknown;
};

/**
 * Fire-and-forget operational log. NEVER throws — a telemetry write must not
 * break (or slow, when called with `void`) the operation it records. Pass a tx
 * client to co-commit with a transaction; omit `db` to use the singleton.
 *
 * Note: `db` is the LAST arg with a default (unlike writeAudit(db, input)) so
 * the common fire-and-forget call site stays a single argument.
 */
export async function logOps(input: OpsInput, db: DBClient = prisma): Promise<void> {
  try {
    await db.opsEvent.create({
      data: {
        kind: input.kind,
        name: input.name.slice(0, 200),
        status: input.status,
        actor: input.actor ?? "system",
        actorLabel: input.actorLabel ?? input.actor ?? "SYSTEM",
        detail: input.detail ?? null,
        error: input.error ? input.error.slice(0, 500) : null,
        durationMs: input.durationMs,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        model: input.model ?? null,
        clientId: input.clientId ?? null,
        meta: (input.meta as never) ?? undefined,
      },
    });
  } catch (e) {
    // Swallow — telemetry must never surface. Also no-ops cleanly if the table
    // isn't migrated yet (mirrors the gmail-poll "inert before migrate" pattern).
    console.warn("logOps failed (swallowed):", e instanceof Error ? e.message : e);
  }
}

/** Was the most recent event for this (kind, name) an error? Used to notify only
 *  on the ok→error transition, so a persistently-failing hourly job alerts once. */
export async function wasLastOpError(kind: OpsKind, name: string): Promise<boolean> {
  try {
    const last = await prisma.opsEvent.findFirst({
      where: { kind, name },
      orderBy: { ts: "desc" },
      select: { status: true },
    });
    return last?.status === "error";
  } catch {
    return false;
  }
}

/** Managing-partner ids — default recipients for firm-wide failure alerts. */
export async function managingPartnerIds(): Promise<string[]> {
  try {
    const partners = await prisma.partner.findMany({ select: { id: true, role: true } });
    return partners.filter((p) => isManagingPartner(p.role)).map((p) => p.id);
  } catch {
    return [];
  }
}

/** Send an ops_alert to each partner. Each send is isolated — a messaging
 *  failure must not break the cron/integration that triggered it. */
export async function notifyOpsFailure(partnerIds: string[], body: string, link = "/settings?tab=status"): Promise<void> {
  for (const id of partnerIds) {
    try {
      await notifyPartner(prisma, id, "ops_alert", body, { link });
    } catch {
      /* messaging failure — ignore */
    }
  }
}

/** Delete OpsEvent rows older than `days`. Called opportunistically from the
 *  hourly gmail-poll cron (no dedicated cron). Never throws. */
export async function pruneOpsEvents(days = 30): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    await prisma.opsEvent.deleteMany({ where: { ts: { lt: cutoff } } });
  } catch {
    /* pruning is best-effort */
  }
}

// ── Approximate cost estimate ────────────────────────────────────────────
// APPROXIMATE per-million-token USD prices — verify against current Anthropic
// pricing and edit here when it changes. Cache reads bill at ~10% of input.
// Used only for the "~$X" line on the System status Claude card; raw token
// counts (stored on every row) are the source of truth.
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};
const DEFAULT_PRICE = PRICE_PER_MTOK["claude-sonnet-4-6"];

export function estimateCostUSD(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
): number {
  const p = (model && PRICE_PER_MTOK[model]) || DEFAULT_PRICE;
  const M = 1_000_000;
  // Cache reads are charged at ~10% of the input rate; treat them as input minus
  // their discount (we already count them inside inputTokens on the row, so this
  // only ADDS the discount back conservatively — keep it simple: bill all input
  // at full rate, which slightly over-estimates when caching is heavy).
  void cacheReadTokens;
  return (inputTokens / M) * p.in + (outputTokens / M) * p.out;
}
