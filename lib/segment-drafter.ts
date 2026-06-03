// draftSegment() — the "✨ Draft with Claude" brain behind the Targeting
// segment builder.
//
// Takes a segment name + a short free-text brief (plus optional CURRENT form
// values for refine mode) and returns a FULL structured ICP segment that
// populates the editable builder form. Nothing is persisted here — the partner
// reviews the filled form and clicks the existing Save.
//
// Plain async function (NO "use server") so it can be unit-tested via tsx and
// imported by the server action. It transitively imports lib/ai.ts (reads the
// API key), so only ever import this from server code — never a client bundle.

import { generate } from "@/lib/ai";
import { DEPARTMENTS, SENIORITIES } from "@/lib/data/apollo-taxonomy";

// ── Public types ─────────────────────────────────────────────────────────────
export type DraftPersona = { department: string; seniority: string };
export type DraftAnchor = { name: string; domain: string };

/** The live builder form values, passed in for refine mode. All optional. */
export type CurrentSegmentValues = {
  description?: string;
  industries?: string[];
  revenueMin?: string | number | null;
  revenueMax?: string | number | null;
  employeeMin?: string | number | null;
  employeeMax?: string | number | null;
  geographies?: string[];
  priorityLocation?: string | null;
  personas?: DraftPersona[];
  buyingSignals?: string[];
  disqualifiers?: string[];
  anchors?: { name: string; domain?: string }[];
};

/** The validated draft — already save-clean (mirrors dataFromInput's invariants). */
export type DraftResult = {
  description: string;
  industries: string[];
  revenueMin: number | null;
  revenueMax: number | null;
  employeeMin: number | null;
  employeeMax: number | null;
  geographies: string[];
  priorityLocation: string | null;
  personas: DraftPersona[];
  buyingSignals: string[];
  disqualifiers: string[];
  anchors: DraftAnchor[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Trim, drop blanks, dedupe case-insensitively. Mirrors cleanTags in actions.ts.
export function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

// Accept number or numeric string, floor to int. Empty/NaN/null → null.
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isNaN(n) ? null : Math.trunc(n);
}

// Case-insensitive snap to a controlled-vocab list; returns the canonical
// spelling or null if no match.
export function snap(value: unknown, list: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase();
  if (!t) return null;
  return list.find((x) => x.toLowerCase() === t) ?? null;
}

// Reuse ingest's fence-stripping parse recipe verbatim.
export function parseDraftJSON(raw: string): Record<string, unknown> {
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
    throw new Error("Draft returned malformed output — try again.");
  }
}

// Whether the partner's current form has anything worth refining.
function hasCurrent(c?: CurrentSegmentValues): boolean {
  if (!c) return false;
  return Boolean(
    (c.description && c.description.trim()) ||
      c.industries?.length ||
      c.geographies?.length ||
      c.priorityLocation ||
      c.personas?.length ||
      c.buyingSignals?.length ||
      c.disqualifiers?.length ||
      c.anchors?.length ||
      numOrNull(c.revenueMin) !== null ||
      numOrNull(c.revenueMax) !== null ||
      numOrNull(c.employeeMin) !== null ||
      numOrNull(c.employeeMax) !== null,
  );
}

function buildContext(current?: CurrentSegmentValues): string {
  const lines: string[] = [];

  lines.push("## Controlled vocabulary");
  lines.push(`Pick persona department ONLY from: ${DEPARTMENTS.join(", ")}.`);
  lines.push(`Pick persona seniority ONLY from: ${SENIORITIES.join(", ")}.`);
  lines.push("");

  lines.push("## Geography format");
  lines.push(
    'Label geographies as "Province/State, Country" or "Country" — e.g. "Ontario, Canada", "California, United States", "United Kingdom".',
  );
  lines.push("priorityLocation must be one of the geographies you return, or null.");
  lines.push("");

  if (hasCurrent(current)) {
    lines.push("## Current draft (refine — keep good values, fill gaps, sharpen)");
    const c = current as CurrentSegmentValues;
    if (c.description?.trim()) lines.push(`Description: ${c.description.trim()}`);
    if (c.industries?.length) lines.push(`Industries: ${c.industries.join(", ")}`);
    const rMin = numOrNull(c.revenueMin);
    const rMax = numOrNull(c.revenueMax);
    if (rMin !== null || rMax !== null) lines.push(`Revenue band (CAD): ${rMin ?? "?"} – ${rMax ?? "?"}`);
    const eMin = numOrNull(c.employeeMin);
    const eMax = numOrNull(c.employeeMax);
    if (eMin !== null || eMax !== null) lines.push(`Employee band: ${eMin ?? "?"} – ${eMax ?? "?"}`);
    if (c.geographies?.length) lines.push(`Geographies: ${c.geographies.join(", ")}`);
    if (c.priorityLocation) lines.push(`Priority location: ${c.priorityLocation}`);
    if (c.personas?.length)
      lines.push(`Personas: ${c.personas.map((p) => `${p.department}/${p.seniority}`).join(", ")}`);
    if (c.buyingSignals?.length) lines.push(`Buying signals: ${c.buyingSignals.join(", ")}`);
    if (c.disqualifiers?.length) lines.push(`Disqualifiers: ${c.disqualifiers.join(", ")}`);
    if (c.anchors?.length)
      lines.push(`Anchor companies: ${c.anchors.map((a) => (a.domain ? `${a.name} (${a.domain})` : a.name)).join(", ")}`);
  } else {
    lines.push("## Mode");
    lines.push("Fresh — build the segment from the name and brief.");
  }

  return lines.join("\n");
}

// ── draftSegment ─────────────────────────────────────────────────────────────
export async function draftSegment(input: {
  name: string;
  brief: string;
  current?: CurrentSegmentValues;
}): Promise<DraftResult> {
  const name = input.name.trim();
  const brief = input.brief.trim();
  if (!name || !brief) {
    throw new Error("Add a name and a brief so Claude has something to work from.");
  }

  const context = buildContext(input.current);
  const intake = `Segment name: ${name}\n\nBrief: ${brief}`;

  const raw = await generate({
    skill: "segment-drafter",
    context,
    intake,
    webSearch: true,
    maxTokens: 2500,
  });

  return normalizeDraftShape(parseDraftJSON(raw));
}

// ── normalizeDraftShape ──────────────────────────────────────────────────────
// Takes a parsed JSON object that claims to be a segment spec and snaps it into
// a save-clean DraftResult: tag arrays trimmed/deduped, bands coerced to int|null,
// personas snapped to the controlled vocab, anchors normalized to bare domains,
// priorityLocation forced to be one of the returned geographies. Shared by the
// segment drafter AND the segment optimizer so both emit identical, save-ready
// shapes.
export function normalizeDraftShape(o: Record<string, unknown>): DraftResult {
  const geographies = strArr(o.geographies);
  const priorityRaw = typeof o.priorityLocation === "string" ? o.priorityLocation.trim() : "";
  const priorityLocation = priorityRaw && geographies.includes(priorityRaw) ? priorityRaw : null;

  // Personas — snap both fields to vocab; keep only rows with both; dedupe.
  const personas: DraftPersona[] = [];
  const seenPersona = new Set<string>();
  if (Array.isArray(o.personas)) {
    for (const p of o.personas) {
      if (!p || typeof p !== "object") continue;
      const dept = snap((p as Record<string, unknown>).department, DEPARTMENTS);
      const sen = snap((p as Record<string, unknown>).seniority, SENIORITIES);
      if (!dept || !sen) continue;
      const key = `${dept}|${sen}`;
      if (seenPersona.has(key)) continue;
      seenPersona.add(key);
      personas.push({ department: dept, seniority: sen });
    }
  }

  // Anchors — name + non-empty bare lowercase domain; dedupe by domain.
  const anchors: DraftAnchor[] = [];
  const seenDomain = new Set<string>();
  if (Array.isArray(o.anchors)) {
    for (const a of o.anchors) {
      if (!a || typeof a !== "object") continue;
      const r = a as Record<string, unknown>;
      const aname = typeof r.name === "string" ? r.name.trim() : "";
      let domain = typeof r.domain === "string" ? r.domain.trim().toLowerCase() : "";
      domain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (!aname || !domain || seenDomain.has(domain)) continue;
      seenDomain.add(domain);
      anchors.push({ name: aname, domain });
    }
  }

  return {
    description: typeof o.description === "string" ? o.description.trim() : "",
    industries: strArr(o.industries),
    revenueMin: numOrNull(o.revenueMin),
    revenueMax: numOrNull(o.revenueMax),
    employeeMin: numOrNull(o.employeeMin),
    employeeMax: numOrNull(o.employeeMax),
    geographies,
    priorityLocation,
    personas,
    buyingSignals: strArr(o.buyingSignals),
    disqualifiers: strArr(o.disqualifiers),
    anchors,
  };
}
