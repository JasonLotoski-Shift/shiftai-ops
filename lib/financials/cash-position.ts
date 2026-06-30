// Pure cash-on-hand derivation (no DB). The firm enters a bank-balance anchor
// (OpeningBalance: amount as of a date); cash-on-hand NOW = that anchor plus every
// real cash movement on the deduped ledger AFTER the anchor date. Movements on or
// before the anchor day are assumed already reflected in the entered balance, so
// they are not re-counted. Reuses the ledger spine's dedup (countsAsCashOut) so a
// contractor payout and its linked bill never double-count.

import type { LedgerEntry } from "@/lib/finance-ledger";

function dayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Net actual cash (in − out) that moved strictly AFTER the anchor day. */
export function netActualCashSince(entries: LedgerEntry[], asOf: Date): number {
  const anchor = dayMs(asOf);
  let net = 0;
  for (const e of entries) {
    if (!e.cashMoved) continue; // only money that actually moved
    if (e.status === "void" || e.status === "draft") continue;
    if (e.direction === "out" && !e.countsAsCashOut) continue; // doc-side of a linked pair
    const moved = e.paidDate ?? e.date;
    if (dayMs(new Date(moved)) <= anchor) continue; // already in the entered balance
    net += e.direction === "in" ? e.amountCad : -e.amountCad;
  }
  return net;
}

/** Cash-on-hand now = entered anchor + net actual movement since the anchor day. */
export function deriveCashOnHand(openingAmount: number, asOf: Date, entries: LedgerEntry[]): number {
  return openingAmount + netActualCashSince(entries, asOf);
}
