import Link from "next/link";
import { Receipt } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, Stat, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate, daysSince } from "@/lib/format";

export default async function InvoicesPage() {
  const invoices = await prisma.invoice.findMany({
    include: { client: true },
    orderBy: { issuedAt: "desc" },
  });

  const outstanding = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue = invoices.filter((i) => i.status === "overdue");
  const paid = invoices.filter((i) => i.status === "paid");

  const outstandingTotal = outstanding.reduce((s, i) => s + i.amount, 0);
  const overdueTotal = overdue.reduce((s, i) => s + i.amount, 0);
  const paidTotal = paid.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <Header eyebrow="Finance · AR" title="Invoices." />

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
