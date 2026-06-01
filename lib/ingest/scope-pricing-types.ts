// Scope-pricing ingest — types for parsing a project scoping document down to
// ONLY its pricing / hours / cost breakdown. Stored in IngestProposal.proposal
// (Json) with ingestType "scope-pricing". Rates are CENTS to match the
// economics model; unknown pay rate is null (the server fills the roster
// default at approval).

export const SCOPE_PRICING_INGEST_TYPE = "scope-pricing" as const;

export type ScopePricingLine = {
  role: string;
  // Name the model read off the doc; the UI/server maps it to a roster
  // consultantId by case-insensitive match (null when no match).
  consultantHint: string | null;
  hours: number;
  payRateCents: number | null; // null → fill from roster default on approve
  billRateCents: number;
  isExtra: boolean;
};

export type ScopePricingProposal = {
  schemaVersion: 1;
  ingestType: typeof SCOPE_PRICING_INGEST_TYPE;
  total: number | null; // the doc's stated total (whole CAD), if any
  lines: ScopePricingLine[];
  notes: string[]; // anything uncertain / [NEEDS INPUT]
};

export function isScopePricingProposal(v: unknown): v is ScopePricingProposal {
  return (
    !!v &&
    typeof v === "object" &&
    (v as ScopePricingProposal).ingestType === SCOPE_PRICING_INGEST_TYPE &&
    Array.isArray((v as ScopePricingProposal).lines)
  );
}

// One approved line, as the review UI hands it to approveScopePricing.
export type ApprovedScopeLine = {
  role: string;
  consultantId: string | null;
  hours: number;
  payRateCents: number | null;
  billRateCents: number;
  isExtra: boolean;
};

export type ApproveScopePricingSelections = {
  lines: ApprovedScopeLine[];
  generateSchedule: boolean;
  scheduleValue: number | null; // defaults to total / summed billable when null
};
