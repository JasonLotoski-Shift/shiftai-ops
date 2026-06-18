"use server";

// Estimate actions (Phase 5) — pre-proposal scoping on a Deal.
//
// An Estimate hangs off a Deal: partners scope hours-by-tier before the
// proposal goes out. Lines default to the firm rate card and are overridable.
// `totalValue` is recomputed (Σ non-extra billable) on every line change. On
// deal-won the accepted estimate's lines convert into project economics
// (see convertDeal in ./actions.ts).
//
// Canonical mutation recipe: every write runs in prisma.$transaction with
// writeAudit, then revalidatePath.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, partnerActor } from "@/lib/audit";
import { economicsTotals } from "@/lib/billing/economics";
import { FALLBACK_BILL_RATE_CENTS } from "@/lib/billing/rate-card";
import type { EstimateStatus } from "@/lib/generated/prisma/enums";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return {
    actor: partnerActor(session.user.partnerId, session.user.name ?? session.user.email ?? "Unknown"),
  };
}

function validHours(raw: number): number {
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) throw new Error("Enter valid hours (≥ 0)");
  return Math.round(hours * 100) / 100;
}
function validRateCents(raw: number | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const cents = Math.round(Number(raw));
  if (!Number.isFinite(cents) || cents < 0) throw new Error("Enter a valid rate (≥ 0)");
  return cents;
}

// Recompute totalValue = Σ non-extra billable CAD across the estimate's lines.
async function recomputeEstimateTotalTx(
  tx: Pick<typeof prisma, "estimateLine" | "estimate">,
  estimateId: string,
) {
  const lines = await tx.estimateLine.findMany({
    where: { estimateId },
    select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true },
  });
  const totals = economicsTotals(
    lines.map((l) => ({ hours: Number(l.hours), payRateCents: l.payRateCents, billRateCents: l.billRateCents, isExtra: l.isExtra })),
  );
  await tx.estimate.update({ where: { id: estimateId }, data: { totalValue: totals.billableTotal } });
}

// Create a fresh draft estimate on the deal (or return the latest open one).
export async function ensureEstimate(dealId: string) {
  const { actor } = await getActor();
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } });
  if (!deal) throw new Error("Deal not found");

  const open = await prisma.estimate.findFirst({
    where: { dealId, status: { in: ["draft", "sent"] } },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  if (open) return { id: open.id };

  const latest = await prisma.estimate.findFirst({
    where: { dealId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.estimate.create({ data: { dealId, version, status: "draft", totalValue: 0 } });
    await writeAudit(tx, {
      actor,
      action: "create.estimate",
      targetType: "Estimate",
      targetId: row.id,
      changes: { dealId, version },
    });
    return row;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { id: created.id };
}

export async function addEstimateLine(
  estimateId: string,
  input: { rateTierId?: string | null; role?: string; hours: number; payRateCents?: number; billRateCents?: number; isExtra?: boolean },
) {
  const { actor } = await getActor();
  const estimate = await prisma.estimate.findUnique({ where: { id: estimateId }, select: { id: true, dealId: true, status: true } });
  if (!estimate) throw new Error("Estimate not found");
  if (estimate.status === "accepted" || estimate.status === "superseded") {
    throw new Error("This estimate is locked — start a new version to edit");
  }

  let tier: { id: string; name: string; billRateCents: number; payRateCents: number } | null = null;
  if (input.rateTierId) {
    const found = await prisma.rateTier.findUnique({
      where: { id: input.rateTierId },
      select: { id: true, name: true, billRateCents: true, payRateCents: true },
    });
    if (!found) throw new Error("Rate tier not found");
    tier = found;
  }

  const role = (input.role?.trim() || tier?.name || "").trim();
  if (!role) throw new Error("Give the line a role (pick a tier)");
  const hours = validHours(input.hours);
  const payRateCents = validRateCents(input.payRateCents, tier?.payRateCents ?? 0);
  const billRateCents = validRateCents(input.billRateCents, tier?.billRateCents ?? FALLBACK_BILL_RATE_CENTS);

  const last = await prisma.estimateLine.findFirst({
    where: { estimateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    const row = await tx.estimateLine.create({
      data: { estimateId, rateTierId: tier?.id ?? null, role, hours, payRateCents, billRateCents, isExtra: input.isExtra ?? false, sortOrder },
    });
    await recomputeEstimateTotalTx(tx, estimateId);
    await writeAudit(tx, {
      actor,
      action: "create.estimateLine",
      targetType: "EstimateLine",
      targetId: row.id,
      changes: { estimateId, role, hours, payRateCents, billRateCents },
    });
  });

  revalidatePath(`/pipeline/${estimate.dealId}`);
  return { ok: true as const };
}

export async function updateEstimateLine(
  lineId: string,
  input: { rateTierId?: string | null; role?: string; hours?: number; payRateCents?: number; billRateCents?: number; isExtra?: boolean },
) {
  const { actor } = await getActor();
  const before = await prisma.estimateLine.findUnique({
    where: { id: lineId },
    select: { id: true, estimateId: true, estimate: { select: { dealId: true, status: true } } },
  });
  if (!before) throw new Error("Estimate line not found");
  if (before.estimate.status === "accepted" || before.estimate.status === "superseded") {
    throw new Error("This estimate is locked — start a new version to edit");
  }

  const data: { rateTierId?: string | null; role?: string; hours?: number; payRateCents?: number; billRateCents?: number; isExtra?: boolean } = {};
  if (input.rateTierId !== undefined) data.rateTierId = input.rateTierId || null;
  if (input.role !== undefined) {
    const role = input.role.trim();
    if (!role) throw new Error("Role can't be empty");
    data.role = role;
  }
  if (input.hours !== undefined) data.hours = validHours(input.hours);
  if (input.payRateCents !== undefined) data.payRateCents = validRateCents(input.payRateCents, 0);
  if (input.billRateCents !== undefined) data.billRateCents = validRateCents(input.billRateCents, 0);
  if (input.isExtra !== undefined) data.isExtra = input.isExtra;

  await prisma.$transaction(async (tx) => {
    await tx.estimateLine.update({ where: { id: lineId }, data });
    await recomputeEstimateTotalTx(tx, before.estimateId);
    await writeAudit(tx, {
      actor,
      action: "update.estimateLine",
      targetType: "EstimateLine",
      targetId: lineId,
      changes: data,
    });
  });

  revalidatePath(`/pipeline/${before.estimate.dealId}`);
  return { ok: true as const };
}

export async function deleteEstimateLine(lineId: string) {
  const { actor } = await getActor();
  const before = await prisma.estimateLine.findUnique({
    where: { id: lineId },
    select: { id: true, estimateId: true, estimate: { select: { dealId: true } } },
  });
  if (!before) throw new Error("Estimate line not found");

  await prisma.$transaction(async (tx) => {
    await tx.estimateLine.delete({ where: { id: lineId } });
    await recomputeEstimateTotalTx(tx, before.estimateId);
    await writeAudit(tx, {
      actor,
      action: "delete.estimateLine",
      targetType: "EstimateLine",
      targetId: lineId,
      changes: { estimateId: before.estimateId },
    });
  });

  revalidatePath(`/pipeline/${before.estimate.dealId}`);
  return { ok: true as const };
}

const VALID_ESTIMATE_STATUS: EstimateStatus[] = ["draft", "sent", "accepted", "superseded"];

// Move an estimate through its lifecycle. Accepting supersedes every other
// non-accepted estimate on the deal (one accepted estimate at a time) AND
// overrides the deal's headline value with the accepted total — the accepted
// estimate IS the contract value from that point on (it already converts to
// project economics on win; this keeps the pipeline number honest meanwhile).
export async function setEstimateStatus(estimateId: string, status: string) {
  const { actor } = await getActor();
  if (!VALID_ESTIMATE_STATUS.includes(status as EstimateStatus)) throw new Error("Unknown status");
  const before = await prisma.estimate.findUnique({
    where: { id: estimateId },
    select: { id: true, dealId: true, status: true, totalValue: true, deal: { select: { valueEstimate: true } } },
  });
  if (!before) throw new Error("Estimate not found");

  const changes: Record<string, unknown> = { status: { before: before.status, after: status } };
  // On accept, sync the deal value to the estimate total (skip a no-op or an
  // empty/zero estimate — never zero out a deal value on accept).
  const overrideValue =
    status === "accepted" && before.totalValue > 0 && before.totalValue !== before.deal.valueEstimate;

  await prisma.$transaction(async (tx) => {
    await tx.estimate.update({ where: { id: estimateId }, data: { status: status as EstimateStatus } });
    if (status === "accepted") {
      await tx.estimate.updateMany({
        where: { dealId: before.dealId, id: { not: estimateId }, status: { not: "accepted" } },
        data: { status: "superseded" },
      });
    }
    if (overrideValue) {
      await tx.deal.update({
        where: { id: before.dealId },
        data: { valueEstimate: before.totalValue, lastTouchAt: new Date() },
      });
      changes.valueEstimate = { before: before.deal.valueEstimate, after: before.totalValue };
    }
    await writeAudit(tx, {
      actor,
      action: "update.estimate.status",
      targetType: "Estimate",
      targetId: estimateId,
      changes,
    });
  });

  revalidatePath(`/pipeline/${before.dealId}`);
  if (overrideValue) {
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
  }
  return { ok: true as const };
}
