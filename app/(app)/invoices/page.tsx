import Link from "next/link";
import { Receipt, Users } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, Stat, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate, daysSince } from "@/lib/format";

export default async function InvoicesPage() {
  const [invoices, projects] = await Promise.all([
    prisma.invoice.findMany({
      // Only the columns the register renders; client narrowed to company.
      select: {
        id: true,
        number: true,
        amount: true,
        issuedAt: true,
        dueAt: true,
        status: true,
        client: { select: { company: true } },
      },
      orderBy: { issuedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { status: { not: "closed" } },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        budgetFee: true,
        client: { select: { company: true } },
        invoices: { select: { amount: true, status: true } },
        payouts: { select: { amount: true, status: true } },
      },
    }),
  ]);

  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const paid = invoices.filter((i) => i.status === "paid");

  const outstandingTotal = outstanding.reduce((s, i) => s + i.amount, 0);
  const overdueTotal = overdue.reduce((s, i) => s + i.amount, 0);
  const paidTotal = paid.reduce((s, i) => s + i.amount, 0);

  // Per-project two-ledger summary: money in (client) vs money out (team).
  const projectRows = projects.map((p) => {
    const invoiced = p.invoices.filter((i) => i.status !== "draft").reduce((s, i) => s + i.amount, 0);
    const received = p.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    const owed = p.payouts.filter((o) => o.status === "owed").reduce((s, o) => s + o.amount, 0);
    const paidOut = p.payouts.filter((o) => o.status !== "owed").reduce((s, o) => s + o.amount, 0);
    return {
      id: p.id,
      name: p.name.split("·")[1]?.trim() ?? p.name,
      company: p.client.company,
      value: p.budgetFee,
      invoiced,
      received,
      owed,
      paidOut,
    };
  });
  const cad = (n: number) => formatCAD(n).replace("CA$", "$");

  return (
    <>
      <Header
        eyebrow="Finance · billing"
        title="Billing."
        actions={
          <Link
            href="/consultants"
            className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
          >
            <Users size={13} strokeWidth={1.5} />
            Consultant roster
          </Link>
        }
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-5">
            <Stat
              label="Outstanding"
              value={formatCAD(outstandingTotal).replace("CA$", "$")}
              delta={`${outstanding.length} invoices`}
            />
          </Card>
          <Card className="p-5">
            <Stat
              label="Overdue"
              value={formatCAD(overdueTotal).replace("CA$", "$")}
              delta={`${overdue.length} invoices`}
            />
          </Card>
          <Card className="p-5">
            <Stat
              label="Collected · this year"
              value={formatCAD(paidTotal).replace("CA$", "$")}
              delta={`${paid.length} invoices paid`}
              gold
            />
          </Card>
          <Card className="p-5">
            <Stat
              label="Avg DSO"
              value={invoices.length === 0 ? 0 : "22d"}
              delta={invoices.length === 0 ? "No invoices yet" : "vs. NET 30 terms"}
            />
          </Card>
        </div>

        {projectRows.length > 0 && (
          <Card>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h2 className="title-md">By project — money in vs. out</h2>
              <span className="label">{projectRows.length} active</span>
            </div>
            <div className="grid grid-cols-[1.5fr_110px_110px_110px_110px_110px] gap-4 px-5 py-2">
              <span className="text-[11px] text-bone-dim">Project</span>
              <span className="text-[11px] text-bone-dim text-right">Value</span>
              <span className="text-[11px] text-bone-dim text-right">Invoiced</span>
              <span className="text-[11px] text-bone-dim text-right">Received</span>
              <span className="text-[11px] text-bone-dim text-right">Owed team</span>
              <span className="text-[11px] text-bone-dim text-right">Paid out</span>
            </div>
            {projectRows.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="grid grid-cols-[1.5fr_110px_110px_110px_110px_110px] gap-4 px-5 py-3.5 border-t border-graphite/40 hover:bg-[var(--color-row-hover)] transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14px] text-bone truncate">{p.name}</span>
                  <span className="text-[11px] text-bone-mute truncate">{p.company}</span>
                </div>
                <span className="mono text-[13px] text-bone tabular-nums text-right self-center">{cad(p.value)}</span>
                <span className="mono text-[13px] text-bone-dim tabular-nums text-right self-center">{cad(p.invoiced)}</span>
                <span className={`mono text-[13px] tabular-nums text-right self-center ${p.received > 0 ? "text-signal-fresh" : "text-bone-mute"}`}>{cad(p.received)}</span>
                <span className={`mono text-[13px] tabular-nums text-right self-center ${p.owed > 0 ? "text-signal-warming" : "text-bone-mute"}`}>{cad(p.owed)}</span>
                <span className="mono text-[13px] text-bone-dim tabular-nums text-right self-center">{cad(p.paidOut)}</span>
              </Link>
            ))}
          </Card>
        )}

        <Card>
          {invoices.length === 0 ? (
            <EmptyState
              icon={<Receipt size={28} strokeWidth={1.5} />}
              title="No invoices yet"
              hint="Invoices you issue to clients will show up here once you raise the first one."
            />
          ) : (
            <>
              <div className="grid grid-cols-[140px_1.5fr_1fr_140px_140px_100px] gap-4 px-5 py-3">
                <span className="text-[11px] text-bone-dim">Number</span>
                <span className="text-[11px] text-bone-dim">Client</span>
                <span className="text-[11px] text-bone-dim">Amount</span>
                <span className="text-[11px] text-bone-dim">Issued</span>
                <span className="text-[11px] text-bone-dim">Due</span>
                <span className="text-[11px] text-bone-dim text-right">Status</span>
              </div>

              {invoices.map((inv) => {
                const overdueDays = inv.status === "overdue" ? daysSince(inv.dueAt) : 0;
                return (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="grid grid-cols-[140px_1.5fr_1fr_140px_140px_100px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
                    <span className="mono text-[13px] text-bone self-center">{inv.number}</span>
                    <span className="text-[13px] text-bone-dim self-center truncate">{inv.client.company}</span>
                    <span className="mono text-[14px] text-track-gold tabular-nums self-center">
                      {formatCAD(inv.amount).replace("CA$", "$")}
                    </span>
                    <span className="mono text-[12px] text-bone-dim tabular-nums self-center">
                      {formatDate(inv.issuedAt)}
                    </span>
                    <span className={`mono text-[12px] tabular-nums self-center ${overdueDays > 0 ? "text-flag-red" : "text-bone-dim"}`}>
                      {formatDate(inv.dueAt)}
                      {overdueDays > 0 && ` (${overdueDays}d)`}
                    </span>
                    <div className="self-center flex justify-end">
                      <Badge tone={inv.status === "paid" ? "steel" : inv.status === "overdue" ? "red" : inv.status === "sent" ? "gold" : "neutral"}>
                        {inv.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
