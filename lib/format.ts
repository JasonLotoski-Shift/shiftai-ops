// Pure formatters. Moved out of lib/data/seed.ts so server-component code
// can import them without pulling the fixture data along.

export function formatCAD(n: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

// A deal's heading. Uses the custom `name` when set, else falls back to the
// `company` (the historical "auto-assigned" label). Single fallback point so
// every heading stays consistent — `company` keeps showing as the company field.
export function dealLabel(deal: { name?: string | null; company: string }): string {
  return deal.name?.trim() || deal.company;
}

export function daysSince(d: string | Date) {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Pipeline staleness: a deal turns a color the longer it sits in one stage.
// Steps every STAGE_AGE_STEP_DAYS — green (fresh) → orange (warming) → red (stale).
export const STAGE_AGE_STEP_DAYS = 14;

export type StageAgeTier = "fresh" | "warming" | "stale";

export function stageAgeTier(stageEnteredAt: string | Date): StageAgeTier {
  const days = daysSince(stageEnteredAt);
  if (days < STAGE_AGE_STEP_DAYS) return "fresh"; // 0–13d
  if (days < STAGE_AGE_STEP_DAYS * 2) return "warming"; // 14–27d
  return "stale"; // 28d+
}
