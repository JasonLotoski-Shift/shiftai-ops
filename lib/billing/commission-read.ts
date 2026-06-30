// The single read layer for the unified commission model (CommissionLine +
// CommissionPayout). Replaces the per-old-table aggregators in commissions.ts at
// the Phase 4 cutover: firm-wide totals and the per-partner rollup both come from
// the payout rows now (§9.6 — "origination is read ONCE from origination-kind
// payout rows, never re-derived from the allocation").
//
// Pure (no DB): callers query the lines (with their payouts) and pass them in.
// owed/paid now live on the payout row, so there is no lazy accrual flip here.

import type { CommissionKind, CommissionStream, PayoutStatus } from "@/lib/generated/prisma/enums";

export type CommissionPayoutView = {
  amount: number;
  status: PayoutStatus; // owed | paid | confirmed
  stream: CommissionStream; // build | recurring
};
export type CommissionLineView = {
  kind: CommissionKind; // origination | source
  partnerId: string | null;
  externalName: string | null;
  payouts: CommissionPayoutView[];
};

/** paid OR confirmed counts as cash that has left (mirrors ConsultantPayout). */
export const isPaidStatus = (s: PayoutStatus) => s === "paid" || s === "confirmed";

export type FirmCommissionTotalsV2 = {
  originationOwed: number;
  originationPaid: number;
  sourceBuildOwed: number;
  sourceBuildPaid: number;
  recurringOwed: number;
  recurringPaid: number;
  partnerShare: number; // everything (owed + paid) routed to partners
  externalShare: number; // everything routed to external referrers
  total: number; // all commission, owed + paid
  totalPaid: number; // the paid/confirmed slice (real cash out)
};

/** Firm-wide commission flow-through, bucketed by kind + stream + paid state. */
export function firmCommissionTotalsV2(lines: CommissionLineView[]): FirmCommissionTotalsV2 {
  const t: FirmCommissionTotalsV2 = {
    originationOwed: 0, originationPaid: 0,
    sourceBuildOwed: 0, sourceBuildPaid: 0,
    recurringOwed: 0, recurringPaid: 0,
    partnerShare: 0, externalShare: 0,
    total: 0, totalPaid: 0,
  };
  for (const line of lines) {
    for (const p of line.payouts) {
      const paid = isPaidStatus(p.status);
      if (line.kind === "origination") {
        if (paid) t.originationPaid += p.amount; else t.originationOwed += p.amount;
      } else if (p.stream === "build") {
        if (paid) t.sourceBuildPaid += p.amount; else t.sourceBuildOwed += p.amount;
      } else {
        if (paid) t.recurringPaid += p.amount; else t.recurringOwed += p.amount;
      }
      t.total += p.amount;
      if (paid) t.totalPaid += p.amount;
      if (line.partnerId) t.partnerShare += p.amount; else t.externalShare += p.amount;
    }
  }
  return t;
}

export type PartnerCommissionV2 = {
  originationEarned: number; // origination-kind payouts (build stream)
  sourceBuildEarned: number; // source-kind build-stream payouts
  recurringEarned: number; // source-kind recurring-stream payouts
  paid: number; // the paid/confirmed slice across all of the above
};

/** Per-partner commission earnings from the payout rows (external referrers
 *  excluded — they are not partners). Maps 1:1 onto PartnerEconomicsRow. */
export function rollupCommissionByPartner(lines: CommissionLineView[]): Map<string, PartnerCommissionV2> {
  const map = new Map<string, PartnerCommissionV2>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) {
      v = { originationEarned: 0, sourceBuildEarned: 0, recurringEarned: 0, paid: 0 };
      map.set(id, v);
    }
    return v;
  };
  for (const line of lines) {
    if (!line.partnerId) continue;
    const v = get(line.partnerId);
    for (const p of line.payouts) {
      if (line.kind === "origination") v.originationEarned += p.amount;
      else if (p.stream === "build") v.sourceBuildEarned += p.amount;
      else v.recurringEarned += p.amount;
      if (isPaidStatus(p.status)) v.paid += p.amount;
    }
  }
  return map;
}
