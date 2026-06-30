import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Hairline } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";
import { currentIsManagingPartner } from "@/lib/permissions";
import { MarkCommissionPaidButton } from "@/components/mark-commission-paid-button";
import { ArrowLeft } from "lucide-react";

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
    },
  });
  if (!contract) notFound();

  // Recurring commission now lives on the unified CommissionLine: the lines for
  // this contract's build project that carry a recurring %, each with its build
  // (one-time) and recurring (per-month) payout rows.
  const lines = await prisma.commissionLine.findMany({
    where: { projectId: contract.projectId, recurringPct: { not: null } },
    include: {
      partner: { select: { id: true, name: true } },
      payouts: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  const now = new Date();
  // Recurring payout status, mirroring the old effective-accrual flip: a paid row
  // reads "paid"; an owed row whose month has started is "accrued" (payable now);
  // a future month is still "projected".
  function effStatus(p: { status: string; periodStart: Date | null }): "paid" | "accrued" | "projected" {
    if (p.status === "paid" || p.status === "confirmed") return "paid";
    return p.periodStart && p.periodStart <= now ? "accrued" : "projected";
  }

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

        {lines.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[13px] text-bone-mute">No commission tracked on this contract.</p>
            </CardBody>
          </Card>
        ) : (
          lines.map((line) => {
            const payee = line.partner?.name ?? line.externalName ?? "—";
            const buildTotal = line.payouts.filter((p) => p.stream === "build").reduce((s, p) => s + p.amount, 0);
            const recurring = line.payouts
              .filter((p) => p.stream === "recurring")
              .sort((a, b) => (a.periodIndex ?? 0) - (b.periodIndex ?? 0));
            const projectedRecurring = recurring.reduce((s, p) => s + p.amount, 0);
            return (
              <Card key={line.id}>
                <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="title-md">{payee}</span>
                    <span className="text-[11px] text-bone-mute">
                      {Number(line.recurringPct)}% of monthly fee · {line.coveredMonths ?? recurring.length} months
                    </span>
                  </div>
                  <div className="flex items-center gap-6">
                    {buildTotal > 0 && (
                      <div className="flex flex-col items-end">
                        <Label>Build (payable now)</Label>
                        <span className="mono text-[13px] text-bone tabular-nums">
                          {formatCAD(buildTotal).replace("CA$", "$")}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col items-end">
                      <Label>Projected recurring</Label>
                      <span className="mono text-[13px] text-track-gold tabular-nums">
                        {formatCAD(projectedRecurring).replace("CA$", "$")}
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
                  {recurring.map((p) => {
                    const eff = effStatus(p);
                    const effTone: "gold" | "steel" | "neutral" =
                      eff === "paid" ? "steel" : eff === "accrued" ? "gold" : "neutral";
                    return (
                      <div
                        key={p.id}
                        className="grid grid-cols-[70px_1fr_130px_130px] gap-4 px-5 py-2.5 items-center hover:bg-[var(--color-row-hover)]"
                      >
                        <span className="mono text-[12px] text-bone-mute tabular-nums">M{(p.periodIndex ?? 0) + 1}</span>
                        <span className="mono text-[12px] text-bone-dim tabular-nums">
                          {p.periodStart ? formatDate(p.periodStart).split(",")[0] : "—"}
                        </span>
                        <span className="mono text-[13px] text-bone tabular-nums text-right">
                          {formatCAD(p.amount).replace("CA$", "$")}
                        </span>
                        <div className="flex justify-end items-center gap-2">
                          <Badge tone={effTone}>{eff}</Badge>
                          {eff === "accrued" && <MarkCommissionPaidButton payoutId={p.id} />}
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
