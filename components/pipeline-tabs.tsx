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
import { ColdLeads } from "@/components/cold-leads";
import { formatCAD } from "@/lib/format";
import type {
  DealModel as Deal,
  ContactModel as Contact,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import type { ProspectLead } from "@/lib/types";

// The narrowed shape the board/tabs actually render — mirrors the `select` in
// app/(app)/pipeline/page.tsx. tsc enforces these stay in sync where the page
// passes `deals` in, and where this component passes them to PipelineBoard.
type DealWithRel = Pick<
  Deal,
  | "id"
  | "company"
  | "name"
  | "stage"
  | "valueEstimate"
  | "industry"
  | "subIndustry"
  | "stageEnteredAt"
  | "partnerLeadId"
  | "coldOutreachAt"
  | "outreachRepliedAt"
> & {
  contact: Pick<Contact, "name" | "sourceCategory">;
  partnerLead: Pick<Partner, "initials" | "name">;
};

type PipelineTab = "board" | "leads" | "promoted" | "cold";

export function PipelineTabs({
  deals,
  stats,
  foundLeads,
  filteredLeads,
  promotedLeads,
  coldLeads,
  initialTab = "board",
  segment,
  currentPartnerId,
  currentPartnerLabel,
}: {
  deals: DealWithRel[];
  stats: { totalValue: number; openDeals: number; staleCount: number };
  foundLeads: ProspectLead[];
  filteredLeads: ProspectLead[];
  promotedLeads: ProspectLead[];
  coldLeads: ProspectLead[];
  initialTab?: PipelineTab;
  segment?: string;
  currentPartnerId?: string;
  currentPartnerLabel?: string;
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
            { key: "cold", label: "Cold email sent", count: coldLeads.length },
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

      {tab === "promoted" && (
        <PromotedLeads
          leads={promotedLeads}
          currentPartnerId={currentPartnerId}
          currentPartnerLabel={currentPartnerLabel}
        />
      )}

      {tab === "cold" && <ColdLeads leads={coldLeads} />}
    </div>
  );
}
