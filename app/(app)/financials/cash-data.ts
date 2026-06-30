// Server-side fetch + compose for the Phase 2 cash strip and Money-home cashflow
// lens. Reads the firm-entered opening balance + every committed obligation (AR in,
// AP/payout/reimbursement/subscription/recurring-commission out) and the deduped
// ledger actuals, then runs the pure cashflow engine. Phase 2 reads OLD data: the
// recurring-commission outflow comes from the existing OngoingContractCommissionAccrual
// rows (not the new CommissionPayout table, which Phase 3 backfills).
//
// Degrades to null on a missing table/column (P2021/P2022) so a deploy that lands
// before a migration never 500s the page — any other error surfaces.

import { prisma } from "@/lib/prisma";
import { loadLedgerEntries } from "./ledger-data";
import { computeCashflow, type CashflowResult, type CashflowSourceRows } from "@/lib/billing/cashflow";
import { deriveCashOnHand } from "@/lib/financials/cash-position";

const STALE_DAYS = 45;

export type OpeningMeta = {
  id: string;
  amount: number;
  asOf: string; // ISO
  label: string | null;
  enteredBy: string;
  stale: boolean; // anchor older than STALE_DAYS
};

export type CashData = {
  opening: OpeningMeta | null;
  cashOnHand: number | null; // null until an opening balance is entered
  cashflow: CashflowResult; // always present (seeded at cashOnHand ?? 0)
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function loadCashData(now: Date = new Date()): Promise<CashData | null> {
  try {
    const [opening, ledger, installments, invoices, contracts, bills, owedPayouts, reimbursements, subscriptions, commissions] =
      await Promise.all([
        prisma.openingBalance.findFirst({ where: { active: true }, orderBy: { asOf: "desc" } }),
        loadLedgerEntries(),
        prisma.billingInstallment.findMany({
          where: { status: "planned" },
          select: { id: true, label: true, amount: true, dueDate: true, status: true },
        }),
        prisma.invoice.findMany({
          where: { status: { in: ["sent", "overdue"] } },
          select: { id: true, number: true, amount: true, total: true, dueAt: true, status: true, client: { select: { company: true } } },
        }),
        prisma.serviceContract.findMany({
          where: { status: { in: ["active", "pending_start"] } },
          select: { id: true, name: true, monthlyFee: true, startDate: true, termMonths: true, status: true, client: { select: { company: true } } },
        }),
        prisma.bill.findMany({
          where: { status: { in: ["received", "approved"] } },
          select: { id: true, vendor: true, number: true, amount: true, total: true, dueAt: true, status: true },
        }),
        prisma.consultantPayout.findMany({
          where: { status: "owed" },
          select: { id: true, amount: true, consultant: { select: { name: true } }, installment: { select: { dueDate: true } } },
        }),
        prisma.expense.findMany({
          where: { kind: "reimbursable", status: { in: ["submitted", "approved"] }, reimbursedAt: null },
          select: { id: true, amount: true, total: true, paidBy: { select: { name: true } }, paidByConsultant: { select: { name: true } } },
        }),
        prisma.expense.findMany({
          where: { kind: "subscription", renewalDate: { gte: startOfDay(now) } },
          select: { id: true, vendor: true, amount: true, total: true, renewalDate: true },
        }),
        prisma.commissionPayout.findMany({
          where: { stream: "recurring", status: "owed" },
          select: { id: true, amount: true, periodStart: true, commissionLine: { select: { partner: { select: { name: true } }, externalName: true } } },
        }),
      ]);

    const rows: CashflowSourceRows = {
      installments: installments.map((i) => ({ id: i.id, label: i.label, amount: i.amount, dueDate: i.dueDate, status: i.status })),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        amount: i.total || i.amount,
        dueAt: i.dueAt,
        status: i.status,
        company: i.client?.company ?? null,
      })),
      contracts: contracts.map((c) => ({
        id: c.id,
        label: `${c.client?.company ?? c.name} retainer`,
        monthlyFee: c.monthlyFee,
        startDate: c.startDate,
        termMonths: c.termMonths,
        status: c.status,
      })),
      bills: bills.map((b) => ({ id: b.id, vendor: b.vendor, number: b.number, amount: b.total || b.amount, dueAt: b.dueAt, status: b.status })),
      owedPayouts: owedPayouts.map((p) => ({ id: p.id, party: p.consultant.name, amount: p.amount, dueDate: p.installment.dueDate })),
      reimbursements: reimbursements.map((e) => ({
        id: e.id,
        party: e.paidBy?.name ?? e.paidByConsultant?.name ?? "Team member",
        amount: e.total || e.amount,
      })),
      subscriptions: subscriptions.map((e) => ({ id: e.id, vendor: e.vendor ?? "Subscription", amount: e.total || e.amount, renewalDate: e.renewalDate })),
      commissions: commissions.map((c) => ({
        id: c.id,
        party: c.commissionLine.partner?.name ?? c.commissionLine.externalName ?? "Referrer",
        amount: c.amount,
        periodStart: c.periodStart ?? now,
      })),
    };

    const cashOnHand = opening ? deriveCashOnHand(opening.amount, opening.asOf, ledger ?? []) : null;
    const cashflow = computeCashflow(rows, now, cashOnHand ?? 0);

    const openingMeta: OpeningMeta | null = opening
      ? {
          id: opening.id,
          amount: opening.amount,
          asOf: opening.asOf.toISOString(),
          label: opening.label,
          enteredBy: opening.enteredBy,
          stale: now.getTime() - opening.asOf.getTime() > STALE_DAYS * 86_400_000,
        }
      : null;

    return { opening: openingMeta, cashOnHand, cashflow };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "P2021" || code === "42P01" || code === "P2022" || code === "42703") return null;
    throw e;
  }
}
