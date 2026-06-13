"use client";

// ContactsList — the Contacts table + lightweight vertical / sub-industry
// filter chips. Kept a client child so the page stays a server component:
// the page queries Prisma and hands typed rows down; filtering is local state.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { daysSince } from "@/lib/format";
import { industryLabels, INDUSTRY_VERTICALS } from "@/lib/industries";
import type { Industry } from "@/lib/types";

export type ContactRow = {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: Industry;
  subIndustry: string | null;
  lastTouchAt: string; // ISO
  partnerLeadInitials: string;
  partnerLeadFirstName: string;
};

export function ContactsList({ contacts }: { contacts: ContactRow[] }) {
  const [vertical, setVertical] = useState<Industry | "all">("all");
  const [sub, setSub] = useState<string | "all">("all");

  // Verticals actually present, in the firm's beachhead order.
  const verticalsPresent = useMemo(() => {
    const seen = new Set(contacts.map((c) => c.industry));
    return INDUSTRY_VERTICALS.filter((v) => seen.has(v));
  }, [contacts]);

  // Sub-industries present for the chosen vertical (chips only show when a
  // single vertical is selected — they're a refinement of it).
  const subsPresent = useMemo(() => {
    if (vertical === "all") return [];
    const seen = new Set<string>();
    for (const c of contacts) {
      if (c.industry === vertical && c.subIndustry) seen.add(c.subIndustry);
    }
    return [...seen].sort();
  }, [contacts, vertical]);

  const shown = useMemo(() => {
    return contacts.filter((c) => {
      if (vertical !== "all" && c.industry !== vertical) return false;
      if (sub !== "all" && c.subIndustry !== sub) return false;
      return true;
    });
  }, [contacts, vertical, sub]);

  function pickVertical(v: Industry | "all") {
    setVertical(v);
    setSub("all"); // sub-filter is scoped to a vertical — reset on change
  }

  return (
    <div className="flex flex-col">
      {/* Vertical filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-4 pb-1">
        <FilterChip label="All" active={vertical === "all"} onClick={() => pickVertical("all")} />
        {verticalsPresent.map((v) => (
          <FilterChip
            key={v}
            label={industryLabels[v]}
            active={vertical === v}
            onClick={() => pickVertical(v)}
          />
        ))}
      </div>

      {/* Sub-industry refinement chips — only when a vertical is chosen and it
          has sub-industries on record. */}
      {subsPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3 pt-1">
          <span className="text-[10px] text-bone-mute uppercase tracking-wide self-center mr-1">Sub</span>
          <FilterChip label="All" active={sub === "all"} onClick={() => setSub("all")} small />
          {subsPresent.map((s) => (
            <FilterChip key={s} label={s} active={sub === s} onClick={() => setSub(s)} small />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[2fr_2fr_1.4fr_1fr_120px] gap-4 px-5 py-3">
        <span className="text-[11px] text-bone-dim">Contact</span>
        <span className="text-[11px] text-bone-dim">Company</span>
        <span className="text-[11px] text-bone-dim">Industry</span>
        <span className="text-[11px] text-bone-dim">Partner lead</span>
        <span className="text-[11px] text-bone-dim text-right">Last touch</span>
      </div>

      {shown.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-bone-mute">
          No contacts match this filter.
        </div>
      ) : (
        shown.map((c) => {
          const stale = daysSince(c.lastTouchAt) > 30;
          return (
            <Link
              key={c.id}
              href={`/contacts/${c.id}`}
              className="grid grid-cols-[2fr_2fr_1.4fr_1fr_120px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[14px] text-bone truncate">{c.name}</span>
                <span className="text-[11px] text-bone-mute truncate">{c.title}</span>
              </div>
              <span className="text-[13px] text-bone-dim truncate self-center">{c.company}</span>
              <div className="self-center flex items-center gap-2 min-w-0">
                <Badge tone="bone">{industryLabels[c.industry]}</Badge>
                {c.subIndustry && (
                  <span className="text-[11px] text-bone-mute truncate">{c.subIndustry}</span>
                )}
              </div>
              <div className="flex items-center gap-2 self-center">
                <Avatar initials={c.partnerLeadInitials} size="sm" />
                <span className="text-[12px] text-bone-dim truncate">{c.partnerLeadFirstName}</span>
              </div>
              <div className="text-right self-center">
                <div className={`mono text-[12px] tabular-nums ${stale ? "text-flag-red" : "text-bone-dim"}`}>
                  {daysSince(c.lastTouchAt)}d ago
                </div>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  small,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-pill)] border transition-colors",
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        active
          ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
          : "border-graphite-2 text-bone-mute hover:text-bone-dim",
      )}
    >
      {label}
    </button>
  );
}
