import Link from "next/link";
import { Repeat } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Stat, Badge, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";
import { currentIsManagingPartner } from "@/lib/permissions";

// The recurring side of the firm's revenue — one row per on-going service
// contract spun up when a subscription deal with a 6/12-month commission base
// converts. Firm money (monthly fee + projected commission): managing partners
// only; everyone else sees a permission state.
export default async function ServiceContractsPage() {
  const managingPartner = await currentIsManagingPartner();
  if (!managingPartner) {
    return (
      <>
        <Header eyebrow="Recurring revenue" title="Service Contracts." />
        <div className="px-8 py-8">
          <EmptyState
            icon={<Repeat size={28} strokeWidth={1.5} />}
            title="Managing partners only"
            hint="Service-contract economics (monthly fees and projected commission) are visible to managing partners."
          />
        </div>
      </>
    );
  }

  const contracts = await prisma.serviceContract.findMany({
    include: {
      client: { select: { company: true } },
      partnerLead: { select: { name: true } },
      project: { select: { id: true, name: true } },
      commissions: { select: { projectedAmount: true } },
    },
    orderBy: { startDate: "asc" },
  });

  const active = contracts.filter((c) => c.status === "active");
  const pending = contracts.filter((c) => c.status === "pending_start");
  const mrr = active.reduce((s, c) => s + c.monthlyFee, 0);

  return (
    <>
      <Header eyebrow="Recurring revenue" title="Service Contracts." />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Stat label="Active MRR" value={formatCAD(mrr).replace("CA$", "$")} gold />
          </Card>
          <Card className="p-5">
            <Stat label="Active" value={active.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Pending start" value={pending.length} />
          </Card>
        </div>

        <Card>
          {contracts.length === 0 ? (
            <EmptyState
              icon={<Repeat size={28} strokeWidth={1.5} />}
              title="No service contracts yet"
              hint="When a subscription deal with a 6 or 12-month commission base converts, its on-going service contract appears here, starting on a future date."
            />
          ) : (
            <>
              <div className="grid grid-cols-[1.4fr_130px_140px_130px_110px] gap-6 px-6 py-3">
                <span className="text-[11px] text-bone-dim">Contract</span>
                <span className="text-[11px] text-bone-dim text-right">Monthly</span>
                <span className="text-[11px] text-bone-dim text-right">Projected commission</span>
                <span className="text-[11px] text-bone-dim">Starts</span>
                <span className="text-[11px] text-bone-dim text-right">Status</span>
              </div>

              {contracts.map((c) => {
                const projected = c.commissions.reduce((s, cm) => s + cm.projectedAmount, 0);
                const tone: "gold" | "steel" | "neutral" =
                  c.status === "active" ? "gold" : c.status === "pending_start" ? "steel" : "neutral";
                return (
                  <Link
                    key={c.id}
                    href={`/service-contracts/${c.id}`}
                    className="grid grid-cols-[1.4fr_130px_140px_130px_110px] gap-6 px-6 py-5 hover:bg-[var(--color-row-hover)] transition-colors items-center"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-[15px] text-bone truncate">{c.name}</span>
                      <span className="text-[11px] text-bone-mute truncate">{c.client.company}</span>
                    </div>
                    <span className="mono text-[13px] text-bone tabular-nums text-right">
                      {formatCAD(c.monthlyFee).replace("CA$", "$")}/mo
                    </span>
                    <span className="mono text-[13px] text-track-gold tabular-nums text-right">
                      {projected ? formatCAD(projected).replace("CA$", "$") : "—"}
                    </span>
                    <span className="mono text-[12px] text-bone-dim tabular-nums">{formatDate(c.startDate).split(",")[0]}</span>
                    <div className="flex justify-end">
                      <Badge tone={tone}>{c.status.replace("_", "-")}</Badge>
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
