import Link from "next/link";
import { Header } from "@/components/header";
import { Label, Badge, Card } from "@/components/ui";
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

      <div className="px-8 py-6 border-b border-graphite grid grid-cols-4 gap-3">
        <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 flex flex-col gap-2">
          <Label>— Outstanding</Label>
          <span className="mono text-[26px] text-bone tabular-nums">
            {formatCAD(outstandingTotal).replace("CA$", "$")}
          </span>
          <span className="label text-[10px]">{outstanding.length} invoices</span>
        </div>
        <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 flex flex-col gap-2">
          <Label>— Overdue</Label>
          <span className="mono text-[26px] text-flag-red tabular-nums">
            {formatCAD(overdueTotal).replace("CA$", "$")}
          </span>
          <span className="label text-[10px]">{overdue.length} invoices</span>
        </div>
        <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 flex flex-col gap-2">
          <Label>— Collected · this year</Label>
          <span className="mono text-[26px] text-track-gold tabular-nums">
            {formatCAD(paidTotal).replace("CA$", "$")}
          </span>
          <span className="label text-[10px]">{paid.length} invoices paid</span>
        </div>
        <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 flex flex-col gap-2">
          <Label>— Avg DSO</Label>
          <span className="mono text-[26px] text-bone tabular-nums">22d</span>
          <span className="label text-[10px]">vs. NET 30 terms</span>
        </div>
      </div>

      <div className="px-8 py-8">
        <Card>
          <div className="grid grid-cols-[140px_1.5fr_1fr_140px_140px_100px] gap-4 px-5 py-3 border-b border-graphite">
            <span className="label">Number</span>
            <span className="label">Client</span>
            <span className="label">Amount</span>
            <span className="label">Issued</span>
            <span className="label">Due</span>
            <span className="label text-right">Status</span>
          </div>

          {invoices.map((inv) => {
            const overdueDays = inv.status === "overdue" ? daysSince(inv.dueAt) : 0;
            return (
              <Link
                key={inv.id}
                href={`/invoices/${inv.id}`}
                className="grid grid-cols-[140px_1.5fr_1fr_140px_140px_100px] gap-4 px-5 py-4 hover:bg-graphite/40 transition-colors"
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
        </Card>
      </div>
    </>
  );
}
