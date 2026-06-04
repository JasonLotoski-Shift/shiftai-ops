"use client";

// PromotedLeads — the Pipeline "Promoted Leads" sub-tab body. Renders the
// firm-wide ProspectLeads a partner promoted from their imported contacts
// (origin = imported), reusing the same LeadCard as AI Found Leads (clicking a
// card opens the existing /pipeline/leads/[id] detail page, where reveal /
// add-to-funnel already work). Each card adds an "Enrich" action that runs the
// Apollo + Firecrawl search to fill firmographics and reveal a work email.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState } from "@/components/ui";
import { LeadCard } from "@/components/lead-card";
import { enrichPromotedLead } from "@/app/(app)/pipeline/promoted/enrich-actions";
import { Radar, Sparkles, ShieldAlert } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

const byScoreDesc = (a: ProspectLead, b: ProspectLead) => b.score - a.score;

export function PromotedLeads({ leads }: { leads: ProspectLead[] }) {
  const active = [...leads].filter((l) => l.status !== "ghost").sort(byScoreDesc);

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
        {active.map((lead) => (
          <div key={lead.id} className="flex flex-col gap-2">
            <LeadCard lead={lead} />
            <EnrichButton leadId={lead.id} />
          </div>
        ))}
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
