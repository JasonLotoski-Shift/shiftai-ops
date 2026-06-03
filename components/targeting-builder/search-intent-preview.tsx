"use client";

import { Label } from "@/components/ui";

export type IntentState = {
  industries: string[];
  geographies: string[];
  priorityLocation: string | null;
  revenueMin: string;
  revenueMax: string;
  employeeMin: string;
  employeeMax: string;
  personas: { department: string; seniority: string }[];
};

// Compact money abbreviation: 25_000_000 → "$25M", 1_000_000_000 → "$1B".
function abbreviate(n: number): string {
  if (n >= 1_000_000_000) return `$${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${trim(n / 1_000)}K`;
  return `$${n}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function moneyBand(min: string, max: string): string | null {
  const a = num(min);
  const b = num(max);
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return `${abbreviate(a)}–${abbreviate(b)} revenue`;
  if (a !== null) return `${abbreviate(a)}+ revenue`;
  return `up to ${abbreviate(b as number)} revenue`;
}

function countBand(min: string, max: string): string | null {
  const a = num(min);
  const b = num(max);
  const fmt = (x: number) => x.toLocaleString();
  if (a === null && b === null) return null;
  if (a !== null && b !== null) return `${fmt(a)}–${fmt(b)} employees`;
  if (a !== null) return `${fmt(a)}+ employees`;
  return `up to ${fmt(b as number)} employees`;
}

// Pure composer — plain-English sentence from the current form state.
export function buildIntent(state: IntentState): string {
  const parts: string[] = [];

  if (state.industries.length) {
    const head = state.industries[0];
    const more = state.industries.length - 1;
    parts.push(`${head}${more > 0 ? ` (+${more} more)` : ""} companies`);
  } else {
    parts.push("companies");
  }

  const primaryGeo = state.priorityLocation ?? state.geographies[0];
  if (primaryGeo) {
    const more = state.geographies.length - 1;
    parts.push(`in ${primaryGeo}${more > 0 ? ` (+${more} more)` : ""}`);
  }

  const clauses: string[] = [];
  const rev = moneyBand(state.revenueMin, state.revenueMax);
  if (rev) clauses.push(rev);
  const emp = countBand(state.employeeMin, state.employeeMax);
  if (emp) clauses.push(emp);

  let sentence = `Hunting ${parts.join(" ")}`;
  if (clauses.length) sentence += `, ${clauses.join(", ")}`;

  if (state.personas.length) {
    const labels = state.personas
      .filter((p) => p.department && p.seniority)
      .map((p) => `${p.seniority} ${p.department}`);
    if (labels.length) {
      const shown = labels.slice(0, 3).join(" & ");
      const more = labels.length - Math.min(labels.length, 3);
      sentence += `, targeting ${shown}${more > 0 ? ` & ${more} more` : ""}`;
    }
  }

  return `${sentence}.`;
}

export function SearchIntentPreview({ state }: { state: IntentState }) {
  const hasAnything =
    state.industries.length ||
    state.geographies.length ||
    num(state.revenueMin) !== null ||
    num(state.revenueMax) !== null ||
    num(state.employeeMin) !== null ||
    num(state.employeeMax) !== null ||
    state.personas.some((p) => p.department && p.seniority);

  return (
    <div className="rounded-[var(--radius)] border border-track-gold/20 bg-track-gold-dim/5 px-4 py-3 flex flex-col gap-1.5">
      <Label gold>Search intent</Label>
      <p className="text-[13px] text-bone-dim leading-relaxed">
        {hasAnything ? buildIntent(state) : "Define a segment to preview the search."}
      </p>
    </div>
  );
}
