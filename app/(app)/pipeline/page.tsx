import { Header } from "@/components/header";
import { Label, Button } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline-board";
import { AddDeal } from "@/components/add-deal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCAD, stageAgeTier } from "@/lib/format";
import { Filter } from "lucide-react";

export default async function PipelinePage() {
  const [deals, contacts, partners, session] = await Promise.all([
    prisma.deal.findMany({
      include: { contact: true, partnerLead: true },
      orderBy: { closeTargetDate: "asc" },
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, industry: true },
      orderBy: { lastTouchAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);

  const openDeals = deals.filter((d) => d.stage !== "signed");
  const totalValue = openDeals.reduce((s, d) => s + d.valueEstimate, 0);
  const staleCount = openDeals.filter((d) => stageAgeTier(d.stageEnteredAt) === "stale").length;

  return (
    <>
      <Header
        eyebrow="Pipeline · CRM"
        title="The board."
        actions={
          <>
            <Button variant="ghost" size="sm">
              <Filter size={13} strokeWidth={1.5} />
              Filter
            </Button>
            <AddDeal contacts={contacts} partners={partners} defaultPartnerId={session?.user?.partnerId} />
          </>
        }
      />

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Open pipeline</Label>
          <span className="mono text-[24px] text-bone tabular-nums">
            {formatCAD(totalValue).replace("CA$", "$")}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Open deals</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{openDeals.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Stale (28d+ in stage)</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">{staleCount}</span>
        </div>
      </div>

      <PipelineBoard initialDeals={deals} />
    </>
  );
}
