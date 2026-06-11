"use client";

// LeadCard — one ranked AI Found Lead. Score is a 1–10 integer; color tiers:
// 8–10 track-gold, 6–7 amber (signal-warming), <6 muted. The `muted` variant
// dims set-aside leads. Shows who surfaced the lead right under the title, and
// who's claimed it (one-click Claim for unclaimed, active leads).

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Avatar } from "@/components/ui";
import { claimLead } from "@/app/(app)/pipeline/leads/actions";
import { Users, Mail, Sparkles, UserCheck } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

function scoreChip(score: number, muted: boolean) {
  if (muted) {
    return "bg-graphite text-bone-mute border-graphite-2";
  }
  if (score >= 8) return "bg-track-gold-dim/20 text-track-gold border-track-gold/40";
  if (score >= 6) return ""; // amber handled via inline style below
  return "bg-graphite text-bone-mute border-graphite-2";
}

function initialsOf(name?: string): string {
  if (!name) return "";
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LeadCard({ lead, muted = false }: { lead: ProspectLead; muted?: boolean }) {
  const router = useRouter();
  const [claiming, startClaim] = useTransition();
  const [claimErr, setClaimErr] = useState(false);
  const amber = !muted && lead.score >= 6 && lead.score < 8;
  // Fast-outreach affordance on pending cards only — deep-links to the detail
  // page with the composer auto-opened. The card itself is a Link, so this is a
  // button with router.push + stopPropagation (a nested anchor would be invalid).
  const canCompose = !muted && lead.status === "pending";
  const canClaim = !muted && (lead.status === "pending" || lead.status === "contacted");

  function compose(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/pipeline/leads/${lead.id}?compose=1`);
  }

  function claim(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setClaimErr(false);
    startClaim(async () => {
      try {
        await claimLead(lead.id);
        router.refresh();
      } catch {
        setClaimErr(true);
      }
    });
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

        {/* Who surfaced this — prominent, right under the title. */}
        <div className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${muted ? "text-bone-mute" : "text-track-gold"}`}>
          <Sparkles size={11} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">
            Surfaced by {lead.createdBy}
            {lead.generatedFromSkill ? <span className="text-bone-mute"> · {lead.generatedFromSkill}</span> : null}
          </span>
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
            {lead.enrichedAt && (
              <span
                title="Company picture built from the web"
                className="inline-flex items-center px-1.5 py-0.5 border border-graphite-2 bg-graphite text-bone-mute font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)]"
              >
                profile
              </span>
            )}
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

        {/* Claim row — owner chip once claimed; one-click Claim while open. */}
        {(lead.claimedBy || canClaim) && (
          <div className="mt-3 pt-2.5 border-t border-graphite flex items-center justify-between gap-2">
            {lead.claimedBy ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-bone-dim" title={`Claimed by ${lead.claimedBy}`}>
                <Avatar initials={initialsOf(lead.claimedBy)} size="sm" />
                {lead.claimedBy.split(/\s+/)[0]} has this
              </span>
            ) : (
              <button
                onClick={claim}
                disabled={claiming}
                title={claimErr ? "Couldn't claim — try again" : "Claim this lead"}
                className={`inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50 ${
                  claimErr
                    ? "border-flag-red/40 text-flag-red"
                    : "border-graphite-2 text-bone-mute hover:text-track-gold hover:border-track-gold/40"
                }`}
              >
                <UserCheck size={11} strokeWidth={1.5} />
                {claiming ? "Claiming…" : claimErr ? "Retry claim" : "Claim"}
              </button>
            )}
          </div>
        )}
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
