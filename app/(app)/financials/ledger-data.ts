// Server-side fetch wave for the Financials "Ledger" (GL) tab. The ONE place the
// DB is read for the general ledger: invoices (AR) + bills + expenses + consultant
// payouts, normalized through the pure lib/finance-ledger spine. Shared by the
// page render AND the CSV export so both show the exact same set.
//
// PHASE 1: selects EXISTING columns only (no settledByBillId / invoiceWaivedReason
// — those land with the Phase 2 migration). The page-level try/catch catches
// table-missing (P2021 / 42P01); we mirror that here so a pre-migration deploy
// degrades to null (Ledger tab hidden) instead of 500ing.

import { prisma } from "@/lib/prisma";
import { toLedgerEntries, type LedgerEntry } from "@/lib/finance-ledger";

export async function loadLedgerEntries(): Promise<LedgerEntry[] | null> {
  try {
    const [invoices, bills, expenses, payouts] = await Promise.all([
      prisma.invoice.findMany({
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          number: true,
          amount: true,
          total: true,
          issuedAt: true,
          paidAt: true,
          status: true,
          client: { select: { id: true, company: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.bill.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          vendor: true,
          number: true,
          amount: true,
          total: true,
          origAmount: true,
          origCurrency: true,
          issuedAt: true,
          createdAt: true,
          paidAt: true,
          status: true,
          category: true,
          description: true,
          driveUrl: true,
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.expense.findMany({
        orderBy: { spentAt: "desc" },
        select: {
          id: true,
          vendor: true,
          description: true,
          category: true,
          kind: true,
          amount: true,
          total: true,
          origAmount: true,
          origCurrency: true,
          spentAt: true,
          reimbursedAt: true,
          status: true,
          needsPhoto: true,
          driveUrl: true,
          paidById: true,
          paidByConsultantId: true,
          paidBy: { select: { name: true } },
          paidByConsultant: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.consultantPayout.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          status: true,
          method: true,
          paidAt: true,
          confirmedAt: true,
          createdAt: true,
          consultantId: true,
          consultant: { select: { name: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return toLedgerEntries({ invoices, bills, expenses, payouts });
  } catch (e) {
    // Pre-migration ONLY: a money table doesn't exist yet (Prisma P2021 /
    // Postgres 42P01) → hide the Ledger tab. Any other error is real.
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "42P01") return null;
    throw e;
  }
}
