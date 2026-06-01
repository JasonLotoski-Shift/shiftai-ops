// Parse the model's raw output into a ScopePricingProposal. Tolerant of code
// fences / stray prose (same slice approach as lib/ingest/parse.ts). Coerces
// numbers, clamps negatives, drops lines missing a role or hours. Rates arrive
// in CENTS from the skill.

import type { ScopePricingLine, ScopePricingProposal } from "@/lib/ingest/scope-pricing-types";
import { SCOPE_PRICING_INGEST_TYPE } from "@/lib/ingest/scope-pricing-types";

function sliceJSON(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Scope extraction returned malformed output — try again.");
  }
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Coerce a numeric field that may arrive as a number or a money-ish string
// ("$15,000" / "150"). Returns null when not parseable.
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.\-]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const objArr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

const strArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];

function parseLines(v: unknown): ScopePricingLine[] {
  return objArr(v)
    .map((l): ScopePricingLine | null => {
      const role = str(l.role);
      const hours = num(l.hours);
      if (!role || hours === null) return null; // need at least a role + hours
      const pay = num(l.payRateCents);
      const bill = num(l.billRateCents);
      return {
        role,
        consultantHint: str(l.consultantHint) || null,
        hours: Math.max(0, hours),
        payRateCents: pay === null ? null : Math.max(0, Math.round(pay)),
        billRateCents: bill === null ? 0 : Math.max(0, Math.round(bill)),
        isExtra: l.isExtra === true,
      };
    })
    .filter((l): l is ScopePricingLine => l !== null);
}

export function parseScopePricing(raw: string): ScopePricingProposal {
  const o = sliceJSON(raw);
  const total = num(o.total);
  return {
    schemaVersion: 1,
    ingestType: SCOPE_PRICING_INGEST_TYPE,
    total: total === null ? null : Math.max(0, Math.round(total)),
    lines: parseLines(o.lines),
    notes: strArr(o.notes),
  };
}
