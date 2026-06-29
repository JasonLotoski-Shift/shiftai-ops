import Link from "next/link";
import { Users, Wallet } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";
import { economicsTotals, allocateLaborRevenue, buyoutAllocation } from "@/lib/billing/economics";
import { weightDeal, weightedPipelineTotal, mrrTotal, bucketCashIn, FORECAST_MONTHS } from "@/lib/billing/forecast";
import { firmCommissionTotals } from "@/lib/billing/commissions";
import { currentIsManagingPartner } from "@/lib/permissions";
import { ForecastSummary } from "@/components/billing/forecast-summary";
import { CommissionSummary, type CommissionFlowRow } from "@/components/billing/commission-summary";
import { FinancialsTabs, type ApArProps } from "@/components/billing/financials-tabs";
import { loadLedgerEntries } from "@/app/(app)/financials/ledger-data";

// Firm Financials — the firm-wide revenue rollup (Phase 3). Aggregates every
// project's economics into contracted / invoiced / received / AR plus the
// internal 10/15/75 capture (firm reserve + origination), and breaks revenue
// down per project. The raw invoice register lives at /invoices (linked below).

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export default async function FinancialsPage() {
  // Every firm-financials read is mutually independent — fetch them in ONE
  // parallel wave instead of awaiting each in series (was ~5 sequential round
  // trips to us-west-2 before the rollup could compute).
  const [
    projects,
    openDeals,
    subProjects,
    plannedInstallments,
    openInvoices,
    activeContracts,
    managingPartner,
  ] = await Promise.all([
    prisma.project.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        budgetFee: true,
        status: true,
        projectType: true,
        originationPct: true,
        isFirstContract: true,
        client: { select: { company: true } },
        economicsLines: { select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true } },
        directCosts: { select: { amount: true } },
        invoices: { select: { amount: true, status: true } },
      },
    }),
    prisma.deal.findMany({
      where: { stage: { not: "signed" }, lostAt: null },
      orderBy: { closeTargetDate: "asc" },
      select: {
        company: true,
        valueEstimate: true,
        probability: true,
        estimates: { where: { status: "accepted" }, orderBy: { version: "desc" }, take: 1, select: { totalValue: true } },
      },
    }),
    prisma.project.findMany({
      where: { projectType: "subscription", status: { not: "closed" } },
      select: { projectType: true, budgetFee: true, scheduleType: true, startDate: true, targetEndDate: true, serviceContract: { select: { monthlyFee: true } } },
    }),
    prisma.billingInstallment.findMany({ where: { status: "planned" }, select: { amount: true, dueDate: true, status: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["sent", "overdue"] } }, select: { amount: true, dueAt: true, status: true } }),
    prisma.serviceContract.findMany({ where: { status: { in: ["active", "pending_start"] } }, select: { monthlyFee: true, startDate: true, termMonths: true, status: true } }),
    currentIsManagingPartner(),
  ]);

  const rows = projects.map((p) => {
    const totals = economicsTotals(
      p.economicsLines.map((l) => ({
        hours: Number(l.hours),
        payRateCents: l.payRateCents,
        billRateCents: l.billRateCents,
        isExtra: l.isExtra,
      })),
    );
    const directCosts = p.directCosts.reduce((s, c) => s + c.amount, 0);
    // Buy-outs are exempt from the 10/15/75 labour split — the whole value is
    // firm capture (no labour, no origination). Everything else splits normally.
    const isBuyout = p.projectType === "buyout";
    const alloc = isBuyout
      ? buyoutAllocation(p.budgetFee)
      : allocateLaborRevenue({
          laborBillable: totals.billableTotal,
          takeHome: totals.costTotal,
          directCosts,
          originationPct: Number(p.originationPct) / 100,
          isFirstContract: p.isFirstContract,
        });
    const invoiced = p.invoices.filter((i) => i.status !== "draft").reduce((s, i) => s + i.amount, 0);
    const received = p.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    return {
      id: p.id,
      name: p.name.split("·")[1]?.trim() ?? p.name,
      company: p.client.company,
      value: p.budgetFee,
      closed: p.status === "closed",
      invoiced,
      received,
      takeHome: alloc.takeHome,
      firmReserve: alloc.firmReserve,
      origination: alloc.origination,
      // Buy-out is 100% margin (no labour cost) — but a $0 buy-out is 0%, not 100%.
      marginPct: isBuyout ? (p.budgetFee > 0 ? 1 : 0) : totals.marginPct,
    };
  });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const contracted = sum((r) => r.value);
  const invoicedTotal = sum((r) => r.invoiced);
  const receivedTotal = sum((r) => r.received);
  const outstandingAR = invoicedTotal - receivedTotal;
  const firmReserveTotal = sum((r) => r.firmReserve);
  const originationTotal = sum((r) => r.origination);

  // ── Forecast (open to all partners — same sensitivity as the rollup above) ──
  const pipelineDeals = openDeals.map((d) => {
    const acceptedEstimateTotal = d.estimates[0]?.totalValue ?? null;
    const value = acceptedEstimateTotal && acceptedEstimateTotal > 0 ? acceptedEstimateTotal : d.valueEstimate;
    const { weighted } = weightDeal({ valueEstimate: d.valueEstimate, probability: d.probability, acceptedEstimateTotal });
    return { company: d.company, value, weighted, probability: d.probability };
  });
  const { total: weightedPipeline, unweightedCount } = weightedPipelineTotal(
    openDeals.map((d) => ({ valueEstimate: d.valueEstimate, probability: d.probability, acceptedEstimateTotal: d.estimates[0]?.totalValue ?? null })),
  );

  const mrr = mrrTotal(subProjects.map((p) => ({ ...p, serviceContractMonthlyFee: p.serviceContract?.monthlyFee ?? null })));
  const arr = mrr * 12;

  const cashCalendar = bucketCashIn(
    { installments: plannedInstallments, invoices: openInvoices, ongoing: activeContracts },
    new Date(),
    FORECAST_MONTHS,
  );

  // ── Commission flow-through (firm money — managing partners only) ──
  let commissionTotals: ReturnType<typeof firmCommissionTotals> | null = null;
  let commissionRows: CommissionFlowRow[] = [];
  if (managingPartner) {
    const [buildRows, accrualRows] = await Promise.all([
      prisma.projectSourceCommission.findMany({
        include: {
          partner: { select: { name: true } },
          project: { select: { name: true } },
          ongoing: { select: { coveredMonths: true, projectedAmount: true } },
        },
      }),
      prisma.ongoingContractCommissionAccrual.findMany({
        select: { amount: true, status: true, periodStart: true, commission: { select: { partnerId: true, externalName: true } } },
      }),
    ]);
    commissionTotals = firmCommissionTotals(
      buildRows.map((r) => ({ buildAmount: r.buildAmount, partnerId: r.partnerId, externalName: r.externalName })),
      accrualRows.map((a) => ({ amount: a.amount, status: a.status, periodStart: a.periodStart, partnerId: a.commission.partnerId, externalName: a.commission.externalName })),
    );
    commissionRows = buildRows.map((r) => ({
      label: r.project.name.split("·")[0].trim(),
      recipient: r.partner?.name ?? r.externalName ?? "—",
      isExternal: !r.partnerId,
      buildAmount: r.buildAmount,
      recurringPerMonth: r.ongoing && r.ongoing.coveredMonths > 0 ? Math.round(r.ongoing.projectedAmount / r.ongoing.coveredMonths) : 0,
      coveredMonths: r.ongoing?.coveredMonths ?? 0,
    }));
  }

  // ── AP/AR + Expenses (managing partners only — the whole section is gated) ──
  // Money OUT (Bill, Expense) joins outstanding Money IN (Invoice) in one tab.
  // Wrapped in try/catch: if the Bill/Expense migration hasn't run yet, degrade
  // to Overview-only so a pre-migration deploy doesn't 500 the whole page.
  let apAr: ApArProps | null = null;
  if (managingPartner) {
   try {
    const [arInvoices, bills, expenses, partners, clientList, projectList] = await Promise.all([
      prisma.invoice.findMany({
        where: { status: { in: ["sent", "overdue"] } },
        orderBy: { dueAt: "asc" },
        select: { id: true, number: true, amount: true, total: true, dueAt: true, status: true, client: { select: { company: true } } },
      }),
      prisma.bill.findMany({
        where: { status: { not: "void" } },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        select: { id: true, vendor: true, number: true, amount: true, total: true, origAmount: true, origCurrency: true, dueAt: true, paidAt: true, status: true, category: true, driveUrl: true, settledPayouts: { select: { id: true }, take: 1 } },
      }),
      prisma.expense.findMany({
        orderBy: { spentAt: "desc" },
        take: 100,
        select: { id: true, vendor: true, description: true, category: true, kind: true, amount: true, total: true, origAmount: true, origCurrency: true, status: true, spentAt: true, needsPhoto: true, driveUrl: true, recurring: true, renewalDate: true, paidBy: { select: { name: true } }, paidByConsultant: { select: { name: true } } },
      }),
      prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.client.findMany({ orderBy: { company: "asc" }, select: { id: true, company: true } }),
      prisma.project.findMany({ where: { status: { not: "closed" } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    ]);

    apAr = {
      invoices: arInvoices.map((i) => ({
        id: i.id,
        number: i.number,
        company: i.client.company,
        amount: i.total || i.amount,
        dueAt: i.dueAt.toISOString(),
        status: i.status,
      })),
      bills: bills.map((b) => ({
        id: b.id,
        vendor: b.vendor,
        number: b.number,
        amount: b.total || b.amount,
        origCurrency: b.origCurrency,
        origAmount: b.origAmount,
        dueAt: b.dueAt ? b.dueAt.toISOString() : null,
        paidAt: b.paidAt ? b.paidAt.toISOString() : null,
        status: b.status,
        category: b.category,
        hasDoc: !!b.driveUrl,
        driveUrl: b.driveUrl,
        // A bill settled by a contractor payout is the payout's paperwork, paid via
        // the payout flow — exclude it from vendor Payable so it isn't double-counted
        // against the Ledger's deduped money-out (it's tracked there via its payout).
        linked: b.settledPayouts.length > 0,
      })),
      expenses: expenses.map((e) => ({
        id: e.id,
        vendor: e.vendor,
        description: e.description,
        category: e.category,
        kind: e.kind,
        amount: e.total || e.amount,
        origCurrency: e.origCurrency,
        origAmount: e.origAmount,
        status: e.status,
        spentAt: e.spentAt.toISOString(),
        needsPhoto: e.needsPhoto,
        driveUrl: e.driveUrl,
        paidByName: e.paidBy?.name ?? e.paidByConsultant?.name ?? null,
        recurring: e.recurring,
        renewalDate: e.renewalDate ? e.renewalDate.toISOString() : null,
      })),
      partners,
      clients: clientList,
      projects: projectList.map((p) => ({ id: p.id, name: p.name.split("·")[1]?.trim() ?? p.name })),
    };
   } catch (e) {
     // Pre-migration ONLY: the Bill/Expense tables don't exist yet (Prisma P2021
     // / Postgres 42P01) — degrade to Overview-only so the deploy doesn't 500.
     // Any OTHER error is real and must surface, not silently hide the AP/AR tab.
     const code = (e as { code?: string })?.code;
     if (code === "P2021" || code === "42P01") apAr = null;
     else throw e;
   }
  }

  // ── General ledger (managing partners only — same gate as AP/AR) ──
  // The GL pulls every money movement (invoices in + bills/expenses/payouts out)
  // through one normalizer. loadLedgerEntries degrades to null pre-migration so a
  // missing money table never 500s the page.
  const ledger = managingPartner ? await loadLedgerEntries() : null;

  return (
    <>
      <Header
        eyebrow="Finance · firm revenue"
        title="Financials."
        actions={
          <>
            <Link
              href="/consultants"
              className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
            >
              <Users size={13} strokeWidth={1.5} />
              Consultant roster
            </Link>
            {managingPartner && (
              <Link
                href="/financials/partners"
                className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
              >
                <Wallet size={13} strokeWidth={1.5} />
                Partner economics
              </Link>
            )}
          </>
        }
      />

      <FinancialsTabs canSeeApAr={apAr !== null} apAr={apAr} ledger={ledger}>
      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5"><Stat label="Contracted" value={cad(contracted)} delta={`${rows.length} projects`} /></Card>
          <Card className="p-5"><Stat label="Invoiced" value={cad(invoicedTotal)} delta="raised to date" /></Card>
          <Card className="p-5"><Stat label="Received" value={cad(receivedTotal)} delta="cash in" gold /></Card>
          <Card className="p-5"><Stat label="Outstanding AR" value={cad(outstandingAR)} delta="invoiced, not paid" /></Card>
          <Card className="p-5"><Stat label="Firm reserve" value={cad(firmReserveTotal)} delta="pool + surplus (internal)" /></Card>
          <Card className="p-5"><Stat label="Origination" value={cad(originationTotal)} delta="first-contract commission" /></Card>
        </div>

        <Card>
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h2 className="title-md">Revenue by project</h2>
            <span className="label">{rows.length} total</span>
          </div>
          <div className="grid grid-cols-[1.5fr_100px_100px_100px_100px_100px_70px] gap-3 px-5 py-2">
            <span className="text-[11px] text-bone-dim">Project</span>
            <span className="text-[11px] text-bone-dim text-right">Value</span>
            <span className="text-[11px] text-bone-dim text-right">Invoiced</span>
            <span className="text-[11px] text-bone-dim text-right">Received</span>
            <span className="text-[11px] text-bone-dim text-right">Take-home</span>
            <span className="text-[11px] text-bone-dim text-right">Firm reserve</span>
            <span className="text-[11px] text-bone-dim text-right">Margin</span>
          </div>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/projects/${r.id}?tab=financials`}
              className="grid grid-cols-[1.5fr_100px_100px_100px_100px_100px_70px] gap-3 px-5 py-3.5 border-t border-graphite/40 hover:bg-[var(--color-row-hover)] transition-colors"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[14px] text-bone truncate">{r.name}{r.closed && <span className="text-bone-mute"> · closed</span>}</span>
                <span className="text-[11px] text-bone-mute truncate">{r.company}</span>
              </div>
              <span className="mono text-[13px] text-bone tabular-nums text-right self-center">{cad(r.value)}</span>
              <span className="mono text-[13px] text-bone-dim tabular-nums text-right self-center">{cad(r.invoiced)}</span>
              <span className={`mono text-[13px] tabular-nums text-right self-center ${r.received > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>{cad(r.received)}</span>
              <span className="mono text-[13px] text-bone-dim tabular-nums text-right self-center">{cad(r.takeHome)}</span>
              <span className="mono text-[13px] text-track-gold tabular-nums text-right self-center">{cad(r.firmReserve)}</span>
              <span className="mono text-[12px] text-bone-dim tabular-nums text-right self-center">{Math.round(r.marginPct * 100)}%</span>
            </Link>
          ))}
        </Card>

        <ForecastSummary
          weightedPipeline={weightedPipeline}
          unweightedCount={unweightedCount}
          mrr={mrr}
          arr={arr}
          pipelineDeals={pipelineDeals}
          cashCalendar={cashCalendar}
        />

        {managingPartner && commissionTotals && (
          <CommissionSummary
            buildTotal={commissionTotals.buildTotal}
            recurringProjected={commissionTotals.recurringProjected}
            recurringAccrued={commissionTotals.recurringAccrued}
            recurringPaid={commissionTotals.recurringPaid}
            partnerShare={commissionTotals.partnerShare}
            externalShare={commissionTotals.externalShare}
            rows={commissionRows}
          />
        )}
      </div>
      </FinancialsTabs>
    </>
  );
}
