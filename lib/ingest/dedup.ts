// Ingest dedup — guard the approval gate against creating a Task / Milestone
// that already exists. The source-file layer (IngestProposal.externalId UNIQUE)
// blocks re-ingesting the SAME email/meeting; this layer blocks the *next*
// duplication risk: two different sources (a meeting AND a follow-up email)
// proposing the same commitment, or a proposal re-approved against work that's
// already on the board.
//
// Match is by NORMALIZED title within the SAME scope (client / project), against
// items that are still live (open tasks; non-archived, non-complete milestones).
// Completed/archived work never blocks a fresh item. The caller skips the create
// and REPORTS the skip (audit + activity) — never a silent drop.
//
// Server-only (touches Prisma). The helpers take the active $transaction client
// so the check and the create share one transaction.

import { prisma } from "@/lib/prisma";
import { ratio, tokenJaccard } from "@/lib/resolve-entity";

// The client handed to a prisma.$transaction(async (tx) => …) callback.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// A leading filler verb carries no identity ("Send proposal" === "Proposal");
// the firm's titling rule already wants noun phrases, so stripping one leading
// verb mostly cleans up imperfect/legacy titles. Conservative on purpose.
const LEADING_VERBS = new Set([
  "send", "sending", "chase", "review", "reviewing", "follow", "draft", "drafting",
  "prepare", "preparing", "schedule", "scheduling", "create", "creating", "share",
  "sharing", "get", "confirm", "confirming", "make", "provide", "add", "update",
  "email", "call", "ping", "reach", "arrange", "book", "finalize", "finalise",
  "complete", "write", "writing", "set", "setup", "do",
]);
// Particles stripped ONLY right after a leading verb ("follow up X" → "X").
const VERB_PARTICLES = new Set(["up", "out", "on", "in", "over", "through"]);
const ARTICLES = new Set(["the", "a", "an"]);

/**
 * Normalize a title for comparison: lowercase, strip surrounding quotes, drop
 * trailing punctuation, collapse whitespace, then drop a single leading filler
 * verb (+ its particle) and any articles so "Send the proposal" / "Send proposal"
 * / "the proposal" all normalize equal. Two titles that normalize to the same
 * string are treated as the same task/milestone. Never collapses to empty.
 */
export function normalizeTitle(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let tokens = base.split(" ").filter(Boolean);
  if (tokens.length > 1 && LEADING_VERBS.has(tokens[0])) {
    tokens = tokens.slice(1);
    if (tokens.length > 1 && VERB_PARTICLES.has(tokens[0])) tokens = tokens.slice(1);
  }
  tokens = tokens.filter((t) => !ARTICLES.has(t));
  return tokens.join(" ").trim() || base;
}

export type DuplicateHit = { id: string; title: string };

/**
 * Find an OPEN task (done = false) in the same scope whose title matches `title`
 * after normalization. Scope = the client/project the new task would land on; a
 * firm-level task (no client, no project) only matches other firm-level tasks.
 * Returns the first match or null.
 */
export async function findDuplicateOpenTask(
  tx: Tx,
  input: { title: string; clientId?: string | null; projectId?: string | null },
): Promise<DuplicateHit | null> {
  const target = normalizeTitle(input.title);
  if (!target) return null;

  const candidates = await tx.task.findMany({
    where: {
      done: false,
      // Scope precisely: prefer project, else client, else firm-level (both null).
      ...(input.projectId
        ? { projectId: input.projectId }
        : input.clientId
          ? { clientId: input.clientId }
          : { clientId: null, projectId: null }),
    },
    select: { id: true, title: true },
  });

  return candidates.find((c) => normalizeTitle(c.title) === target) ?? null;
}

export type SimilarTaskHit = DuplicateHit & {
  similarity: number; // 0..1
  confidence: "exact" | "fuzzy";
};

/**
 * Find OPEN tasks in the same scope that are the SAME or NEARLY the same as
 * `title` — exact normalized match (similarity 1) or a high title-similarity
 * (edit-distance or token overlap ≥ threshold). Used by the ADVISORY cross-
 * reference badge so the partner sees "this looks like an existing task" for
 * near-duplicates like "Send proposal" vs "Send the proposal" — which the exact
 * findDuplicateOpenTask backstop would miss. Returns best-first; never writes.
 *
 * The approval-time backstop (findDuplicateOpenTask) stays EXACT-only on purpose:
 * fuzzy matches are flagged for the partner to confirm, never auto-skipped.
 */
export async function findSimilarOpenTasks(
  tx: Tx,
  input: { title: string; clientId?: string | null; projectId?: string | null },
  opts?: { threshold?: number },
): Promise<SimilarTaskHit[]> {
  const target = normalizeTitle(input.title);
  if (!target) return [];
  const threshold = opts?.threshold ?? 0.8;

  const candidates = await tx.task.findMany({
    where: {
      done: false,
      ...(input.projectId
        ? { projectId: input.projectId }
        : input.clientId
          ? { clientId: input.clientId }
          : { clientId: null, projectId: null }),
    },
    select: { id: true, title: true },
  });

  const hits: SimilarTaskHit[] = [];
  for (const c of candidates) {
    const norm = normalizeTitle(c.title);
    if (norm === target) {
      hits.push({ id: c.id, title: c.title, similarity: 1, confidence: "exact" });
      continue;
    }
    const sim = Math.max(ratio(target, norm), tokenJaccard(target, norm));
    if (sim >= threshold) {
      hits.push({ id: c.id, title: c.title, similarity: sim, confidence: "fuzzy" });
    }
  }
  return hits.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Find a live milestone (not archived, not complete) in the same scope whose
 * title matches `title` after normalization. Scope = project, else client.
 * Returns the first match or null.
 */
export async function findDuplicateOpenMilestone(
  tx: Tx,
  input: { title: string; projectId?: string | null; clientId?: string | null },
): Promise<DuplicateHit | null> {
  const target = normalizeTitle(input.title);
  if (!target) return null;

  const candidates = await tx.milestone.findMany({
    where: {
      archivedAt: null,
      status: { not: "complete" },
      ...(input.projectId
        ? { projectId: input.projectId }
        : input.clientId
          ? { clientId: input.clientId }
          : { projectId: null, clientId: null }),
    },
    select: { id: true, title: true },
  });

  return candidates.find((c) => normalizeTitle(c.title) === target) ?? null;
}
