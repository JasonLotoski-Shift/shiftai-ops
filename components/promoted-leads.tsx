"use client";

// PromotedLeads — the Pipeline "Promoted Leads" sub-tab. Imported contacts a
// partner promoted (origin = imported), now a working surface (Jay's tracker):
// log how/when you reached out, flag replies, keep notes, and set the dead ones
// aside with a reason. Filter by owner + working status; sort by status / score
// / last touch. Two lanes mirror AI Found Leads:
//   Working   — pending + added (the live list)
//   Set aside — ghosted leads, with the reason + a Restore action
//
// Each Working card reuses LeadCard (the link) with a controls strip rendered as
// a sibling below it (PromotedLeadControls) — so the inline controls never
// trigger navigation.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, EmptyState, Select } from "@/components/ui";
import { LeadCard } from "@/components/lead-card";
import { PromotedLeadControls, PromotedLeadStatusChip } from "@/components/promoted-lead-controls";
import {
  LeadFilters,
  leadMatchesFilter,
  EMPTY_LEAD_FILTER,
  type LeadFilterState,
} from "@/components/lead-filters";
import { enrichPromotedLead } from "@/app/(app)/pipeline/promoted/enrich-actions";
import { restoreLead } from "@/app/(app)/pipeline/leads/actions";
import {
  promotedLeadStatus,
  PROMOTED_STATUS_RANK,
  leadOwner,
  type PromotedStatusKey,
} from "@/lib/leads";
import { Radar, Sparkles, ShieldAlert, CheckCircle2, KanbanSquare, RotateCcw, Archive } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

const byScoreDesc = (a: ProspectLead, b: ProspectLead) => b.score - a.score;

// Enriched = the Apollo/Firecrawl search has tagged it. (foundBy starts ["import"].)
const isEnriched = (l: ProspectLead) => l.foundBy.includes("apollo") || l.foundBy.includes("firecrawl");
const touchTime = (l: ProspectLead) => (l.touchAt ? new Date(l.touchAt).getTime() : 0);

type Lane = "working" | "aside";
type SortMode = "status" | "score" | "touch";

const STATUS_OPTIONS: { key: PromotedStatusKey | ""; label: string }[] = [
  { key: "", label: "All statuses" },
  { key: "new", label: "New" },
  { key: "reached_out", label: "Reached out" },
  { key: "replied", label: "Replied" },
  { key: "in_pipeline", label: "In pipeline" },
];

export function PromotedLeads({
  leads,
  currentPartnerId,
  currentPartnerLabel,
}: {
  leads: ProspectLead[];
  currentPartnerId?: string;
  currentPartnerLabel?: string;
}) {
  const [lane, setLane] = useState<Lane>("working");
  const [filter, setFilter] = useState<LeadFilterState>(EMPTY_LEAD_FILTER);
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<PromotedStatusKey | "">("");
  const [sort, setSort] = useState<SortMode>("status");

  // "Mine" — claimed by me, or (if unclaimed) promoted by me. Id-based on the
  // claim; label-based on the promote (promotedBy is a label, no FK).
  const isMine = (l: ProspectLead) =>
    l.claimedById ? l.claimedById === currentPartnerId : !!l.promotedBy && l.promotedBy === currentPartnerLabel;

  // Owner dropdown options — distinct owner labels (claimedBy ?? promotedBy).
  const owners = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) {
      const o = leadOwner(l);
      if (o) s.add(o);
    }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const matchOwner = (l: ProspectLead) => {
    if (!owner) return true;
    if (owner === "__mine") return isMine(l);
    return leadOwner(l) === owner;
  };

  // Shared text/industry filter + owner filter, then split into lanes.
  const base = leads.filter((l) => leadMatchesFilter(l, filter) && matchOwner(l));
  const working = base.filter((l) => l.status === "pending" || l.status === "added");
  const aside = base.filter((l) => l.status === "ghost");

  const workingShown = working.filter((l) => !status || promotedLeadStatus(l).key === status);

  function sortLeads(arr: ProspectLead[]) {
    if (sort === "score") return [...arr].sort(byScoreDesc);
    if (sort === "touch") return [...arr].sort((a, b) => touchTime(b) - touchTime(a) || byScoreDesc(a, b));
    return [...arr].sort(
      (a, b) =>
        PROMOTED_STATUS_RANK[promotedLeadStatus(a).key] - PROMOTED_STATUS_RANK[promotedLeadStatus(b).key] ||
        byScoreDesc(a, b),
    );
  }

  const orderedWorking = sortLeads(workingShown);
  const orderedAside = [...aside].sort(byScoreDesc);

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
        Leads promoted from imported contacts. Log how and when you reach out, flag replies, keep notes, and set the
        dead ones aside so they stop cluttering your list. Promoted leads are shared with the whole firm.
      </p>

      <div className="flex flex-col gap-3">
        <LeadFilters leads={leads} value={filter} onChange={setFilter} hideClaim />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Lane toggle */}
          <div className="flex items-center gap-1">
            {(
              [
                { key: "working", label: "Working", count: working.length },
                { key: "aside", label: "Set aside", count: aside.length },
              ] as { key: Lane; label: string; count: number }[]
            ).map((l) => {
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

          {/* Owner / Status / Sort */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36 shrink-0">
              <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">All owners</option>
                <option value="__mine">Mine</option>
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </div>
            {lane === "working" && (
              <div className="w-36 shrink-0">
                <Select value={status} onChange={(e) => setStatus(e.target.value as PromotedStatusKey | "")}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex items-center gap-1">
              {(
                [
                  { key: "status", label: "Status" },
                  { key: "score", label: "Score" },
                  { key: "touch", label: "Last touch" },
                ] as { key: SortMode; label: string }[]
              ).map((opt) => {
                const on = sort === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    title={`Sort by ${opt.label.toLowerCase()}`}
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
          </div>
        </div>
      </div>

      {lane === "working" ? (
        orderedWorking.length === 0 ? (
          <p className="text-[13px] text-bone-mute">No promoted leads match these filters.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {orderedWorking.map((lead) => (
              <WorkingCard key={lead.id} lead={lead} />
            ))}
          </div>
        )
      ) : orderedAside.length === 0 ? (
        <EmptyState
          icon={<Archive size={28} strokeWidth={1.25} />}
          title="Nothing set aside"
          hint="Leads you mark Not a fit, Not now, or Declined collect here. You can restore one back to your working list anytime."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orderedAside.map((lead) => (
            <AsideCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Working lane card — LeadCard + status chip + the outreach controls ───────
function WorkingCard({ lead }: { lead: ProspectLead }) {
  const inPipeline = lead.status === "added";
  const enriched = isEnriched(lead);
  return (
    <div className="flex flex-col gap-2">
      <LeadCard lead={lead} muted={inPipeline} />
      <div className="flex items-center justify-between gap-2">
        <PromotedLeadStatusChip lead={lead} />
        {enriched && !inPipeline && (
          <span className="inline-flex items-center gap-1 text-[10px] text-track-gold" title="Company picture built">
            <CheckCircle2 size={11} strokeWidth={1.5} />
            Enriched
          </span>
        )}
      </div>
      {inPipeline ? (
        <span className="inline-flex items-center gap-1.5 h-7 text-[11px] text-bone-mute">
          <KanbanSquare size={12} strokeWidth={1.5} />
          In pipeline
        </span>
      ) : (
        <>
          <PromotedLeadControls lead={lead} compact />
          {!enriched && <EnrichButton leadId={lead.id} />}
        </>
      )}
    </div>
  );
}

// ── Set-aside lane card — muted, shows the reason + Restore ──────────────────
function AsideCard({ lead }: { lead: ProspectLead }) {
  return (
    <div className="flex flex-col gap-2">
      <LeadCard lead={lead} muted />
      <div className="flex items-center justify-between gap-2">
        {lead.dismissReason ? (
          <span className="inline-flex items-center px-2 py-0.5 border border-graphite-2 bg-graphite text-bone-mute font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)]">
            {lead.dismissReason}
          </span>
        ) : (
          <span className="text-[10px] text-bone-mute">Set aside</span>
        )}
        <RestoreButton leadId={lead.id} />
      </div>
    </div>
  );
}

function RestoreButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onRestore() {
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
      title="Restore to your working list"
      className="inline-flex items-center gap-1.5 px-2 py-1 border border-graphite-2 bg-asphalt text-bone-mute hover:text-track-gold hover:border-track-gold/40 font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50"
    >
      <RotateCcw size={11} strokeWidth={1.5} />
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}

function EnrichButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);

  function onEnrich() {
    setError(null);
    setNotes([]);
    startTransition(async () => {
      try {
        const summary = await enrichPromotedLead(leadId);
        setNotes(summary.notes ?? []);
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
      {notes.map((n, i) => (
        <span key={i} className="flex items-start gap-1 text-[11px] text-track-gold">
          <ShieldAlert size={11} strokeWidth={1.5} className="mt-0.5 shrink-0" />
          {n}
        </span>
      ))}
    </div>
  );
}
