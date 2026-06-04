"use client";

// PromotedLeads — the Pipeline "Promoted Leads" sub-tab body. Renders the
// firm-wide ProspectLeads a partner promoted from their imported contacts
// (origin = imported), reusing the same LeadCard as AI Found Leads. Each active
// card offers an "Enrich" action (Apollo + Firecrawl). Once a lead is enriched
// the action is replaced with an "Enriched" marker; once it's been added to the
// pipeline it greys out and sinks to the bottom.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState } from "@/components/ui";
import { LeadCard } from "@/components/lead-card";
import { enrichPromotedLead } from "@/app/(app)/pipeline/promoted/enrich-actions";
import { Radar, Sparkles, ShieldAlert, CheckCircle2, KanbanSquare } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

const byScoreDesc = (a: ProspectLead, b: ProspectLead) => b.score - a.score;

// Enriched = the Apollo/Firecrawl search has tagged it. (foundBy starts ["import"].)
const isEnriched = (l: ProspectLead) =>
  l.foundBy.includes("apollo") || l.foundBy.includes("firecrawl");

export function PromotedLeads({ leads }: { leads: ProspectLead[] }) {
  const visible = [...leads].filter((l) => l.status !== "ghost");
  // Active (still to work) on top by score; in-pipeline (added) greyed at the bottom.
  const activeLeads = visible.filter((l) => l.status === "pending").sort(byScoreDesc);
  const inPipeline = visible.filter((l) => l.status !== "pending").sort(byScoreDesc);
  const ordered = [...activeLeads, ...inPipeline];

  if (leads.length === 0) {
    return (
      <div className="px-8 py-8">
        <EmptyState
          icon={<Radar size={28} strokeWidth={1.25} />}
          title="No promoted leads yet"
          hint="Import a contact list, scan it for fit, then push the strong ones here from the Import Contacts tab. Promoted leads are shared with the whole firm."
        />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 flex flex-col gap-6">
      <p className="text-[13px] text-bone-mute">
        Leads promoted from imported contacts. Run an enrichment search to pull firmographics and
        reveal a work email, then open a lead to add it to the funnel.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ordered.map((lead) => {
          const done = lead.status !== "pending";
          const enriched = isEnriched(lead);
          return (
            <div key={lead.id} className="flex flex-col gap-2">
              <LeadCard lead={lead} muted={done} />
              {done ? (
                <span className="inline-flex items-center justify-center gap-1.5 h-7 text-[11px] text-bone-mute">
                  <KanbanSquare size={12} strokeWidth={1.5} />
                  In pipeline
                </span>
              ) : enriched ? (
                <span className="inline-flex items-center justify-center gap-1.5 h-7 text-[11px] text-track-gold">
                  <CheckCircle2 size={12} strokeWidth={1.5} />
                  Enriched — open to add to the funnel
                </span>
              ) : (
                <EnrichButton leadId={lead.id} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EnrichButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onEnrich() {
    setError(null);
    startTransition(async () => {
      try {
        await enrichPromotedLead(leadId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enrichment failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" size="sm" onClick={onEnrich} disabled={isPending} className="w-full">
        <Sparkles size={13} strokeWidth={1.5} />
        {isPending ? "Enriching…" : "Enrich (Apollo + Firecrawl)"}
      </Button>
      {error && (
        <span className="flex items-center gap-1 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {error}
        </span>
      )}
    </div>
  );
}
