// Acceptance checks for commission in the GL spine (rebuild acceptance gate #1):
//   sum(ledger cashOut) == payoutsPaid + billsExpensesPaid + commissionPaid
// plus the commission↔bill dedup and the external-no-waiver missing-doc flag.
// Run: npx tsx lib/finance-ledger.commission.check.ts

import {
  toLedgerEntries,
  ledgerTotals,
  type RawBill,
  type RawPayout,
  type RawCommissionPayout,
} from "./finance-ledger";

let failures = 0;
function eq(label: string, got: number, want: number) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}: got ${got}${ok ? "" : ` — expected ${want}`}`);
}

const now = new Date("2026-06-30T00:00:00Z");

const bill = (over: Partial<RawBill> & { id: string }): RawBill => ({
  vendor: "Vendor", number: null, amount: 0, total: 0, origAmount: null, origCurrency: null,
  issuedAt: now, createdAt: now, paidAt: now, status: "paid", category: null, description: null,
  driveUrl: "http://doc", project: null, ...over,
});
const commission = (over: Partial<RawCommissionPayout> & { id: string }): RawCommissionPayout => ({
  amount: 0, status: "owed", method: null, paidAt: null, confirmedAt: null, createdAt: now,
  stream: "build", partnerId: "p1", partnerName: "Partner One", externalName: null, project: null,
  settledByBillId: null, invoiceWaivedReason: null, ...over,
});
const payout = (over: Partial<RawPayout> & { id: string }): RawPayout => ({
  amount: 0, status: "owed", method: null, paidAt: null, confirmedAt: null, createdAt: now,
  consultantId: "c1", consultant: { name: "Consultant" }, project: null,
  settledByBillId: null, invoiceWaivedReason: null, ...over,
});

const entries = toLedgerEntries({
  invoices: [],
  expenses: [],
  bills: [
    bill({ id: "B1", total: 1000, status: "paid", paidAt: now }), // settles C1 → dropped from cash-out
    bill({ id: "B2", total: 500, status: "paid", paidAt: now }), // standalone paid bill
  ],
  payouts: [
    payout({ id: "P1", amount: 800, status: "paid", paidAt: now, invoiceWaivedReason: "no invoice required" }),
  ],
  commissions: [
    commission({ id: "C1", amount: 1000, status: "paid", paidAt: now, settledByBillId: "B1" }), // paired w/ B1
    commission({ id: "C2", amount: 300, status: "owed" }), // committed
    commission({ id: "C3", amount: 200, status: "paid", paidAt: now, partnerId: null, partnerName: null, externalName: "Acme Referrals" }), // external, no waiver
  ],
});

const t = ledgerTotals(entries);

eq("payoutsPaid", t.payoutsPaid, 800);
eq("commissionPaid", t.commissionPaid, 1000 + 200);
eq("commissionOwed", t.commissionOwed, 300);
eq("billsExpensesPaid (B1 dropped, only B2)", t.billsExpensesPaid, 500);
// GATE #1 — the deduped money-out figure is exactly the sum of the three buckets.
eq("cashOut == payoutsPaid + billsExpensesPaid + commissionPaid", t.cashOut, t.payoutsPaid + t.billsExpensesPaid + t.commissionPaid);
eq("cashOut value", t.cashOut, 800 + 500 + 1200);
eq("committedOut == payoutsOwed + commissionOwed + billsExpensesOutstanding", t.committedOut, t.payoutsOwed + t.commissionOwed + t.billsExpensesOutstanding);
// B1 paid bill carries a doc and is the doc-side of C1 → not missing. P1 waived.
// Only C3 (external, paid, no bill, no waiver) flags missing-doc.
eq("missingDocCount (external commission, no waiver)", t.missingDocCount, 1);

// The C1↔B1 pair: the commission carries the cash, the bill is dropped + inherits nothing extra.
const c1 = entries.find((e) => e.id === "commission-C1")!;
const b1 = entries.find((e) => e.id === "bill-B1")!;
eq("C1 counts as cash-out", c1.countsAsCashOut ? 1 : 0, 1);
eq("B1 dropped from cash-out", b1.countsAsCashOut ? 1 : 0, 0);
eq("C1 inherits B1's document", c1.hasDocument ? 1 : 0, 1);

console.log(failures === 0 ? "\nAll commission-ledger checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
