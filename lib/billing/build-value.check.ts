// Acceptance checks for the Phase 1 build-value resolver + the pinned rounder.
// No test runner is configured; run directly:
//   npx tsx lib/billing/build-value.check.ts
// Exits non-zero on any failed assertion.

import { authoritativeBuildValue } from "./build-value";
import { roundHalfAwayFromZero } from "./round";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}

// ── Resolver: budget authoritative once set; estimate then valueEstimate fall back ──
eq("deal · budget overrides estimate + valueEstimate", authoritativeBuildValue({ kind: "deal", budgetFee: 50000, acceptedEstimateTotal: 42000, valueEstimate: 38000 }), 50000);
eq("deal · accepted estimate is the fallback", authoritativeBuildValue({ kind: "deal", budgetFee: null, acceptedEstimateTotal: 42000, valueEstimate: 38000 }), 42000);
eq("deal · valueEstimate is the last fallback", authoritativeBuildValue({ kind: "deal", acceptedEstimateTotal: null, valueEstimate: 38000 }), 38000);
eq("deal · nothing set → 0", authoritativeBuildValue({ kind: "deal" }), 0);
eq("deal · explicit budget of 0 is honoured (nullish, not falsy)", authoritativeBuildValue({ kind: "deal", budgetFee: 0, acceptedEstimateTotal: 42000 }), 0);
eq("project · uses budgetFee", authoritativeBuildValue({ kind: "project", budgetFee: 88800 }), 88800);
eq("never negative", authoritativeBuildValue({ kind: "project", budgetFee: -5 }), 0);

// ── Rounder: half AWAY from zero (the §9.7 #1 pin) ──
eq("round 2.5 → 3", roundHalfAwayFromZero(2.5), 3);
eq("round -2.5 → -3", roundHalfAwayFromZero(-2.5), -3);
eq("round 0.5 → 1", roundHalfAwayFromZero(0.5), 1);
eq("round -0.5 → -1", roundHalfAwayFromZero(-0.5), -1);
eq("round 2.4 → 2", roundHalfAwayFromZero(2.4), 2);

console.log(failures === 0 ? "\nAll build-value checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
