"use client";

// Apollo credits box (PART E) — compact, on-palette usage meter for the Targeting
// page. Shows "<used> / 2150 emails revealed this month — ~<remaining> left" with
// a thin progress bar. Collapsible to stay out of the way. The count is reveals
// made THROUGH THIS APP (discovery + the per-person Reveal button) — it does not
// see reveals made directly in the Apollo web UI.

import { useState } from "react";
import { KeyRound, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApolloCreditUsage } from "@/lib/apollo-credits";

export function ApolloCreditsBox({ usage }: { usage: ApolloCreditUsage }) {
  const [open, setOpen] = useState(true);
  const pct = usage.total > 0 ? Math.min(100, Math.round((usage.used / usage.total) * 100)) : 0;
  const low = usage.remaining <= usage.total * 0.1;

  return (
    <div className="border border-graphite/60 bg-bitumen/40 rounded-[var(--radius)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <KeyRound size={13} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <span className="mono text-[9px] uppercase tracking-[0.12em] text-bone-dim">Apollo credits</span>
          <span className="text-[12px] text-bone tabular-nums">
            {usage.used.toLocaleString()} / {usage.total.toLocaleString()}
          </span>
          <span className={cn("text-[11px] tabular-nums", low ? "text-flag-red" : "text-bone-mute")}>
            ~{usage.remaining.toLocaleString()} left
          </span>
        </div>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn("text-bone-mute transition-transform shrink-0", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <div className="h-1.5 w-full rounded-full bg-graphite overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", low ? "bg-flag-red" : "bg-track-gold")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[11px] text-bone-mute leading-relaxed">
            Emails revealed this month through this app (discovery runs + the Reveal-email button).
            Reveals made directly in the Apollo web app aren&apos;t counted here.
          </span>
        </div>
      )}
    </div>
  );
}
