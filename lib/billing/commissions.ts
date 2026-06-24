// lib/billing/commissions.ts
// Firm-wide + per-partner commission aggregators for /financials. Pure (no DB).
// Per-row math (commissionDollars, effectiveAccrualStatus) lives in
// lib/billing/commission.ts — the single source of truth; this module only
// buckets already-queried rows and re-exports the status helper for the page.

import { effectiveAccrualStatus } from "@/lib/billing/commission";
import type { CommissionAccrualStatus } from "@/lib/generated/prisma/enums";

export { effectiveAccrualStatus };

export type BuildCommissionRow = { buildAmount: number; partnerId: string | null; externalName: string | null };
export type AccrualRowForRollup = {
  amount: number;
  status: CommissionAccrualStatus;
  periodStart: Date;
  partnerId: string | null;
  externalName: string | null;
};

export type FirmCommissionTotals = {
  buildTotal: number;
  recurringProjected: number;
  recurringAccrued: number;
  recurringPaid: number;
  partnerShare: number; // build + recurring owed to partners
  externalShare: number; // build + recurring owed to external referrers
};

/** Firm-wide commission flow-through. Build slice is one-time (payable now);
 *  recurring is bucketed by EFFECTIVE accrual status (lazy, zero-cron). */
export function firmCommissionTotals(
  build: BuildCommissionRow[],
  accruals: AccrualRowForRollup[],
  now: Date = new Date(),
): FirmCommissionTotals {
  let buildTotal = 0,
    recurringProjected = 0,
    recurringAccrued = 0,
    recurringPaid = 0,
    partnerShare = 0,
    externalShare = 0;
  for (const b of build) {
    buildTotal += b.buildAmount;
    if (b.partnerId) partnerShare += b.buildAmount;
    else externalShare += b.buildAmount;
  }
  for (const a of accruals) {
    const eff = effectiveAccrualStatus(a.status, a.periodStart, now);
    if (eff === "paid") recurringPaid += a.amount;
    else if (eff === "accrued") recurringAccrued += a.amount;
    else recurringProjected += a.amount;
    if (a.partnerId) partnerShare += a.amount;
    else externalShare += a.amount;
  }
  return { buildTotal, recurringProjected, recurringAccrued, recurringPaid, partnerShare, externalShare };
}

export type PartnerCommission = {
  buildEarned: number;
  recurringProjected: number;
  recurringAccrued: number;
  recurringPaid: number;
};

/** Per-partner commission earnings (external-referrer rows excluded — not partners). */
export function partnerCommissionEarnings(
  build: BuildCommissionRow[],
  accruals: AccrualRowForRollup[],
  now: Date = new Date(),
): Map<string, PartnerCommission> {
  const map = new Map<string, PartnerCommission>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) {
      v = { buildEarned: 0, recurringProjected: 0, recurringAccrued: 0, recurringPaid: 0 };
      map.set(id, v);
    }
    return v;
  };
  for (const b of build) if (b.partnerId) get(b.partnerId).buildEarned += b.buildAmount;
  for (const a of accruals) {
    if (!a.partnerId) continue;
    const v = get(a.partnerId);
    const eff = effectiveAccrualStatus(a.status, a.periodStart, now);
    if (eff === "paid") v.recurringPaid += a.amount;
    else if (eff === "accrued") v.recurringAccrued += a.amount;
    else v.recurringProjected += a.amount;
  }
  return map;
}

export type ProjectAllocForOrigination = { alloc: { origination: number }; originations: { partnerId: string; sharePct: number }[] };

/** Per-partner origination $ — the net-new math the codebase never had: each
 *  project's origination pool split by each partner's sharePct (rounded). The
 *  unattributed remainder (shares <100) stays firm, not assigned to a partner. */
export function partnerOriginationEarnings(projects: ProjectAllocForOrigination[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of projects) {
    for (const o of p.originations) {
      map.set(o.partnerId, (map.get(o.partnerId) ?? 0) + Math.round(p.alloc.origination * (o.sharePct / 100)));
    }
  }
  return map;
}
