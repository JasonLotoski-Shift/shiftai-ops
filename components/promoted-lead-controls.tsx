"use client";

// PromotedLeadControls — the working-tracker controls for a single PENDING
// promoted lead (Pipeline "Promoted Leads"). Lets a partner log how/when they
// reached out (LinkedIn / Email / Call / Other), flag a reply, set the lead
// aside with a reason, and keep free-text notes — all without leaving the list.
//
// Two layouts via `compact`:
//   compact (card)  — notes + set-aside reasons hide behind toggles to stay dense
//   roomy  (detail) — notes textarea + the three reasons are always visible
//
// Operates only on pending leads (added → "In pipeline"; ghost → the Set-aside
// lane). Rendered as a sibling under the LeadCard link, so no stopPropagation.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui";
import {
  logLeadOutreach,
  markLeadReplied,
  setLeadNotes,
  declineLead,
} from "@/app/(app)/pipeline/leads/actions";
import {
  OUTREACH_CHANNELS,
  CHANNEL_LABEL,
  DISMISS_REASONS,
  promotedLeadStatus,
} from "@/lib/leads";
import { formatDate } from "@/lib/format";
import { MessageSquare, CheckCircle2, Archive, ShieldAlert, Reply } from "lucide-react";
import type { ProspectLead } from "@/lib/types";

function Pill({
  on,
  onClick,
  disabled,
  title,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors disabled:opacity-50 ${
        on
          ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
          : "border-graphite-2 text-bone-mute hover:text-bone-dim hover:border-bone-mute/40"
      }`}
    >
      {children}
    </button>
  );
}

export function PromotedLeadStatusChip({ lead }: { lead: ProspectLead }) {
  const { key, label } = promotedLeadStatus(lead);
  const reachedOut = key === "reached_out";
  // signal-warming (amber) uses an inline color-mix style, matching lead-card.tsx.
  const cls =
    key === "replied"
      ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
      : reachedOut
        ? ""
        : "border-graphite-2 text-bone-mute";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] ${cls}`}
      style={
        reachedOut
          ? {
              backgroundColor: "color-mix(in srgb, var(--color-signal-warming) 15%, transparent)",
              color: "var(--color-signal-warming)",
              borderColor: "color-mix(in srgb, var(--color-signal-warming) 40%, transparent)",
            }
          : undefined
      }
    >
      {label}
    </span>
  );
}

export function PromotedLeadControls({
  lead,
  compact = false,
}: {
  lead: ProspectLead;
  compact?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(!compact);
  const [setAsideOpen, setSetAsideOpen] = useState(!compact);
  const [notes, setNotes] = useState(lead.notes ?? "");

  const replied = !!lead.repliedAt;
  const hasNotes = !!lead.notes?.trim();

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function saveNotes() {
    if ((notes.trim() || "") === (lead.notes?.trim() ?? "")) return; // no-op
    run(() => setLeadNotes(lead.id, notes));
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Outreach channels — click logs/updates the last touch (channel + now). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-bone-mute uppercase tracking-wide font-mono mr-0.5">Reached out</span>
        {OUTREACH_CHANNELS.map((ch) => (
          <Pill
            key={ch}
            on={lead.touchChannel === ch}
            disabled={isPending}
            onClick={() => run(() => logLeadOutreach(lead.id, ch))}
            title={`Log outreach via ${CHANNEL_LABEL[ch]}`}
          >
            {CHANNEL_LABEL[ch]}
          </Pill>
        ))}
      </div>

      {/* Last-touch stamp + replied toggle. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {lead.touchAt && (
          <span className="text-[10px] text-bone-mute">
            {lead.touchChannel ? `${CHANNEL_LABEL[lead.touchChannel]} · ` : ""}
            {formatDate(lead.touchAt)}
          </span>
        )}
        <Pill
          on={replied}
          disabled={isPending}
          onClick={() => run(() => markLeadReplied(lead.id, !replied))}
          title={replied ? "Clear the reply flag" : "Mark as replied"}
        >
          <Reply size={11} strokeWidth={1.5} />
          {replied ? `Replied · ${lead.repliedAt ? formatDate(lead.repliedAt) : ""}` : "Mark replied"}
        </Pill>
      </div>

      {/* Notes — toggle on the card, always-open on the detail page. */}
      {compact && !notesOpen ? (
        <Pill on={hasNotes} disabled={isPending} onClick={() => setNotesOpen(true)} title="Add a note">
          <MessageSquare size={11} strokeWidth={1.5} />
          {hasNotes ? "Notes ●" : "Add note"}
        </Pill>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Working notes — context, next step, who introduced you…"
            rows={compact ? 2 : 3}
            disabled={isPending}
            className="text-[12px]"
          />
          <div className="flex items-center gap-2">
            <Pill disabled={isPending} onClick={saveNotes} title="Save notes">
              <CheckCircle2 size={11} strokeWidth={1.5} />
              {isPending ? "Saving…" : "Save note"}
            </Pill>
          </div>
        </div>
      )}

      {/* Set aside — 3 preset reasons (parks the lead into the Set-aside lane). */}
      {compact && !setAsideOpen ? (
        <Pill disabled={isPending} onClick={() => setSetAsideOpen(true)} title="Set this lead aside">
          <Archive size={11} strokeWidth={1.5} />
          Set aside
        </Pill>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-bone-mute uppercase tracking-wide font-mono mr-0.5">Set aside</span>
          {DISMISS_REASONS.map((reason) => (
            <Pill
              key={reason}
              disabled={isPending}
              onClick={() => run(() => declineLead(lead.id, { reason }))}
              title={`Set aside — ${reason}`}
            >
              {reason}
            </Pill>
          ))}
        </div>
      )}

      {err && (
        <span className="flex items-center gap-1 text-[11px] text-flag-red">
          <ShieldAlert size={11} strokeWidth={1.5} />
          {err}
        </span>
      )}
    </div>
  );
}
