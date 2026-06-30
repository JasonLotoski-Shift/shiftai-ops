// Acceptance checks for the Phase 2 cashflow engine. No test runner is configured;
// run directly:  npx tsx lib/billing/cashflow.check.ts
// Exits non-zero on any failed assertion.

import { computeCashflow, buildExpectedItems, type CashflowSourceRows } from "./cashflow";

let failures = 0;
function eq(label: string, got: number | string | boolean | null, want: number | string | boolean | null) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${String(got)}${ok ? "" : ` — expected ${String(want)}`}`);
}

const empty: CashflowSourceRows = {
  installments: [],
  invoices: [],
  contracts: [],
  bills: [],
  owedPayouts: [],
  reimbursements: [],
  subscriptions: [],
  commissions: [],
};

// ── Scenario 1: strip + weekly running balance, with an overdue + undated item ──
{
  const now = new Date(2026, 5, 15); // Mon Jun 15 2026, local midnight
  const rows: CashflowSourceRows = {
    ...empty,
    invoices: [{ id: "A", number: "0001", amount: 5000, dueAt: new Date(2026, 5, 25), status: "sent", company: "Acme" }],
    bills: [
      { id: "B", vendor: "Vend", number: "B-1", amount: 3000, dueAt: new Date(2026, 5, 20), status: "received" },
      { id: "E", vendor: "Late", number: "E-1", amount: 1500, dueAt: new Date(2026, 5, 1), status: "received" }, // overdue
    ],
    owedPayouts: [{ id: "C", party: "Dana", amount: 2000, dueDate: new Date(2026, 6, 5) }],
    reimbursements: [{ id: "D", party: "Sam", amount: 800 }], // undated → now
  };
  const r = computeCashflow(rows, now, 10000);

  eq("s1 comingIn30", r.position.comingIn30, 5000);
  eq("s1 goingOut30", r.position.goingOut30, 3000 + 2000 + 800 + 1500);
  eq("s1 projectedClose30", r.position.projectedClose30, 10000 + 5000 - 7300);
  eq("s1 shortfallDate (none negative)", r.position.shortfallDate, null);
  // runway: out12-in12 = 7300-5000 = 2300; avg = 2300/12; 10000 / avg ≈ 52.17
  eq("s1 runway rounded", r.position.runwayMonths == null ? -1 : Math.round(r.position.runwayMonths), 52);

  // Weekly running balance: wk0 out 5300 (B+D+E), wk1 in 5000 (A), wk2 out 2000 (C)
  eq("s1 wk0 closing", r.weekly[0].closing, 4700);
  eq("s1 wk0 cashOut", r.weekly[0].cashOut, 5300);
  eq("s1 wk1 closing", r.weekly[1].closing, 9700);
  eq("s1 wk2 closing", r.weekly[2].closing, 7700);
  eq("s1 wk12 closing (settles)", r.weekly[12].closing, 7700);

  const items = buildExpectedItems(rows, now);
  eq("s1 overdue flag on E", items.find((i) => i.id === "bill-E")?.overdue ?? false, true);
  eq("s1 undated flag on D", items.find((i) => i.id === "reimb-D")?.undated ?? false, true);
  eq("s1 item count", items.length, 5);
}

// ── Scenario 2: recurring contract emission + monthly bucketing + horizon cutoff ──
{
  const now = new Date(2026, 5, 15); // Jun 15 2026
  const rows: CashflowSourceRows = {
    ...empty,
    contracts: [{ id: "SC", label: "Acme retainer", monthlyFee: 1000, startDate: new Date(2026, 5, 15), termMonths: 14, status: "active" }],
  };
  const r = computeCashflow(rows, now, 0);
  // Horizon = Jun 1 2026 + 12 months = Jun 1 2027. Occurrences Jun15'26..May15'27 = 12 months in window.
  eq("s2 monthly[0] cashIn", r.monthly[0].cashIn, 1000);
  eq("s2 monthly[11] cashIn", r.monthly[11].cashIn, 1000);
  eq("s2 monthly[11] closing", r.monthly[11].closing, 12000);
  // Item stream should hold exactly 12 occurrences (k12/k13 beyond horizon are dropped).
  const items = buildExpectedItems(rows, now);
  eq("s2 contract occurrences in horizon", items.length, 12);
}

console.log(failures === 0 ? "\nAll cashflow checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
