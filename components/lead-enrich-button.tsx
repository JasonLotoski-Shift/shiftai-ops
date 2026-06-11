"use client";

// LeadEnrichButton — the detail-page Enrich action. Reuses enrichPromotedLead
// (which has no origin guard; it serves both AI Found and Promoted leads). Same
// result-display idiom as the promoted-card EnrichButton: pending state via
// useTransition, notes surfaced in gold, errors in red. On success it reports
// whether the company picture / positioning built, then refreshes the page so
// the cards re-render with the new data.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { enrichPromotedLead } from "@/app/(app)/pipeline/promoted/enrich-actions";
import { Sparkles, ShieldAlert, CheckCircle2 } from "lucide-react";

export function LeadEnrichButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [built, setBuilt] = useState<{ profile: boolean; positioning: boolean } | null>(null);

  function onEnrich() {
    setError(null);
    setNotes([]);
    setBuilt(null);
    startTransition(async () => {
      try {
        const summary = await enrichPromotedLead(leadId);
        setNotes(summary.notes ?? []);
        setBuilt({ profile: summary.profile, positioning: summary.positioning });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Enrichment failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={onEnrich} disabled={isPending}>
        <Sparkles size={13} strokeWidth={1.5} />
        {isPending ? "Enriching…" : "Enrich"}
      </Button>
      {built && (built.profile || built.positioning) && (
        <span className="flex items-center gap-1 text-[11px] text-track-gold">
          <CheckCircle2 size={11} strokeWidth={1.5} />
          Built {[built.profile ? "company picture" : null, built.positioning ? "selling view" : null].filter(Boolean).join(" + ")}
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {error}
        </span>
      )}
      {notes.map((n, i) => (
        <span key={i} className="flex items-start gap-1 text-[11px] text-track-gold text-right">
          <ShieldAlert size={11} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          {n}
        </span>
      ))}
    </div>
  );
}
