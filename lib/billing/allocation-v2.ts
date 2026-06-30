// Financials rebuild — the NEW labour-revenue allocation (plan §9.1-9.3).
//
// This sits ALONGSIDE the old allocateLaborRevenue in economics.ts during Phase 3
// (dual-source): the live calc keeps reading the old function until the Phase 4
// cutover flips callers to this one. Building it as a separate, pure, fixture-
// tested function keeps blast radius at zero until parity is proven.
//
// What changed from the old allocation (Jason's D1/D2 decisions, 2026-06-29):
//   D2 — source commission NETS from firm reserve. Firm reserve now means "what
//        the firm keeps AFTER commission." The old function never netted source
//        (origination and source were independent additive earnings).
//   The two never share a base: origination is a slice of the LABOUR pie
//   (laborBillable × originationPct), source is funded from reserve against the
//   BUILD value (authoritativeBuildValue × buildPct). That separation is what
//   keeps the math clean and the invariant exact (§9.2).
//
// All money is whole CAD. Rounding is pinned half-away-from-zero everywhere the
// calc / editor preview / recompute run, so JS and any verifier agree to the
// dollar (§9.7 #1).

import { roundHalfAwayFromZero as round } from "./round";
import type { CommissionKind } from "@/lib/generated/prisma/enums";

// Only the dimensions the allocation math needs off a commission line. The full
// CommissionLine row carries payee / schedule / provenance; none of that changes
// the firm-reserve split, so the pure function takes just this.
export type AllocationCommissionLine = {
  kind: CommissionKind; // "origination" | "source"
  buildPct: number; // percent, e.g. 5 = 5% (NOT a fraction)
};

export type LaborAllocationV2 = {
  // Inputs echoed back (whole CAD / flags), so a caller has one object to render.
  laborBillable: number;
  takeHome: number;
  directCosts: number;
  authoritativeBuildValue: number;
  isFirstContract: boolean;
  originationPct: number; // fraction actually applied (0.10 = 10%)
  isBuyout: boolean;

  // The split (§9.1).
  originationFromLabour: number; // isFirstContract ? round(laborBillable × originationPct) : 0
  firmReserveBeforeSource: number; // laborBillable − takeHome − originationFromLabour
  sourceSlices: number[]; // per source line, in input order: round(buildPct/100 × buildValue)
  sourceCommissionTotal: number; // Σ sourceSlices
  firmReserve: number; // max(0, firmReserveBeforeSource − sourceCommissionTotal)  ← clamped (§9.3)
  firmReserveDeficit: number; // max(0, −(firmReserveBeforeSource − sourceCommissionTotal))
  overCommitted: boolean; // sourceCommissionTotal > firmReserveBeforeSource → loud red flag (§9.7 #3)

  clientPrice: number; // laborBillable + directCosts (buyout: the build value)
};

export const DEFAULT_ORIGINATION_PCT = 0.1; // 10% of labour revenue

/**
 * Allocate labour revenue into origination / firm reserve, netting source
 * commission out of reserve (D2). Pure — no DB, no Date, no side effects.
 *
 * - `originationPct` is a FRACTION (0.10 = 10%), matching the old function and
 *   Project.originationPct/100.
 * - `commissionLines` carries every line on the engagement; only `kind="source"`
 *   lines enter the reserve netting (origination is driven by originationPct
 *   against the labour pie, per §9.1 step 2). Source slices compute in input
 *   order so a caller can sort by `sortOrder` before calling and the per-line
 *   dollars line up for the parity gate.
 * - `authoritativeBuildValue` is the ONE build value (lib/billing/build-value.ts);
 *   source slices are a percent of THIS, never of laborBillable.
 */
export function allocateLaborRevenueV2(args: {
  laborBillable: number;
  takeHome: number;
  directCosts?: number;
  originationPct?: number;
  isFirstContract?: boolean;
  authoritativeBuildValue: number;
  commissionLines?: AllocationCommissionLine[];
  isBuyout?: boolean;
}): LaborAllocationV2 {
  const laborBillable = Math.max(0, round(args.laborBillable));
  const takeHome = Math.max(0, round(args.takeHome));
  const directCosts = Math.max(0, round(args.directCosts ?? 0));
  const buildValue = Math.max(0, round(args.authoritativeBuildValue));
  const isFirstContract = args.isFirstContract ?? true;
  const originationPct = args.originationPct ?? DEFAULT_ORIGINATION_PCT;
  const isBuyout = args.isBuyout ?? false;
  const lines = args.commissionLines ?? [];

  // 1. Buyout short-circuit (§9.1 step 1 / D3): pure firm capture, no labour
  //    split, no commission, no payout rows. The whole build value is reserve.
  if (isBuyout) {
    return {
      laborBillable,
      takeHome: 0,
      directCosts: 0,
      authoritativeBuildValue: buildValue,
      isFirstContract,
      originationPct: 0,
      isBuyout: true,
      originationFromLabour: 0,
      firmReserveBeforeSource: buildValue,
      sourceSlices: [],
      sourceCommissionTotal: 0,
      firmReserve: buildValue,
      firmReserveDeficit: 0,
      overCommitted: false,
      clientPrice: buildValue,
    };
  }

  // 2. Origination from the labour pie (§9.1 step 2). On a non-first contract the
  //    slot stays inside firm reserve (no origination paid).
  const originationFromLabour = isFirstContract ? round(laborBillable * originationPct) : 0;

  // 3. Firm reserve before source (§9.1 step 3) — equals the old firmPool + laborSurplus.
  const firmReserveBeforeSource = laborBillable - takeHome - originationFromLabour;

  // 4. Source commission netted from reserve (§9.1 step 4), base = build value.
  //    Origination-kind lines are ignored here (they are the labour-pie slice
  //    above; §9.7 #4 keeps origination free of a build slice).
  const sourceSlices = lines
    .filter((l) => l.kind === "source")
    .map((l) => round((l.buildPct / 100) * buildValue));
  const sourceCommissionTotal = sourceSlices.reduce((s, x) => s + x, 0);

  // 5. Clamp the firm-reserve floor at 0 and surface the deficit (§9.1 step 5 /
  //    §9.3). Payouts are still generated at full promised value elsewhere — the
  //    firm honours the contract; this only governs the displayed reserve and the
  //    warn flag. The clamp blocks nothing (warn-only, like reconcile()).
  const rawFirmReserve = firmReserveBeforeSource - sourceCommissionTotal;
  const firmReserve = Math.max(0, rawFirmReserve);
  const firmReserveDeficit = Math.max(0, -rawFirmReserve);

  return {
    laborBillable,
    takeHome,
    directCosts,
    authoritativeBuildValue: buildValue,
    isFirstContract,
    originationPct,
    isBuyout: false,
    originationFromLabour,
    firmReserveBeforeSource,
    sourceSlices,
    sourceCommissionTotal,
    firmReserve,
    firmReserveDeficit,
    // §9.7 #3: the warn ceiling keys off the deficit condition, not a
    // percent-of-laborBillable rule, so direct-cost-heavy deals are caught.
    overCommitted: sourceCommissionTotal > firmReserveBeforeSource,
    clientPrice: laborBillable + directCosts,
  };
}
