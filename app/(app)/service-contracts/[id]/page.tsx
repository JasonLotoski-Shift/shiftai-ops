import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Hairline } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";
import { currentIsManagingPartner } from "@/lib/permissions";
import { effectiveAccrualStatus } from "@/lib/billing/commission";
import { MarkAccrualPaidButton } from "@/components/mark-accrual-paid-button";
import { ArrowLeft, Repeat } from "lucide-react";

function baseLabel(b: string): string {
  return b === "total_12mo" ? "12-month total" : b === "total_6mo" ? "6-month total" : "deal value";
}

export default async function ServiceContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const managingPartner = await currentIsManagingPartner();
  if (!managingPartner) {
    return (
      <>
        <Header eyebrow="Recurring revenue" title="Service Contract." />
        <div className="px-8 py-8">
          <Card>
            <CardBody>
              <p className="text-[13px] text-bone-mute">
                Service-contract economics are visible to managing partners only.
              </p>
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  const contract = await prisma.serviceContract.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, company: true } },
      partnerLead: { select: { name: true } },
      project: { select: { id: true, name: true } },
      commissions: {
        include: {
          partner: { select: { id: true, name: true } },
          projectCommission: { select: { buildAmount: true } },
          accruals: { orderBy: { periodIndex: "asc" } },
        },
      },
    },
  });
  if (!contract) notFound();

  const tone: "gold" | "steel" | "neutral" =
    contract.status === "active" ? "gold" : contract.status === "pending_start" ? "steel" : "neutral";

  return (
    <>
      <Header
        eyebrow={contract.client.company}
        title={contract.name}
        actions={<Badge tone={tone}>{contract.status.replace("_", "-")}</Badge>}
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <Link href="/service-contracts" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          All service contracts
        </Link>

        <div className="grid grid-cols-4 gap-6">
          <Card className="p-5">
            <div className="flex flex-col gap-2">
              <Label>Monthly fee</Label>
              <span className="mono text-[22px] text-track-gold tabular-nums">
                {formatCAD(contract.monthlyFee).replace("CA$", "$")}
              </span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-col gap-2">
              <Label>Term</Label>
              <span className="text-[18px] text-bone">{contract.termMonths} months</span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-col gap-2">
              <Label>{contract.status === "pending_start" ? "Starts" : "Started"}</Label>
              <span className="mono text-[14px] text-bone tabular-nums">{formatDate(contract.startDate)}</span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex flex-col gap-2">
              <Label>Build project</Label>
              <Link href={`/projects/${contract.project.id}`} className="label-gold hover:underline text-[13px]">
                {contract.project.name.split("·")[0].trim()} →
              </Link>
            </div>
          </Card>
        </div>

        {contract.commissions.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[13px] text-bone-mute">No commission tracked on this contract.</p>
            </CardBody>
          </Card>
        ) : (
          contract.commissions.map((cm) => {
            const payee = cm.partner?.name ?? cm.externalName ?? "—";
            return (
              <Card key={cm.id}>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="title-md">{payee}</span>
                    <span className="text-[11px] text-bone-mute">
                      {Number(cm.pct)}% of {baseLabel(cm.base)} · {cm.coveredMonths} months
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    {cm.projectCommission && (
                      <div className="flex flex-col items-end">
                        <Label>Build (payable now)</Label>
                        <span className="mono text-[13px] text-bone tabular-nums">
                          {formatCAD(cm.projectCommission.buildAmount).replace("CA$", "$")}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-end">
                      <Label>Projected recurring</Label>
                      <span className="mono text-[13px] text-track-gold tabular-nums">
                        {formatCAD(cm.projectedAmount).replace("CA$", "$")}
                      </span>
                    </div>
                  </div>
                </div>
                <Hairline />
                <div className="flex flex-col">
                  <div className="grid grid-cols-[70px_1fr_130px_130px] gap-4 px-5 py-2">
                    <span className="text-[11px] text-bone-dim">Month</span>
                    <span className="text-[11px] text-bone-dim">Starts</span>
                    <span className="text-[11px] text-bone-dim text-right">Amount</span>
                    <span className="text-[11px] text-bone-dim text-right">Status</span>
                  </div>
                  {cm.accruals.map((a) => {
                    const eff = effectiveAccrualStatus(a.status, a.periodStart);
                    const effTone: "gold" | "steel" | "neutral" =
                      eff === "paid" ? "steel" : eff === "accrued" ? "gold" : "neutral";
                    return (
                      <div
                        key={a.id}
                        className="grid grid-cols-[70px_1fr_130px_130px] gap-4 px-5 py-2.5 items-center hover:bg-[var(--color-row-hover)]"
                      >
                        <span className="mono text-[12px] text-bone-mute tabular-nums">M{a.periodIndex + 1}</span>
                        <span className="mono text-[12px] text-bone-dim tabular-nums">
                          {formatDate(a.periodStart).split(",")[0]}
                        </span>
                        <span className="mono text-[13px] text-bone tabular-nums text-right">
                          {formatCAD(a.amount).replace("CA$", "$")}
                        </span>
                        <div className="flex justify-end items-center gap-2">
                          <Badge tone={effTone}>{eff}</Badge>
                          {eff === "accrued" && <MarkAccrualPaidButton accrualId={a.id} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
