import Link from "next/link";
import { Receipt, Users } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";
import { economicsTotals, allocateLaborRevenue } from "@/lib/billing/economics";

// Firm Financials — the firm-wide revenue rollup (Phase 3). Aggregates every
// project's economics into contracted / invoiced / received / AR plus the
// internal 10/15/75 capture (firm reserve + origination), and breaks revenue
// down per project. The raw invoice register lives at /invoices (linked below).

const cad = (n: number) => formatCAD(n).replace("CA$", "$");

export default async function FinancialsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      budgetFee: true,
      status: true,
      originationPct: true,
      isFirstContract: true,
      client: { select: { company: true } },
      economicsLines: { select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true } },
      directCosts: { select: { amount: true } },
      invoices: { select: { amount: true, status: true } },
    },
  });

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
    const alloc = allocateLaborRevenue({
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
      marginPct: totals.marginPct,
    };
  });

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const contracted = sum((r) => r.value);
  const invoicedTotal = sum((r) => r.invoiced);
  const receivedTotal = sum((r) => r.received);
  const outstandingAR = invoicedTotal - receivedTotal;
  const firmReserveTotal = sum((r) => r.firmReserve);
  const originationTotal = sum((r) => r.origination);

  return (
    <>
      <Header
        eyebrow="Finance · firm revenue"
        title="Financials."
        actions={
          <>
            <Link
              href="/invoices"
              className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
            >
              <Receipt size={13} strokeWidth={1.5} />
              Invoice register
            </Link>
            <Link
              href="/consultants"
              className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
            >
              <Users size={13} strokeWidth={1.5} />
              Consultant roster
            </Link>
          </>
        }
      />

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
      </div>
    </>
  );
}
