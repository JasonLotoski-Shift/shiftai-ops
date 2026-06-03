"use client";

// FoundLeads — the AI Found Leads tab body. A two-lane segmented control (D36):
//   New        — pending leads, the ranked card grid + Sort/Group toggle
//   Filtered   — ghosted or disqualified leads, muted, with a Restore action
// Both lanes honor an optional ?segment=<id> filter threaded from the URL.
//
// The old "Contacted" lane was dropped (D36): cold-emailing a lead now converts
// it straight into a pipeline Deal (status "added"), so there's no in-between
// "contacted" surface. ProspectLeadStatus.contacted remains in the enum but is
// vestigial — do not reintroduce a Contacted lane.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Label } from "@/components/ui";
import { LeadCard } from "@/components/lead-card";
import { restoreLead } from "@/app/(app)/pipeline/leads/actions";
import { Radar, RotateCcw } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

type SortMode = "score" | "segment";
type Lane = "new" | "filtered";

const byScoreDesc = (a: ProspectLead, b: ProspectLead) => b.score - a.score;

export function FoundLeads({
  pending,
  filtered,
  segment,
}: {
  pending: ProspectLead[];
  filtered: ProspectLead[];
  segment?: string;
}) {
  const [lane, setLane] = useState<Lane>("new");
  const [mode, setMode] = useState<SortMode>("score");

  // Honor ?segment=<id> across both lanes.
  const keep = (l: ProspectLead) => !segment || l.segmentId === segment;
  const pendingF = pending.filter(keep);
  const filteredF = filtered.filter(keep);

  const sortedPending = [...pendingF].sort(byScoreDesc);

  const lanes: { key: Lane; label: string; count: number }[] = [
    { key: "new", label: "New", count: pendingF.length },
    { key: "filtered", label: "Filtered", count: filteredF.length },
  ];

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {lanes.map((l) => {
            const on = lane === l.key;
            return (
              <button
                key={l.key}
                onClick={() => setLane(l.key)}
                className={`px-3 py-1.5 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors flex items-center gap-1.5 ${
                  on
                    ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                    : "border-graphite-2 text-bone-mute hover:text-bone-dim"
                }`}
              >
                {l.label}
                <span className="tabular-nums opacity-70">{l.count}</span>
              </button>
            );
          })}
        </div>

        {lane === "new" && (
          <div className="flex items-center gap-1">
            {(
              [
                { key: "score", label: "Sort by score" },
                { key: "segment", label: "Group by segment" },
              ] as { key: SortMode; label: string }[]
            ).map((opt) => {
              const on = mode === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setMode(opt.key)}
                  className={`px-2.5 py-1 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors ${
                    on
                      ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                      : "border-graphite-2 text-bone-mute hover:text-bone-dim"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {lane === "new" && (
        <NewLane leads={sortedPending} mode={mode} />
      )}

      {lane === "filtered" && <FilteredLane leads={filteredF} />}
    </div>
  );
}

// ── New lane — the ranked grid + Sort/Group toggle ─────────────────────────
function NewLane({ leads, mode }: { leads: ProspectLead[]; mode: SortMode }) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Radar size={28} strokeWidth={1.25} />}
        title="No leads waiting for review"
        hint="When the lead agent runs a discovery pass over your segments, the prospects it surfaces will land here, ranked by fit."
      />
    );
  }
  return (
    <>
      <p className="text-[13px] text-bone-mute -mt-4">
        Companies the lead agent surfaced, ranked by how well they fit your targeting.
      </p>
      {mode === "score" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      ) : (
        <GroupedBySegment leads={leads} />
      )}
    </>
  );
}

// ── Filtered lane — ghosts + disqualified, with Restore ────────────────────
function FilteredLane({ leads }: { leads: ProspectLead[] }) {
  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<Radar size={28} strokeWidth={1.25} />}
        title="Nothing filtered out"
        hint="Leads you decline, or that the agent disqualified, collect here. You can restore a declined one back to the review queue."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[...leads].sort(byScoreDesc).map((lead) => (
        <div key={lead.id} className="relative">
          <LeadCard lead={lead} muted />
          {/* Restore only for ghosts (disqualified leads stay filtered). */}
          {lead.status === "ghost" && <RestoreButton leadId={lead.id} />}
        </div>
      ))}
    </div>
  );
}

function RestoreButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRestore(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      try {
        await restoreLead(leadId);
        router.refresh();
      } catch {
        /* surfaced on reload */
      }
    });
  }

  return (
    <button
      onClick={onRestore}
      disabled={pending}
      title="Restore to leads"
      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2 py-1 border border-graphite-2 bg-asphalt text-bone-mute hover:text-track-gold hover:border-track-gold/40 font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50"
    >
      <RotateCcw size={11} strokeWidth={1.5} />
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}

function GroupedBySegment({ leads }: { leads: ProspectLead[] }) {
  // Preserve a stable group order by first-appearance (already score-desc input).
  const groups = new Map<string, { name: string; leads: ProspectLead[] }>();
  for (const lead of leads) {
    const key = lead.segmentId ?? "__unmatched";
    const name = lead.segmentName ?? "Unmatched";
    if (!groups.has(key)) groups.set(key, { name, leads: [] });
    groups.get(key)!.leads.push(lead);
  }

  return (
    <div className="flex flex-col gap-8">
      {[...groups.values()].map((group) => (
        <div key={group.name} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Label gold>{group.name}</Label>
            <span className="text-[11px] text-bone-mute font-mono">{group.leads.length}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {group.leads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
