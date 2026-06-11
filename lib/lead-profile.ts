/**
 * Pure profile-apply + positioning-parse helpers for prospect leads.
 *
 * The lead-side equivalent of the deal company-enrichment apply logic in
 * `app/(app)/pipeline/[id]/actions.ts` — same non-destructive merge semantics
 * (set scalars only when empty, append lists with case-insensitive dedupe,
 * coerce int columns), with two lead-specific differences:
 *   - the deal `employeeCount` concept maps onto the lead's `employeeEstimate`;
 *   - we NEVER emit a `domain` key — a lead's domain is its unique key, managed
 *     by enrichLead, not by this profile apply.
 *
 * No prisma import: this module is import-light so its tests run without env.
 */

export const LEAD_ENRICH_SCALAR_FIELDS = [
  "website",
  "companySize",
  "headquarters",
  "founded",
  "ownership",
  "description",
  "linkedinUrl",
  "instagramUrl",
  "subIndustry",
] as const;
// Int columns — string proposals are coerced before merging. The deal's
// `employeeCount` field name is accepted on input but written to `employeeEstimate`.
export const LEAD_ENRICH_INT_FIELDS = ["revenueEstimate", "employeeCount"] as const;
export const LEAD_ENRICH_LIST_FIELDS = ["companyKeyFacts", "currentSystems", "painPoints"] as const;

type LeadEnrichScalarField = (typeof LEAD_ENRICH_SCALAR_FIELDS)[number];
type LeadEnrichIntField = (typeof LEAD_ENRICH_INT_FIELDS)[number];
type LeadEnrichListField = (typeof LEAD_ENRICH_LIST_FIELDS)[number];
type LeadEnrichField = LeadEnrichScalarField | LeadEnrichIntField | LeadEnrichListField;

const ALL_LEAD_ENRICH_FIELDS: string[] = [
  ...LEAD_ENRICH_SCALAR_FIELDS,
  ...LEAD_ENRICH_INT_FIELDS,
  ...LEAD_ENRICH_LIST_FIELDS,
];

function isLeadEnrichField(f: unknown): f is LeadEnrichField {
  return typeof f === "string" && ALL_LEAD_ENRICH_FIELDS.includes(f);
}

export type EnrichAddition = { field: string; value: string };
export type EnrichConflict = { field: string; existing: string; proposed: string; note?: string };

// The snapshot the apply reads — a plain projection of the ProspectLead row.
// `employeeEstimate` is the lead's column for the deal's `employeeCount` concept.
export type LeadProfileSnapshot = {
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  companySize: string | null;
  headquarters: string | null;
  founded: string | null;
  ownership: string | null;
  description: string | null;
  subIndustry: string | null;
  revenueEstimate: number | null;
  employeeEstimate: number | null;
  currentSystems: string[];
  painPoints: string[];
  companyKeyFacts: string[];
};

export type Positioning = { fitSummary: string; likelyNeeds: string[]; salesAngle: string };

/**
 * Coerce a proposed value for an Int column to a whole number. Copied verbatim
 * from the module-private `coerceEnrichInt` in the deal actions so the two
 * apply paths stay byte-for-byte identical. Strips a "(source: …)" tag plus
 * $/commas/"~", then accepts exactly ONE number — optionally suffixed
 * "12M" / "1.2B" / "12 million" style. Ranges or multi-number strings are
 * ambiguous → null (caller skips the addition).
 */
function coerceEnrichInt(raw: string): number | null {
  const cleaned = raw.replace(/\([^)]*\)/g, " ").replace(/[~$,]/g, "");
  const tokens = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/gi)];
  if (tokens.length !== 1) return null;
  const n = Number(tokens[0][1]);
  if (!Number.isFinite(n)) return null;
  const suffix = tokens[0][2]?.toLowerCase();
  const mult =
    !suffix ? 1
    : suffix.startsWith("k") || suffix === "thousand" ? 1_000
    : suffix.startsWith("m") ? 1_000_000
    : 1_000_000_000;
  const value = Math.round(n * mult);
  return value > 0 ? value : null;
}

/**
 * Fence-strip then brace-extract then JSON.parse (the `parseRating` style in
 * lib/lead-enrich.ts). Unlike the deal parser, malformed output is lenient:
 * junk → empty arrays rather than a throw, so a flaky enrich step degrades
 * gracefully instead of failing the whole pass.
 */
export function parseEnrichmentJSON(raw: string): {
  additions: EnrichAddition[];
  conflicts: EnrichConflict[];
} {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { additions: [], conflicts: [] };
  }
  const o = obj as { additions?: unknown; conflicts?: unknown };

  const additions: EnrichAddition[] = Array.isArray(o.additions)
    ? o.additions
        .filter(
          (a): a is { field: string; value: string } =>
            !!a &&
            typeof a === "object" &&
            isLeadEnrichField((a as { field?: unknown }).field) &&
            typeof (a as { value?: unknown }).value === "string" &&
            (a as { value: string }).value.trim().length > 0,
        )
        .map((a) => ({ field: a.field, value: a.value.trim() }))
    : [];

  const conflicts: EnrichConflict[] = Array.isArray(o.conflicts)
    ? o.conflicts
        .filter(
          (c): c is EnrichConflict =>
            !!c &&
            typeof c === "object" &&
            typeof (c as { field?: unknown }).field === "string" &&
            typeof (c as { existing?: unknown }).existing === "string" &&
            typeof (c as { proposed?: unknown }).proposed === "string",
        )
        .map((c) => ({
          field: c.field,
          existing: c.existing,
          proposed: c.proposed,
          note: typeof c.note === "string" ? c.note : undefined,
        }))
    : [];

  return { additions, conflicts };
}

/**
 * Non-destructive merge of enrichment additions onto a lead snapshot.
 * Mirrors `applyDealCompanyEnrichment`'s body exactly: set scalar fields only
 * if currently empty (never overwrite — that's a conflict resolved by hand),
 * append list facts with case-insensitive dedupe, coerce int scalars (skip the
 * unparseable). `employeeCount` writes to the `employeeEstimate` key. Returns
 * `data` containing ONLY changed keys; never a `domain` key.
 */
export function applyLeadEnrichment(
  lead: LeadProfileSnapshot,
  additions: EnrichAddition[],
): { data: Record<string, unknown>; applied: number; skipped: number } {
  const clean = (additions ?? []).filter((a) => isLeadEnrichField(a?.field) && a.value?.trim());

  const data: Record<string, unknown> = {};
  const lists: Record<LeadEnrichListField, string[]> = {
    companyKeyFacts: [...lead.companyKeyFacts],
    currentSystems: [...lead.currentSystems],
    painPoints: [...lead.painPoints],
  };
  let applied = 0;
  let skipped = 0;

  for (const a of clean) {
    if ((LEAD_ENRICH_LIST_FIELDS as readonly string[]).includes(a.field)) {
      const arr = lists[a.field as LeadEnrichListField];
      const exists = arr.some((v) => v.toLowerCase() === a.value.toLowerCase());
      if (!exists) {
        arr.push(a.value);
        applied++;
      } else {
        skipped++;
      }
    } else if ((LEAD_ENRICH_INT_FIELDS as readonly string[]).includes(a.field)) {
      // `employeeCount` (deal field name) → the lead's `employeeEstimate` column.
      const targetKey = a.field === "employeeCount" ? "employeeEstimate" : "revenueEstimate";
      const current = a.field === "employeeCount" ? lead.employeeEstimate : lead.revenueEstimate;
      const value = coerceEnrichInt(a.value);
      if (value !== null && current === null) {
        data[targetKey] = value;
        applied++;
      } else {
        skipped++;
      }
    } else {
      const f = a.field as Exclude<LeadEnrichScalarField, never>;
      const current = lead[f];
      if (!current || !current.trim()) {
        // URL fields land as the bare value — drop the trailing source tag.
        const isUrlField = f === "website" || f === "linkedinUrl" || f === "instagramUrl";
        const value = isUrlField ? a.value.replace(/\s*\(.*$/, "").trim() : a.value;
        if (!value) {
          skipped++;
          continue;
        }
        data[f] = value;
        applied++;
        // Note: unlike the deal apply, we never derive/emit `domain` here.
      } else {
        skipped++;
      }
    }
  }

  for (const lf of LEAD_ENRICH_LIST_FIELDS) {
    if (lists[lf].length !== lead[lf].length) data[lf] = lists[lf];
  }

  return { data, applied, skipped };
}

/**
 * Parse the lead-positioning skill output into `{fitSummary, likelyNeeds,
 * salesAngle}`. Fence-strip → brace-extract → JSON.parse (lenient). Strings are
 * trimmed; likelyNeeds keeps up to 5 non-empty strings. Junk or all-empty → null.
 */
export function parsePositioning(raw: string): Positioning | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  const o = obj as { fitSummary?: unknown; likelyNeeds?: unknown; salesAngle?: unknown };

  const fitSummary = typeof o.fitSummary === "string" ? o.fitSummary.trim() : "";
  const salesAngle = typeof o.salesAngle === "string" ? o.salesAngle.trim() : "";
  const likelyNeeds = Array.isArray(o.likelyNeeds)
    ? o.likelyNeeds
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim())
        .slice(0, 5)
    : [];

  if (!fitSummary && !salesAngle && likelyNeeds.length === 0) return null;
  return { fitSummary, likelyNeeds, salesAngle };
}
