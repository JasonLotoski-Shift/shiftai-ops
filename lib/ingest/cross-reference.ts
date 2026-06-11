// Ingest cross-reference — the "check this proposal against existing records &
// tasks" assist behind the review-card button. Two READ-ONLY jobs:
//
//   1. resolveTargetsFromText — re-detect which client / deal / contact a body
//      names. This is the SAME matcher detectTargets uses, lifted here so the
//      composer's detectTargets and the cross-reference share one implementation
//      (and so this module carries no auth / "use server" coupling).
//
//   2. computeCrossReference — for a pending proposal, suggest the record it
//      belongs to (for items that arrived UNMATCHED from Gmail / Fireflies) and
//      flag proposed tasks / milestones that already exist as OPEN work, so the
//      partner doesn't approve a duplicate. Advisory only — the approval-time
//      dedup in approve(Proposal|Unified) stays the backstop.
//
// Server-only (touches Prisma). NOT a "use server" module — the thin action
// wrapper that needs auth() lives in app/(app)/ingest/composer-actions.ts.

import { prisma } from "@/lib/prisma";
import { findSimilarOpenTasks, findDuplicateOpenMilestone } from "@/lib/ingest/dedup";
import { isUnifiedProposal } from "@/lib/ingest/types";
import type {
  IngestTargetKind,
  UnifiedProposal,
  CrossReferenceResult,
  CrossRefTaskOverlap,
  CrossRefMilestoneOverlap,
} from "@/lib/ingest/types";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";

export type DetectedTarget = { kind: IngestTargetKind; id: string; label: string };

// ── Text → email / name matching (moved verbatim from composer-actions.ts so
// the composer's detectTargets and the cross-reference button share one matcher) ──

function emailsFromText(text: string): string[] {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(m.map((e) => e.toLowerCase()))];
}

// Common legal suffixes / filler tokens — stripped before name matching and
// never used alone as a single-token match (too generic to be a signal).
const NAME_STOPWORDS = new Set([
  "the", "and", "group", "inc", "llc", "ltd", "co", "corp", "corporation",
  "company", "holdings", "partners", "international", "global", "industries",
  "solutions", "services", "systems", "technologies", "labs", "studio", "studios",
]);

// Build the set of lowercase strings whose presence in the text counts as a hit
// for a company name: the full name, the name minus a trailing legal suffix, and
// the leading word if it's distinctive (≥5 chars, not a stopword). Each variant
// must be ≥4 chars to avoid matching short, ambiguous fragments.
function companyVariants(raw: string): string[] {
  const name = raw.trim();
  if (!name) return [];
  const variants = new Set<string>();
  const full = name.toLowerCase();
  if (full.length >= 4) variants.add(full);

  const core = name
    .replace(/[,.]/g, "")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|company|holdings|group|gmbh|sa|plc)\b\.?$/i, "")
    .trim()
    .toLowerCase();
  if (core.length >= 4) variants.add(core);

  const firstWord = core.split(/\s+/)[0] ?? "";
  if (firstWord.length >= 5 && !NAME_STOPWORDS.has(firstWord)) variants.add(firstWord);

  return [...variants];
}

// Whole-word, case-insensitive presence of `phrase` in the already-lowercased text.
function textHasPhrase(lowerHaystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lowerHaystack);
}

/**
 * Detect candidate target records named in a body of text. Two complementary
 * passes: (a) emails scraped from the text → Contact → its Client/Deal (high
 * precision); (b) company / contact NAMES mentioned → Client / Deal / Contact.
 * Results are deduped; clients are surfaced first so a single matched client is
 * the natural focus. No auth — the caller (a server action) gates access.
 */
export async function resolveTargetsFromText(input: {
  content: string;
  emailBlock?: string;
  title?: string;
}): Promise<{ targets: DetectedTarget[]; ambiguous: boolean }> {
  // Keep matches bucketed by kind so we can order the output (clients first) and
  // dedupe within each kind.
  const byKind: Record<IngestTargetKind, Map<string, DetectedTarget>> = {
    client: new Map(),
    deal: new Map(),
    contact: new Map(),
    project: new Map(),
  };
  const add = (t: DetectedTarget) => {
    if (!byKind[t.kind].has(t.id)) byKind[t.kind].set(t.id, t);
  };

  // ── Pass (a): emails → contacts → their client/deal ──
  const explicit = emailsFromText(input.emailBlock ?? "");
  const emails = explicit.length ? explicit : emailsFromText(input.content ?? "");
  let emailContacts = 0;
  if (emails.length) {
    const matched = await prisma.contact.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        company: true,
        primaryForClients: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        deals: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      },
    });
    emailContacts = matched.length;
    for (const c of matched) {
      add({ kind: "contact", id: c.id, label: `${c.name} · ${c.company}` });
      const client = c.primaryForClients[0];
      if (client) add({ kind: "client", id: client.id, label: client.company });
      else if (c.deals[0]) add({ kind: "deal", id: c.deals[0].id, label: `${c.deals[0].company} (deal)` });
    }
  }

  // ── Pass (b): names mentioned in the text → client / deal / contact ──
  const haystack = [input.title ?? "", input.content ?? "", input.emailBlock ?? ""]
    .join("\n")
    .toLowerCase();

  if (haystack.trim()) {
    const [clients, deals, contacts] = await Promise.all([
      prisma.client.findMany({ select: { id: true, company: true } }),
      prisma.deal.findMany({ select: { id: true, company: true } }),
      prisma.contact.findMany({
        select: {
          id: true,
          name: true,
          company: true,
          primaryForClients: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 1 },
          deals: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 1 },
        },
      }),
    ]);

    const companyHit = (company: string) =>
      companyVariants(company).some((v) => textHasPhrase(haystack, v));

    for (const cl of clients) {
      if (companyHit(cl.company)) add({ kind: "client", id: cl.id, label: cl.company });
    }
    for (const d of deals) {
      if (companyHit(d.company)) add({ kind: "deal", id: d.id, label: `${d.company} (deal)` });
    }
    // A contact is a hit on their full name (whole-word). Pull their client/deal
    // in too — a named person usually implies the engagement they belong to.
    for (const c of contacts) {
      const nameLc = c.name.trim().toLowerCase();
      if (nameLc.length >= 4 && textHasPhrase(haystack, nameLc)) {
        add({ kind: "contact", id: c.id, label: `${c.name} · ${c.company}` });
        const client = c.primaryForClients[0];
        if (client) add({ kind: "client", id: client.id, label: client.company });
        else if (c.deals[0]) add({ kind: "deal", id: c.deals[0].id, label: `${c.deals[0].company} (deal)` });
      }
    }
  }

  // Order: clients → deals → contacts. A matched client leads (the focus).
  const targets = [...byKind.client.values(), ...byKind.deal.values(), ...byKind.contact.values()];

  // Ambiguous = the partner must choose THE focus: more than one client matched,
  // or more than one participant came in via email.
  const ambiguous = byKind.client.size > 1 || emailContacts > 1;

  return { targets, ambiguous };
}

/**
 * Cross-reference a pending proposal against the live records + board. Re-resolves
 * the record it belongs to (suggested matches) and finds proposed tasks /
 * milestones that already exist as open work. Pure read — persists nothing.
 *
 * `scope.clientId` lets a v1 caller compute task overlap against the client the
 * partner currently has attached (which may differ from the stored match). v2
 * tasks carry their own client/project scope, so they ignore it.
 */
export async function computeCrossReference(
  proposalId: string,
  scope?: { clientId?: string | null },
): Promise<CrossReferenceResult> {
  const proposal = await prisma.ingestProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  const isV2 = isUnifiedProposal(proposal.proposal);
  const alreadyMatched = !!(
    proposal.matchedClientId ||
    proposal.matchedDealId ||
    proposal.matchedProjectId ||
    proposal.matchedContactId
  );

  // Re-resolve from the stored body (Gmail body / Fireflies transcript / pasted notes).
  const { targets, ambiguous } = await resolveTargetsFromText({
    content: proposal.transcript,
    title: proposal.title,
  });
  const firstOf = (k: IngestTargetKind) => targets.find((t) => t.kind === k)?.id ?? null;
  const suggestedClientId = firstOf("client");
  const suggestedDealId = firstOf("deal");
  const suggestedContactId = firstOf("contact");

  const taskOverlaps: CrossRefTaskOverlap[] = [];
  const milestoneOverlaps: CrossRefMilestoneOverlap[] = [];

  if (isV2) {
    const data = proposal.proposal as UnifiedProposal;
    // v2 tasks carry their own scope — match approveUnified's dedup call exactly
    // (composer-actions.ts) so the badge agrees with what approval will skip.
    // reassign tasks re-own an existing task, they don't create — so exempt them.
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t?.title?.trim() || t.reassignTaskId) continue;
      const [dup] = await findSimilarOpenTasks(prisma, {
        title: t.title,
        clientId: t.clientId,
        projectId: t.projectId,
      });
      if (dup)
        taskOverlaps.push({
          index: i,
          title: t.title.trim(),
          existingTaskId: dup.id,
          existingTitle: dup.title,
          confidence: dup.confidence,
        });
    }
    // Milestones inherit their record's project at apply time — scope by recordId.
    const records = Array.isArray(data?.records) ? data.records : [];
    for (let ri = 0; ri < records.length; ri++) {
      const r = records[ri];
      if (r.kind !== "project" || !r.recordId) continue;
      const ms = r.milestones ?? [];
      for (let mi = 0; mi < ms.length; mi++) {
        const m = ms[mi];
        if (!m?.title?.trim()) continue;
        const dup = await findDuplicateOpenMilestone(prisma, { title: m.title, projectId: r.recordId });
        if (dup)
          milestoneOverlaps.push({
            recordIndex: ri,
            milestoneIndex: mi,
            title: m.title.trim(),
            existingMilestoneId: dup.id,
            existingTitle: dup.title,
          });
      }
    }
  } else {
    // v1: action items dedup against the attached client at approval
    // (actions.ts approveProposal) — scope overlap to the same client.
    const data = proposal.proposal as ExtractedProposal;
    const scopeClientId = scope?.clientId ?? proposal.matchedClientId ?? suggestedClientId ?? null;
    const items = Array.isArray(data?.actionItems) ? data.actionItems : [];
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a?.title?.trim()) continue;
      const [dup] = await findSimilarOpenTasks(prisma, { title: a.title, clientId: scopeClientId });
      if (dup)
        taskOverlaps.push({
          index: i,
          title: a.title.trim(),
          existingTaskId: dup.id,
          existingTitle: dup.title,
          confidence: dup.confidence,
        });
    }
  }

  return {
    schemaVersion: isV2 ? 2 : 1,
    alreadyMatched,
    ambiguous,
    suggestedMatches: targets,
    suggestedContactId,
    suggestedClientId,
    suggestedDealId,
    taskOverlaps,
    milestoneOverlaps,
  };
}
