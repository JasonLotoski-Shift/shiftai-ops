import Link from "next/link";
import { Header } from "@/components/header";
import { Card, Label, Badge, Button } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, daysSince } from "@/lib/format";
import { industryLabels, stageOrder, stageLabels } from "@/lib/data/seed";
import { Filter, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export default async function PipelinePage() {
  const deals = await prisma.deal.findMany({
    include: { contact: true, partnerLead: true },
    orderBy: { closeTargetDate: "asc" },
  });

  const openDeals = deals.filter((d) => d.stage !== "signed");
  const totalValue = openDeals.reduce((s, d) => s + d.valueEstimate, 0);
  const staleCount = openDeals.filter((d) => daysSince(d.lastTouchAt) > 30).length;

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
            <Button variant="primary" size="sm">+ New deal</Button>
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
          <Label>— Stale (30d+)</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">{staleCount}</span>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-px bg-graphite min-w-max h-full">
          {stageOrder
            .filter((s) => s !== "signed")
            .map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage);
              const stageValue = stageDeals.reduce((s, d) => s + d.valueEstimate, 0);
              return (
                <div key={stage} className="bg-bitumen w-[300px] flex flex-col">
                  <div className="px-4 py-4 border-b border-graphite">
                    <div className="flex items-center justify-between mb-1">
                      <Label>— {stageLabels[stage]}</Label>
                      <span className="label">{stageDeals.length}</span>
                    </div>
                    <span className="mono text-[12px] text-bone-dim tabular-nums">
                      {formatCAD(stageValue).replace("CA$", "$")}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 p-3 flex-1">
                    {stageDeals.map((deal) => {
                      const stale = daysSince(deal.lastTouchAt) > 30;
                      return (
                        <Link
                          key={deal.id}
                          href={`/pipeline/${deal.id}`}
                          className={cn(
                            "block bg-asphalt border border-graphite p-3 hover:border-bone-mute transition-colors",
                            stale && "border-flag-red/60",
                          )}
                        >
                          <div className="flex justify-between items-start mb-2 gap-2">
                            <span className="text-[13px] text-bone leading-snug">{deal.company}</span>
                            <span className="mono text-[12px] text-track-gold tabular-nums shrink-0">
                              {formatCAD(deal.valueEstimate).replace("CA$", "$").replace(",000", "k")}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <Badge tone="bone">{industryLabels[deal.industry]}</Badge>
                            {stale && (
                              <Badge tone="red">
                                <AlertCircle size={9} strokeWidth={2} className="mr-1" />
                                {daysSince(deal.lastTouchAt)}d cold
                              </Badge>
                            )}
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-graphite">
                            <span className="text-[11px] text-bone-mute">{deal.contact.name}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim">
                                {deal.partnerLead.initials}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                    {stageDeals.length === 0 && (
                      <div className="text-center py-6">
                        <span className="label text-bone-mute">— Empty</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

          <div className="bg-bitumen w-[260px] flex flex-col border-l-2 border-track-gold">
            <div className="px-4 py-4 border-b border-graphite">
              <Label gold>— Signed → Convert</Label>
              <span className="block label mt-2 text-[10px] text-bone-mute">
                Closed deals waiting<br /> on /new-client trigger
              </span>
            </div>
            <div className="p-3 flex-1">
              <div className="text-center py-8">
                <span className="label">— None this week</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
