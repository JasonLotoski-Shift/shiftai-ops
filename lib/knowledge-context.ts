// Firm Knowledge — runtime context for AI skills.
//
// Tier-1 (recent memory): a few small, partner-approved MemoryBlocks that load
// into EVERY skill's system prompt as one cached block (see lib/ai.ts). This is
// the always-in-context layer. Tier-2 (historical, on-demand) lands in a later
// phase as fetchHistoricalKnowledge().
//
// THE SENSITIVITY FILTER LIVES HERE, at retrieval time: managing_partner blocks
// are excluded for non-MP sessions BEFORE any text enters an AI call — the
// page/mutation gate (lib/permissions.ts) only protects renders, not context.
//
// Server-only: imports Prisma. Never import into a client component.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

export type MemoryContextOptions = {
  /** Include managing-partner-only blocks. Default false (firm_wide only).
   *  Only pass true from a verified managing-partner context. */
  includeManagingPartner?: boolean;
};

/**
 * The approved recent-memory blocks, rendered as ONE markdown string ready to
 * drop in as a cached system block. Returns null when nothing is approved yet
 * (so callers add no block and prompt caching stays byte-identical to before).
 *
 * Only `approvedBody` is ever read — never `draftBody` — so unreviewed edits
 * can't leak into an AI call.
 */
export async function fetchApprovedMemoryBlocks(
  opts: MemoryContextOptions = {},
): Promise<string | null> {
  const blocks = await prisma.memoryBlock.findMany({
    where: {
      approvedBody: { not: null },
      ...(opts.includeManagingPartner ? {} : { sensitivity: "firm_wide" }),
    },
    orderBy: { key: "asc" },
    select: { label: true, approvedBody: true, asOf: true },
  });

  const usable = blocks.filter((b) => b.approvedBody && b.approvedBody.trim());
  if (usable.length === 0) return null;

  const sections = usable.map((b) => {
    const asOf = b.asOf ? ` (as of ${b.asOf.toISOString().slice(0, 10)})` : "";
    return `## ${b.label}${asOf}\n${b.approvedBody!.trim()}`;
  });

  return [
    "# Firm recent memory",
    "A curated, partner-approved snapshot of where the firm is right now. Treat it as current context; if it conflicts with older information, prefer this.",
    "",
    sections.join("\n\n"),
  ].join("\n");
}

// ──────────────────────────────────────────────────────────────────────
// Tier-2 — Historical Knowledge (retrieved on demand, NEVER auto-injected).
//
// A skill calls fetchHistoricalKnowledge() only when a question reaches past the
// recent-memory window. v1 retrieval = Postgres tsvector FTS over approved,
// head-only KnowledgeItems + keyword match over approved DecisionRecords. No
// embeddings (deferred behind a golden-eval gate — see the plan, Phase 4).
//
// THE SENSITIVITY FILTER RUNS HERE TOO: managing_partner records are excluded
// before anything is returned unless the caller is a verified MP context.
// ──────────────────────────────────────────────────────────────────────

export type HistoricalScope = {
  clientId?: string;
  projectId?: string;
  dealId?: string;
};

export type HistoryOptions = {
  /** What to search for — usually the skill's intake / question. */
  query: string;
  /** Max records returned (documents + decisions combined). Default 6. */
  limit?: number;
  /** Only consider records observed/created within this many days (optional). */
  days?: number;
  /** Pass true ONLY from a verified managing-partner context. */
  includeManagingPartner?: boolean;
  /** Narrow to a client/project/deal's records (firm-wide records still match). */
  scope?: HistoricalScope;
};

export type HistoricalHit = {
  id: string;
  kind: "document" | "decision";
  title: string;
  summary: string | null;
  categoryLabel: string | null;
  asOf: string | null; // ISO date the knowledge was true / decided
};

type DocRow = {
  id: string;
  title: string;
  summary: string | null;
  categoryLabel: string | null;
  asOf: Date | null;
  rank: number;
};

/**
 * Retrieve approved historical knowledge matching `query`, role-filtered for
 * sensitivity and capped. Returns a citation-ready markdown block plus the raw
 * hits, or null when the query is empty / nothing matches (so callers add no
 * block). Never throws — if the Phase-3 tables aren't migrated yet, it logs and
 * returns null rather than breaking the calling skill.
 */
export async function fetchHistoricalKnowledge(
  opts: HistoryOptions,
): Promise<{ text: string; hits: HistoricalHit[] } | null> {
  const query = opts.query?.trim();
  if (!query) return null;
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);
  const includeMP = !!opts.includeManagingPartner;
  const since = opts.days ? new Date(Date.now() - opts.days * 86_400_000) : null;

  try {
    // ── Documents: tsvector FTS, approved + head-only, sensitivity-filtered. ──
    const conds: Prisma.Sql[] = [
      Prisma.sql`ki."reviewStatus" = 'approved'`,
      Prisma.sql`ki."fts" @@ websearch_to_tsquery('english', ${query})`,
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "KnowledgeItem" c WHERE c."supersedesId" = ki.id)`,
    ];
    if (!includeMP) conds.push(Prisma.sql`ki."sensitivity" = 'firm_wide'`);
    if (since) conds.push(Prisma.sql`ki."createdAt" >= ${since}`);
    if (opts.scope?.clientId) conds.push(Prisma.sql`ki."clientId" = ${opts.scope.clientId}`);
    if (opts.scope?.projectId) conds.push(Prisma.sql`ki."projectId" = ${opts.scope.projectId}`);
    if (opts.scope?.dealId) conds.push(Prisma.sql`ki."dealId" = ${opts.scope.dealId}`);

    const docs = await prisma.$queryRaw<DocRow[]>`
      SELECT ki.id, ki.title, ki.summary,
             kc.label AS "categoryLabel",
             COALESCE(ki."observedAt", ki."validFrom", ki."createdAt") AS "asOf",
             ts_rank(ki."fts", websearch_to_tsquery('english', ${query})) AS rank
      FROM "KnowledgeItem" ki
      LEFT JOIN "KnowledgeCategory" kc ON kc.id = ki."knowledgeCategoryId"
      WHERE ${Prisma.join(conds, " AND ")}
      ORDER BY rank DESC, "asOf" DESC
      LIMIT ${limit}`;

    // ── Decisions: keyword match (small, structured — ILIKE is plenty). ──
    const words = query.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
    const decisions = await prisma.decisionRecord.findMany({
      where: {
        reviewStatus: "approved",
        supersededBy: { none: {} },
        ...(includeMP ? {} : { sensitivity: "firm_wide" }),
        ...(since ? { decidedAt: { gte: since } } : {}),
        ...(words.length
          ? {
              OR: words.flatMap((w) => [
                { title: { contains: w, mode: "insensitive" as const } },
                { decision: { contains: w, mode: "insensitive" as const } },
                { context: { contains: w, mode: "insensitive" as const } },
              ]),
            }
          : {}),
      },
      orderBy: { decidedAt: "desc" },
      take: limit,
      select: {
        id: true, title: true, decision: true, decidedAt: true,
        category: { select: { label: true } },
      },
    });

    const hits: HistoricalHit[] = [
      ...docs.map((d): HistoricalHit => ({
        id: d.id, kind: "document", title: d.title, summary: d.summary,
        categoryLabel: d.categoryLabel, asOf: d.asOf ? d.asOf.toISOString().slice(0, 10) : null,
      })),
      ...decisions.map((d): HistoricalHit => ({
        id: d.id, kind: "decision", title: d.title, summary: d.decision,
        categoryLabel: d.category?.label ?? null, asOf: d.decidedAt.toISOString().slice(0, 10),
      })),
    ].slice(0, limit);

    if (hits.length === 0) return null;

    const sections = hits.map((h) => {
      const tag = h.kind === "decision" ? "Decision" : "Document";
      const cat = h.categoryLabel ? `, ${h.categoryLabel}` : "";
      const asOf = h.asOf ? `, as of ${h.asOf}` : "";
      return `## [${tag}] ${h.title}${cat}${asOf}\n${(h.summary ?? "(no summary)").trim()}`;
    });

    const text = [
      "# Firm historical knowledge (retrieved)",
      `Approved firm records matching this question. Cite by title. Treat as historical — if it conflicts with recent memory, prefer recent memory, and flag the conflict rather than guessing.`,
      "",
      sections.join("\n\n"),
    ].join("\n");

    return { text, hits };
  } catch (err) {
    console.warn("[knowledge] fetchHistoricalKnowledge failed (tables may be pre-migration):", err);
    return null;
  }
}
