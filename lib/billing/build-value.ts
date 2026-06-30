// authoritativeBuildValue — the ONE resolver for a contract's build value (rebuild
// Ask 1 / §9.5). Every commission line with basis=build_value computes against
// this, closing today's gap where deal-source used valueEstimate and project-source
// used budgetFee. Budget is authoritative ONCE SET; a later accepted estimate never
// re-overrides (deterministic resolver):
//   pre-convert (deal):    Deal.budgetFee ?? acceptedEstimate.totalValue ?? Deal.valueEstimate ?? 0
//   post-convert (project): Project.budgetFee
//
// Pure: it takes the already-loaded values (no DB), so it is safe to call before
// the Phase 1 migration applies — Deal.budgetFee does not exist as a column yet,
// so callers pass `budgetFee: null` until 010 lands.

import { roundHalfAwayFromZero } from "./round";

export type DealBuildValueInput = {
  kind: "deal";
  budgetFee?: number | null; // Deal.budgetFee (null until set / column applied)
  acceptedEstimateTotal?: number | null; // the accepted Estimate's totalValue
  valueEstimate?: number | null; // Deal.valueEstimate
};
export type ProjectBuildValueInput = {
  kind: "project";
  budgetFee: number; // Project.budgetFee (already authoritative post-convert)
};
export type BuildValueInput = DealBuildValueInput | ProjectBuildValueInput;

export function authoritativeBuildValue(input: BuildValueInput): number {
  const raw =
    input.kind === "project"
      ? input.budgetFee
      : input.budgetFee ?? input.acceptedEstimateTotal ?? input.valueEstimate ?? 0;
  return Math.max(0, roundHalfAwayFromZero(raw || 0));
}
