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
