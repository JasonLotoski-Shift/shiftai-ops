"use client";

// PipelineTabs — the /pipeline tab shell. "Board" (default) renders the
// existing PipelineBoard + its stat cards exactly as the page did before;
// "AI Found Leads" renders the discovered-prospect review surface.
//
// This is the only new "use client" boundary the pipeline page gains —
// PipelineBoard stays its own untouched client island, nested under the tab.

import { useState } from "react";
import { Card, Stat, Tabs } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline-board";
import { FoundLeads } from "@/components/found-leads";
import { PromotedLeads } from "@/components/promoted-leads";
import { formatCAD } from "@/lib/format";
import type {
  DealModel as Deal,
  ContactModel as Contact,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import type { ProspectLead } from "@/lib/types";

type DealWithRel = Deal & { contact: Contact; partnerLead: Partner };

type PipelineTab = "board" | "leads" | "promoted";

export function PipelineTabs({
  deals,
  stats,
  foundLeads,
  filteredLeads,
  promotedLeads,
  initialTab = "board",
  segment,
}: {
  deals: DealWithRel[];
  stats: { totalValue: number; openDeals: number; staleCount: number };
  foundLeads: ProspectLead[];
  filteredLeads: ProspectLead[];
  promotedLeads: ProspectLead[];
  initialTab?: PipelineTab;
  segment?: string;
}) {
  const [tab, setTab] = useState<PipelineTab>(initialTab);

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-6 border-b border-graphite">
        <Tabs
          tabs={[
            { key: "board", label: "Board" },
            { key: "leads", label: "AI Found Leads", count: foundLeads.length },
            { key: "promoted", label: "Promoted Leads", count: promotedLeads.length },
          ]}
          active={tab}
          onChange={(k) => setTab(k as PipelineTab)}
        />
      </div>

      {tab === "board" && (
        <div className="px-8 py-8 flex flex-col gap-8">
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5">
              <Stat label="Open pipeline" value={formatCAD(stats.totalValue).replace("CA$", "$")} />
            </Card>
            <Card className="p-5">
              <Stat label="Open deals" value={stats.openDeals} />
            </Card>
            <Card className="p-5">
              <Stat label="Stale (28d+ in stage)" value={stats.staleCount} />
            </Card>
          </div>

          <PipelineBoard initialDeals={deals} />
        </div>
      )}

      {tab === "leads" && (
        <FoundLeads pending={foundLeads} filtered={filteredLeads} segment={segment} />
      )}

      {tab === "promoted" && <PromotedLeads leads={promotedLeads} />}
    </div>
  );
}
