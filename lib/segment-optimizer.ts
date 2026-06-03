// optimizeSegment() — the brain behind "Suggested tweaks" on the Targeting
// segment builder (D39).
//
// Loads a target segment together with a summary of how its discovery runs
// actually performed (leads found, score spread, ghost/disqualified traits,
// run metrics), asks Claude to propose concrete refinements, and returns a
// summary + a list of suggestions + a `proposed` segment in the SAME save-clean
// shape the segment drafter returns. Nothing is persisted here — the partner
// reviews the suggestions, clicks Apply to load `proposed` into the builder,
// and Saves (which audits).
//
// Plain async function (NO "use server") so it can be unit-tested via tsx and
// imported by the server action. It transitively imports lib/ai.ts (reads the
// API key), so only ever import this from server code — never a client bundle.

import { generate } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { DEPARTMENTS, SENIORITIES } from "@/lib/data/apollo-taxonomy";
import {
  parseDraftJSON,
  normalizeDraftShape,
  type DraftResult,
} from "@/lib/segment-drafter";

// ── Public types ─────────────────────────────────────────────────────────────
export type OptimizerSuggestion = { field: string; change: string; reason: string };

export type OptimizeResult = {
  summary: string;
  suggestions: OptimizerSuggestion[];
  /** The same save-clean shape the segment drafter returns. */
  proposed: DraftResult;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Score histogram buckets, mirroring the stats panel: 1–3, 4–5, 6–7, 8–10.
function bucketScore(score: number): "1–3" | "4–5" | "6–7" | "8–10" {
  if (score <= 3) return "1–3";
  if (score <= 5) return "4–5";
  if (score <= 7) return "6–7";
  return "8–10";
}

// Top-N most common entries in a string list, with counts.
function topTraits(values: string[], n: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// ── optimizeSegment ──────────────────────────────────────────────────────────
export async function optimizeSegment(input: { segmentId: string }): Promise<OptimizeResult> {
  const segment = await prisma.targetSegment.findUnique({ where: { id: input.segmentId } });
  if (!segment) throw new Error("Target segment not found");

  const [leads, runs] = await Promise.all([
    prisma.prospectLead.findMany({
      where: { segmentId: segment.id },
      select: {
        companyName: true,
        industryTags: true,
        headquarters: true,
        score: true,
        status: true,
        disqualified: true,
      },
      orderBy: { score: "desc" },
      take: 200,
    }),
    prisma.leadRun.findMany({
      where: { segmentId: segment.id },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  // ── Build the results summary the skill reads ──
  const total = leads.length;
  const avgScore = total ? Math.round((leads.reduce((s, l) => s + l.score, 0) / total) * 10) / 10 : 0;
  const highFit = leads.filter((l) => l.score >= 8).length;

  const buckets: Record<string, number> = { "1–3": 0, "4–5": 0, "6–7": 0, "8–10": 0 };
  for (const l of leads) buckets[bucketScore(l.score)] += 1;

  const ghosts = leads.filter((l) => l.status === "ghost");
  const disqualified = leads.filter((l) => l.disqualified);
  const filteredOut = leads.filter((l) => l.status === "ghost" || l.disqualified);

  const filteredIndustries = topTraits(filteredOut.flatMap((l) => l.industryTags), 6);
  const filteredHQ = topTraits(
    filteredOut.map((l) => l.headquarters ?? "").filter(Boolean),
    5,
  );
  const highFitIndustries = topTraits(
    leads.filter((l) => l.score >= 8).flatMap((l) => l.industryTags),
    6,
  );

  const evaluated = runs.reduce((s, r) => s + r.evaluatedCount, 0);
  const found = runs.reduce((s, r) => s + r.foundCount, 0);
  const ghostCount = runs.reduce((s, r) => s + r.ghostCount, 0);
  const lastRun = runs[0]?.startedAt ?? null;

  // ── Context block ──
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

  lines.push("## Current segment spec");
  lines.push(`Name: ${segment.name}`);
  if (segment.description) lines.push(`Description: ${segment.description}`);
  if (segment.industries.length) lines.push(`Industries: ${segment.industries.join(", ")}`);
  if (segment.revenueMin !== null || segment.revenueMax !== null)
    lines.push(`Revenue band (CAD): ${segment.revenueMin ?? "?"} – ${segment.revenueMax ?? "?"}`);
  if (segment.employeeMin !== null || segment.employeeMax !== null)
    lines.push(`Employee band: ${segment.employeeMin ?? "?"} – ${segment.employeeMax ?? "?"}`);
  if (segment.geographies.length) lines.push(`Geographies: ${segment.geographies.join(", ")}`);
  if (segment.priorityLocation) lines.push(`Priority location: ${segment.priorityLocation}`);
  const personas = (segment.personas as { department?: string; seniority?: string }[] | null) ?? [];
  if (personas.length)
    lines.push(`Personas: ${personas.map((p) => `${p.department}/${p.seniority}`).join(", ")}`);
  if (segment.buyingSignals.length) lines.push(`Buying signals: ${segment.buyingSignals.join(", ")}`);
  if (segment.disqualifiers.length) lines.push(`Disqualifiers: ${segment.disqualifiers.join(", ")}`);
  const anchors = (segment.anchors as { name?: string; domain?: string }[] | null) ?? [];
  if (anchors.length)
    lines.push(
      `Anchor companies: ${anchors.map((a) => (a.domain ? `${a.name} (${a.domain})` : a.name)).join(", ")}`,
    );
  lines.push("");

  lines.push("## Results summary");
  if (total === 0 && runs.length === 0) {
    lines.push(
      "No discovery runs yet — there is NO performance data for this segment. Make conservative spec-hygiene suggestions only; do not invent performance you cannot see.",
    );
  } else {
    lines.push(`Leads found (this segment): ${total}. Average fit score: ${avgScore}/10. High-fit (8+): ${highFit}.`);
    lines.push(
      `Score histogram — 1–3: ${buckets["1–3"]}, 4–5: ${buckets["4–5"]}, 6–7: ${buckets["6–7"]}, 8–10: ${buckets["8–10"]}.`,
    );
    lines.push(`Ghosted (declined): ${ghosts.length}. Disqualified by the agent: ${disqualified.length}.`);
    if (filteredIndustries.length)
      lines.push(
        `Common industries among filtered-out leads: ${filteredIndustries.map((t) => `${t.value} (${t.count})`).join(", ")}.`,
      );
    if (filteredHQ.length)
      lines.push(
        `Common HQ locations among filtered-out leads: ${filteredHQ.map((t) => `${t.value} (${t.count})`).join(", ")}.`,
      );
    if (highFitIndustries.length)
      lines.push(
        `Industries of the high-fit (8+) leads: ${highFitIndustries.map((t) => `${t.value} (${t.count})`).join(", ")}.`,
      );
    const sampleFound = leads.slice(0, 12).map((l) => l.companyName);
    if (sampleFound.length) lines.push(`Sample companies found: ${sampleFound.join(", ")}.`);
    lines.push(
      `Run metrics — ${runs.length} run(s), ${evaluated} candidates evaluated, ${found} found vs ${ghostCount} filtered out.${
        lastRun ? ` Last run: ${lastRun.toISOString()}.` : ""
      }`,
    );
  }

  const context = lines.join("\n");
  const intake = `Optimize the "${segment.name}" segment using the current spec and the run results above.`;

  const raw = await generate({
    skill: "segment-optimizer",
    context,
    intake,
    webSearch: true,
    maxTokens: 2500,
  });

  const o = parseDraftJSON(raw);

  // proposed → reuse the drafter's normalizer so it's save-clean.
  const proposed = normalizeDraftShape(
    (o.proposed && typeof o.proposed === "object" ? o.proposed : o) as Record<string, unknown>,
  );

  // suggestions → keep only well-formed { field, change, reason } rows.
  const suggestions: OptimizerSuggestion[] = [];
  if (Array.isArray(o.suggestions)) {
    for (const s of o.suggestions) {
      if (!s || typeof s !== "object") continue;
      const r = s as Record<string, unknown>;
      const field = typeof r.field === "string" ? r.field.trim() : "";
      const change = typeof r.change === "string" ? r.change.trim() : "";
      const reason = typeof r.reason === "string" ? r.reason.trim() : "";
      if (!field || !change) continue;
      suggestions.push({ field, change, reason });
    }
  }

  const summary = typeof o.summary === "string" ? o.summary.trim() : "";

  return { summary, suggestions, proposed };
}
