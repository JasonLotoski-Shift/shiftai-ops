"use client";

import Link from "next/link";
import { Header } from "@/components/header";
import { Card, Label, Badge, Button } from "@/components/ui";
import {
  deals,
  stageOrder,
  stageLabels,
  contactById,
  partnerById,
  industryLabels,
  formatCAD,
  daysSince,
} from "@/lib/data/seed";
import { Filter, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export default function PipelinePage() {
  const totalValue = deals
    .filter((d) => d.stage !== "signed")
    .reduce((s, d) => s + d.valueEstimate, 0);

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
            <Button variant="primary" size="sm">
              + New deal
            </Button>
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
          <span className="mono text-[24px] text-bone tabular-nums">
            {deals.filter((d) => d.stage !== "signed").length}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Stale (30d+)</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">
            {deals.filter((d) => daysSince(d.lastTouchAt) > 30 && d.stage !== "signed").length}
          </span>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-px bg-graphite min-w-max h-full">
          {stageOrder
            .filter((s) => s !== "signed")
            .map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage);
              const stageValue = stageDeals.reduce((s, d) => s + d.valueEstimate, 0);
              return (
                <div key={stage} className="bg-bitumen w-[300px] flex flex-col">
                  {/* Column header */}
                  <div className="px-4 py-4 border-b border-graphite">
                    <div className="flex items-center justify-between mb-1">
                      <Label>— {stageLabels[stage]}</Label>
                      <span className="label">{stageDeals.length}</span>
                    </div>
                    <span className="mono text-[12px] text-bone-dim tabular-nums">
                      {formatCAD(stageValue).replace("CA$", "$")}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex flex-col gap-2 p-3 flex-1">
                    {stageDeals.map((deal) => {
                      const contact = contactById(deal.contactId);
                      const partner = partnerById(deal.partnerLeadId);
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
                            <span className="text-[13px] text-bone leading-snug">
                              {deal.company}
                            </span>
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
                            <span className="text-[11px] text-bone-mute">{contact?.name}</span>
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim">
                                {partner?.initials}
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

          {/* Signed column — slightly different visual treatment */}
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
