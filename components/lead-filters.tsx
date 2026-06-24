"use client";

// LeadFilters — a shared client-side filter bar for the prospect-lead lists
// (AI Found Leads + Promoted Leads). Filters by a free-text term (name / domain /
// industry tag / HQ), industry tag, who surfaced the lead (createdBy), and who's
// claimed it (claimedBy, plus an "Unclaimed" option). Option lists are derived
// from the lead set passed in, so dropdowns only show values that actually exist.
//
// Stateless on its own: the parent owns the filter value and applies
// leadMatchesFilter() to its lists. No server round-trip — leads are already
// loaded client-side.

import { useMemo } from "react";
import { X } from "lucide-react";
import { Select, SearchInput } from "@/components/ui";
import type { ProspectLead } from "@/lib/types";

export type LeadFilterState = {
  /** Free-text term matched against name / domain / industry tags / HQ. */
  q: string;
  /** Exact industry tag, or "" for all. */
  industry: string;
  /** Exact createdBy (who surfaced), or "" for all. */
  surfacedBy: string;
  /** Exact claimedBy, "__unclaimed" for unclaimed only, or "" for all. */
  claimedBy: string;
};

export const EMPTY_LEAD_FILTER: LeadFilterState = {
  q: "",
  industry: "",
  surfacedBy: "",
  claimedBy: "",
};

export function isLeadFilterActive(f: LeadFilterState): boolean {
  return !!(f.q.trim() || f.industry || f.surfacedBy || f.claimedBy);
}

export function leadMatchesFilter(l: ProspectLead, f: LeadFilterState): boolean {
  if (f.industry && !l.industryTags.includes(f.industry)) return false;
  if (f.surfacedBy && l.createdBy !== f.surfacedBy) return false;
  if (f.claimedBy) {
    if (f.claimedBy === "__unclaimed") {
      if (l.claimedBy) return false;
    } else if (l.claimedBy !== f.claimedBy) {
      return false;
    }
  }
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = `${l.companyName} ${l.domain} ${l.headquarters ?? ""} ${l.industryTags.join(" ")}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  extra = [],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  extra?: { value: string; label: string }[];
}) {
  return (
    <div className="w-40 shrink-0">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}</option>
        {extra.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function LeadFilters({
  leads,
  value,
  onChange,
}: {
  leads: ProspectLead[];
  value: LeadFilterState;
  onChange: (next: LeadFilterState) => void;
}) {
  const { industries, surfacers, claimers } = useMemo(() => {
    const ind = new Set<string>();
    const surf = new Set<string>();
    const clm = new Set<string>();
    for (const l of leads) {
      l.industryTags.forEach((t) => t && ind.add(t));
      if (l.createdBy) surf.add(l.createdBy);
      if (l.claimedBy) clm.add(l.claimedBy);
    }
    const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { industries: sorted(ind), surfacers: sorted(surf), claimers: sorted(clm) };
  }, [leads]);

  const set = (patch: Partial<LeadFilterState>) => onChange({ ...value, ...patch });
  const active = isLeadFilterActive(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:w-60">
        <SearchInput
          placeholder="Search name or term…"
          value={value.q}
          onChange={(e) => set({ q: e.target.value })}
        />
      </div>
      {industries.length > 0 && (
        <FilterSelect label="All industries" value={value.industry} onChange={(v) => set({ industry: v })} options={industries} />
      )}
      {surfacers.length > 0 && (
        <FilterSelect label="Anyone surfaced" value={value.surfacedBy} onChange={(v) => set({ surfacedBy: v })} options={surfacers} />
      )}
      <FilterSelect
        label="Any claim"
        value={value.claimedBy}
        onChange={(v) => set({ claimedBy: v })}
        options={claimers}
        extra={[{ value: "__unclaimed", label: "Unclaimed" }]}
      />
      {active && (
        <button
          onClick={() => onChange(EMPTY_LEAD_FILTER)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-graphite-2 bg-asphalt text-bone-mute hover:text-track-gold hover:border-track-gold/40 font-mono text-[9px] uppercase tracking-wide rounded-[var(--radius-pill)] transition-colors"
        >
          <X size={11} strokeWidth={1.5} />
          Clear
        </button>
      )}
    </div>
  );
}
