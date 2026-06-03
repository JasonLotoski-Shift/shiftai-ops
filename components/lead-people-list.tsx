"use client";

// Candidate people list with per-row "Reveal email" buttons (PART D).
//
// A contact whose email is null gets a "Reveal email" button that spends 1 Apollo
// credit (revealLeadPersonEmail). On success the revealed email replaces the
// button; on an out-of-credits error a friendly inline message shows. Already-
// revealed contacts render their mailto link as before. Extracted to a client
// child so the lead detail page stays a server component.

import { useState, useTransition } from "react";
import { Mail, Linkedin, KeyRound } from "lucide-react";
import { revealLeadPersonEmail } from "@/app/(app)/pipeline/leads/actions";
import type { ProspectPerson } from "@/lib/types";

export function LeadPeopleList({
  leadId,
  people,
  canReveal,
}: {
  leadId: string;
  people: ProspectPerson[];
  /** Reveal is offered only while the lead is actionable (pending/added). */
  canReveal: boolean;
}) {
  // Local overlay of revealed emails so the row updates without a full reload.
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function reveal(i: number) {
    setErrors((e) => ({ ...e, [i]: "" }));
    setPendingIndex(i);
    startTransition(async () => {
      try {
        const { email } = await revealLeadPersonEmail(leadId, i);
        setRevealed((r) => ({ ...r, [i]: email }));
      } catch (err) {
        setErrors((e) => ({ ...e, [i]: err instanceof Error ? err.message : "Reveal failed" }));
      } finally {
        setPendingIndex(null);
      }
    });
  }

  if (people.length === 0) {
    return <span className="text-[13px] text-bone-mute">No people found.</span>;
  }

  return (
    <div className="flex flex-col divide-y divide-graphite">
      {people.map((p, i) => {
        const email = p.email?.trim() || revealed[i];
        const err = errors[i];
        const isPending = pendingIndex === i;
        return (
          <div key={i} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] text-bone truncate">{p.name}</span>
              <span className="text-[12px] text-bone-mute truncate">{p.title}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {email ? (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1 text-[12px] text-bone-dim hover:text-track-gold"
                >
                  <Mail size={12} strokeWidth={1.5} />
                  {email}
                </a>
              ) : canReveal ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => reveal(i)}
                    disabled={isPending}
                    title="Reveals this person's work email — spends 1 Apollo credit"
                    className="mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 rounded-[var(--radius-sm)] border border-track-gold/30 text-track-gold/90 bg-track-gold-dim/5 hover:bg-track-gold-dim/10 flex items-center gap-1.5 transition-colors disabled:opacity-60"
                  >
                    <KeyRound size={11} strokeWidth={1.5} />
                    {isPending ? "Revealing…" : "Reveal email"}
                  </button>
                  {err && <span className="text-[11px] text-flag-red text-right max-w-[200px]">{err}</span>}
                </div>
              ) : (
                <span className="text-[12px] text-bone-mute">—</span>
              )}
              {p.linkedin && (
                <a
                  href={p.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[12px] text-bone-dim hover:text-track-gold"
                >
                  <Linkedin size={12} strokeWidth={1.5} />
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
