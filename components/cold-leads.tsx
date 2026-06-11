"use client";

// ColdLeads — the Pipeline "Cold email sent" tab. Leads (either origin) that a
// partner has cold-emailed but that haven't replied yet — kept OFF the board so
// they don't overfill it. Two exits per row:
//   Replied → add to funnel  — converts to Contact + Deal at "qualified"
//   No reply — set aside     — status → ghost (restorable from Filtered)
// Row click opens the lead detail page.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, Button, Card, EmptyState } from "@/components/ui";
import { markContactedLeadReplied, setAsideContactedLead } from "@/app/(app)/pipeline/leads/actions";
import { daysSince } from "@/lib/format";
import { MailCheck, MailX, Snowflake } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

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

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function ColdLeads({ leads }: { leads: ProspectLead[] }) {
  // Longest-waiting first — those are the ones to chase or set aside.
  const ordered = [...leads].sort((a, b) => {
    const ta = a.outreachSentAt ? new Date(a.outreachSentAt).getTime() : 0;
    const tb = b.outreachSentAt ? new Date(b.outreachSentAt).getTime() : 0;
    return ta - tb;
  });

  if (leads.length === 0) {
    return (
      <div className="px-8 py-8">
        <EmptyState
          icon={<Snowflake size={28} strokeWidth={1.25} />}
          title="No cold emails out right now"
          hint="When you draft a cold email on a lead and file it under the cold funnel, it waits here instead of crowding the board. A reply moves it into the pipeline as Qualified."
        />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 flex flex-col gap-6">
      <p className="text-[13px] text-bone-mute">
        Cold emails sent, awaiting a reply. A reply adds the lead to the funnel as Qualified; no
        reply sets it aside (restorable from AI Found Leads → Filtered).
      </p>
      <Card>
        <div className="flex flex-col">
          {ordered.map((lead, i) => (
            <ColdLeadRow key={lead.id} lead={lead} first={i === 0} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function waitTone(days: number): string {
  if (days > 14) return "text-flag-red";
  if (days > 7) return "text-[var(--color-signal-warming)]";
  return "text-bone-mute";
}

function ColdLeadRow({ lead, first }: { lead: ProspectLead; first: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const person = lead.outreachPersonIndex != null ? lead.people[lead.outreachPersonIndex] : undefined;
  const waiting = lead.outreachSentAt ? daysSince(new Date(lead.outreachSentAt)) : 0;

  function onReplied(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      try {
        const { dealId } = await markContactedLeadReplied(lead.id);
        router.push(`/pipeline/${dealId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't mark replied");
      }
    });
  }

  function onSetAside(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      try {
        await setAsideContactedLead(lead.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't set aside");
      }
    });
  }

  return (
    <Link
      href={`/pipeline/leads/${lead.id}`}
      className={`block px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors ${first ? "" : "border-t border-graphite"}`}
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[14px] text-bone font-medium truncate">{lead.companyName}</span>
            {lead.segmentName && <span className="text-[11px] text-bone-mute truncate hidden md:inline">{lead.segmentName}</span>}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[12px] text-bone-mute">
            <span className="truncate">
              {person ? `Emailed ${person.name}${person.title ? ` — ${person.title}` : ""}` : "Emailed"}
            </span>
            {lead.outreachSubject && (
              <span className="truncate hidden lg:inline text-bone-dim">“{lead.outreachSubject}”</span>
            )}
          </div>
        </div>

        {lead.claimedBy && (
          <span className="hidden sm:flex items-center gap-1.5 shrink-0" title={`Claimed by ${lead.claimedBy}`}>
            <Avatar initials={initialsOf(lead.claimedBy)} size="sm" />
            <span className="text-[11px] text-bone-mute">{lead.claimedBy.split(/\s+/)[0]}</span>
          </span>
        )}

        <div className="flex flex-col items-end shrink-0 w-[92px]">
          <span className="mono text-[12px] text-bone-dim tabular-nums">{fmtDate(lead.outreachSentAt)}</span>
          <span className={`mono text-[11px] tabular-nums ${waitTone(waiting)}`}>
            {waiting}d waiting
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="primary" size="sm" onClick={onReplied} disabled={pending}>
            <MailCheck size={13} strokeWidth={1.5} />
            {pending ? "Working…" : "Replied → funnel"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSetAside} disabled={pending} title="No reply — set aside">
            <MailX size={13} strokeWidth={1.5} />
            No reply
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-[12px] text-flag-red">{error}</p>}
    </Link>
  );
}
