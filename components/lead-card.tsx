"use client";

// LeadCard — one ranked AI Found Lead. Pure presentational; all data via props.
// Score is a 1–10 integer; color tiers: 8–10 track-gold, 6–7 amber
// (signal-warming), <6 muted. The `muted` variant dims set-aside leads.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { Users, Mail } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

function scoreChip(score: number, muted: boolean) {
  if (muted) {
    return "bg-graphite text-bone-mute border-graphite-2";
  }
  if (score >= 8) return "bg-track-gold-dim/20 text-track-gold border-track-gold/40";
  if (score >= 6) return ""; // amber handled via inline style below
  return "bg-graphite text-bone-mute border-graphite-2";
}

export function LeadCard({ lead, muted = false }: { lead: ProspectLead; muted?: boolean }) {
  const router = useRouter();
  const amber = !muted && lead.score >= 6 && lead.score < 8;
  // Fast-outreach affordance on pending cards only — deep-links to the detail
  // page with the composer auto-opened. The card itself is a Link, so this is a
  // button with router.push + stopPropagation (a nested anchor would be invalid).
  const canCompose = !muted && lead.status === "pending";

  function compose(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/pipeline/leads/${lead.id}?compose=1`);
  }

  return (
    <Link href={`/pipeline/leads/${lead.id}`} className="block">
      <Card
        className={cnCard(muted)}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[13px] text-bone leading-snug font-medium truncate">{lead.companyName}</span>
          <div className="flex items-center gap-1.5 shrink-0">
          {canCompose && (
            <button
              onClick={compose}
              title="Draft a cold outreach email"
              className="inline-flex items-center justify-center w-7 h-7 border border-graphite-2 text-bone-mute hover:text-track-gold hover:border-track-gold/40 rounded-[var(--radius-pill)] transition-colors"
            >
              <Mail size={13} strokeWidth={1.5} />
            </button>
          )}
          <span
            className={`inline-flex items-center justify-center shrink-0 w-9 h-7 border font-mono tabular-nums text-[13px] rounded-[var(--radius-pill)] ${scoreChip(
              lead.score,
              muted,
            )}`}
            style={
              amber
                ? {
                    backgroundColor: "color-mix(in srgb, var(--color-signal-warming) 15%, transparent)",
                    color: "var(--color-signal-warming)",
                    borderColor: "color-mix(in srgb, var(--color-signal-warming) 40%, transparent)",
                  }
                : undefined
            }
            title={`Fit score ${lead.score} / 10`}
          >
            {lead.score}
          </span>
          </div>
        </div>

        <div className="mt-2">
          {lead.segmentName ? (
            <Badge tone="bone">{lead.segmentName}</Badge>
          ) : (
            <Badge tone="neutral">Unmatched</Badge>
          )}
        </div>

        <p className="mt-2.5 text-[12px] text-bone-dim leading-snug line-clamp-2">{lead.rationale}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-bone-mute">
            <Users size={12} strokeWidth={1.5} />
            {lead.people.length} {lead.people.length === 1 ? "contact" : "contacts"}
          </span>
          <span className="flex items-center gap-1">
            {lead.foundBy.map((src) => (
              <span
                key={src}
                className="inline-flex items-center px-1.5 py-0.5 border border-graphite-2 bg-graphite text-bone-mute font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)]"
              >
                {src}
              </span>
            ))}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function cnCard(muted: boolean) {
  return [
    "p-4 shadow-[var(--shadow)] hover:-translate-y-px transition-transform cursor-pointer h-full",
    muted ? "opacity-60" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
