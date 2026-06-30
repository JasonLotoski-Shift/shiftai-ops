// Acceptance checks for the commission read layer (firm-wide totals + per-partner
// rollup from payout rows). Run: npx tsx lib/billing/commission-read.check.ts

import { firmCommissionTotalsV2, rollupCommissionByPartner, type CommissionLineView } from "./commission-read";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}

const lines: CommissionLineView[] = [
  // Partner A origination: $1,000 across 3 stages, one paid.
  { kind: "origination", partnerId: "A", externalName: null, payouts: [
    { amount: 500, status: "paid", stream: "build" },
    { amount: 250, status: "owed", stream: "build" },
    { amount: 250, status: "owed", stream: "build" },
  ] },
  // Partner B source: $2,000 build (owed) + 12×$400 recurring (2 paid).
  { kind: "source", partnerId: "B", externalName: null, payouts: [
    { amount: 2000, status: "owed", stream: "build" },
    ...Array.from({ length: 2 }, () => ({ amount: 400, status: "paid" as const, stream: "recurring" as const })),
    ...Array.from({ length: 10 }, () => ({ amount: 400, status: "owed" as const, stream: "recurring" as const })),
  ] },
  // External referrer source: $1,500 build owed (excluded from partner rollup).
  { kind: "source", partnerId: null, externalName: "Acme Referrals", payouts: [
    { amount: 1500, status: "owed", stream: "build" },
  ] },
];

// ── Firm-wide ──
{
  const t = firmCommissionTotalsV2(lines);
  eq("origination owed", t.originationOwed, 500);
  eq("origination paid", t.originationPaid, 500);
  eq("source build owed", t.sourceBuildOwed, 2000 + 1500);
  eq("recurring owed", t.recurringOwed, 4000); // 10 × 400
  eq("recurring paid", t.recurringPaid, 800); // 2 × 400
  eq("partner share", t.partnerShare, 1000 + 2000 + 4800); // A origination + B build + B recurring
  eq("external share", t.externalShare, 1500);
  eq("total", t.total, 1000 + 2000 + 4800 + 1500);
  eq("total paid", t.totalPaid, 500 + 800);
}

// ── Per-partner ──
{
  const m = rollupCommissionByPartner(lines);
  const a = m.get("A")!;
  eq("A origination earned", a.originationEarned, 1000);
  eq("A paid", a.paid, 500);
  const b = m.get("B")!;
  eq("B source build earned", b.sourceBuildEarned, 2000);
  eq("B recurring earned", b.recurringEarned, 4800);
  eq("B paid", b.paid, 800);
  eq("external excluded from rollup", m.has("Acme Referrals") ? 1 : 0, 0);
}

console.log(failures === 0 ? "\nAll commission-read checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
