"use client";

// ClientsList — the Clients table + lightweight vertical / sub-industry filter
// chips. Client child so the page stays a server component (it queries Prisma
// and passes typed rows; filtering is local state). Mirrors ContactsList.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Avatar } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatCAD } from "@/lib/format";
import { industryLabels, INDUSTRY_VERTICALS } from "@/lib/industries";
import type { Industry, EngagementStatus } from "@/lib/types";

export type ClientRow = {
  id: string;
  company: string;
  industry: Industry;
  subIndustry: string | null;
  revenue: string;
  contractValue: number;
  status: EngagementStatus;
  activeProjects: number;
  partnerLeadInitials: string;
  partnerLeadFirstName: string;
};

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const [vertical, setVertical] = useState<Industry | "all">("all");
  const [sub, setSub] = useState<string | "all">("all");

  const verticalsPresent = useMemo(() => {
    const seen = new Set(clients.map((c) => c.industry));
    return INDUSTRY_VERTICALS.filter((v) => seen.has(v));
  }, [clients]);

  const subsPresent = useMemo(() => {
    if (vertical === "all") return [];
    const seen = new Set<string>();
    for (const c of clients) {
      if (c.industry === vertical && c.subIndustry) seen.add(c.subIndustry);
    }
    return [...seen].sort();
  }, [clients, vertical]);

  const shown = useMemo(() => {
    return clients.filter((c) => {
      if (vertical !== "all" && c.industry !== vertical) return false;
      if (sub !== "all" && c.subIndustry !== sub) return false;
      return true;
    });
  }, [clients, vertical, sub]);

  function pickVertical(v: Industry | "all") {
    setVertical(v);
    setSub("all");
  }

  return (
    <div className="flex flex-col">
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

      {subsPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3 pt-1">
          <span className="text-[10px] text-bone-mute uppercase tracking-wide self-center mr-1">Sub</span>
          <FilterChip label="All" active={sub === "all"} onClick={() => setSub("all")} small />
          {subsPresent.map((s) => (
            <FilterChip key={s} label={s} active={sub === s} onClick={() => setSub(s)} small />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3">
        <span className="text-[11px] text-bone-dim">Client</span>
        <span className="text-[11px] text-bone-dim">Industry</span>
        <span className="text-[11px] text-bone-dim">Revenue</span>
        <span className="text-[11px] text-bone-dim">Contract</span>
        <span className="text-[11px] text-bone-dim">Partner lead</span>
        <span className="text-[11px] text-bone-dim text-right">Status</span>
      </div>

      {shown.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-bone-mute">
          No clients match this filter.
        </div>
      ) : (
        shown.map((c) => (
          <Link
            key={c.id}
            href={`/clients/${c.id}`}
            className="grid grid-cols-[2fr_1.4fr_1fr_1fr_1fr_120px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[14px] text-bone truncate">{c.company}</span>
              <span className="text-[11px] text-bone-mute truncate">
                {c.activeProjects} active project{c.activeProjects !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="self-center flex items-center gap-2 min-w-0">
              <Badge tone="bone">{industryLabels[c.industry]}</Badge>
              {c.subIndustry && (
                <span className="text-[11px] text-bone-mute truncate">{c.subIndustry}</span>
              )}
            </div>
            <span className="mono text-[13px] text-bone-dim tabular-nums self-center">{c.revenue}</span>
            <span className="mono text-[13px] text-track-gold tabular-nums self-center">
              {formatCAD(c.contractValue).replace("CA$", "$")}
            </span>
            <div className="flex items-center gap-2 self-center">
              <Avatar initials={c.partnerLeadInitials} size="sm" />
              <span className="text-[12px] text-bone-dim truncate">{c.partnerLeadFirstName}</span>
            </div>
            <div className="flex justify-end self-center">
              <Badge
                tone={
                  c.status === "on-track"
                    ? "steel"
                    : c.status === "at-risk"
                      ? "gold"
                      : c.status === "blocked"
                        ? "red"
                        : "neutral"
                }
              >
                {c.status}
              </Badge>
            </div>
          </Link>
        ))
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
