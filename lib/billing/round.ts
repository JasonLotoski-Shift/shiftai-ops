// Pinned rounding for all financials math (rebuild §9.7 #1): round half AWAY from
// zero, so the calc, the editor preview, and the recompute all agree to the dollar
// with any external verifier. Bare Math.round breaks ties toward +Infinity (so
// -0.5 → -0), which disagrees on negative half-values; this rounds the magnitude
// then reapplies the sign. Every commission allocation / payout split MUST use this.
export function roundHalfAwayFromZero(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n));
}
