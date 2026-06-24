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
import { normalizeDomain } from "@/lib/apollo";
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

// Personal / free email providers — a shared domain here says nothing about
// which company a person belongs to, so the domain pass skips these.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "msn.com", "gmx.com", "ymail.com",
]);

// What we need from a matched contact to surface the engagement(s) they belong
// to: their primary client, their deals, AND every company they're linked to via
// ContactLink (committee / intro-path members, not just the designated primary).
const CONTACT_MATCH_SELECT = {
  id: true,
  name: true,
  company: true,
  primaryForClients: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 3 },
  deals: { select: { id: true, company: true }, orderBy: { updatedAt: "desc" }, take: 3 },
  links: {
    select: {
      client: { select: { id: true, company: true } },
      deal: { select: { id: true, company: true } },
    },
    take: 10,
  },
} as const;

type MatchedContact = {
  id: string;
  name: string;
  company: string;
  primaryForClients: { id: string; company: string }[];
  deals: { id: string; company: string }[];
  links: {
    client: { id: string; company: string } | null;
    deal: { id: string; company: string } | null;
  }[];
};

/** Bare, normalized email domain — "" for free providers or a malformed address. */
function companyDomainOf(email: string): string {
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  const dom = normalizeDomain(email.slice(at + 1));
  return dom && !FREE_EMAIL_DOMAINS.has(dom) ? dom : "";
}

/**
 * Detect candidate target records named in a body of text. Complementary passes:
 * (a) emails scraped from the text → Contact → its client(s)/deal(s) incl.
 * ContactLink committee; (a2) the email DOMAIN → Client/Deal/Contact (catches
 * unknown senders + multi-party threads where the exact address isn't on file);
 * (b) company / contact NAMES mentioned → Client / Deal / Contact; (c) the sole
 * active project of a matched client. Results are deduped; clients are surfaced
 * first so a single matched client is the natural focus. Suggestions only — the
 * caller (a server action) gates access, and nothing auto-files.
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
  // Surface the engagement(s) a matched contact belongs to: primary client first,
  // then linked clients, then deals (primary-led ordering within each kind).
  const addContactCompanies = (c: MatchedContact) => {
    for (const cl of c.primaryForClients) add({ kind: "client", id: cl.id, label: cl.company });
    for (const l of c.links) if (l.client) add({ kind: "client", id: l.client.id, label: l.client.company });
    for (const d of c.deals) add({ kind: "deal", id: d.id, label: `${d.company} (deal)` });
    for (const l of c.links) if (l.deal) add({ kind: "deal", id: l.deal.id, label: `${l.deal.company} (deal)` });
  };

  // ── Pass (a): emails → contacts → their client(s)/deal(s) ──
  const explicit = emailsFromText(input.emailBlock ?? "");
  const emails = explicit.length ? explicit : emailsFromText(input.content ?? "");
  let emailContacts = 0;
  if (emails.length) {
    const matched = await prisma.contact.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: CONTACT_MATCH_SELECT,
    });
    emailContacts = matched.length;
    for (const c of matched) {
      add({ kind: "contact", id: c.id, label: `${c.name} · ${c.company}` });
      addContactCompanies(c);
    }
  }

  // ── Pass (a2): email DOMAIN → client / deal / contact. High-precision and
  // survives unknown individuals — bob@acme.com whose exact address isn't on file
  // still resolves to the Acme deal if acme.com is on it. Free-mail skipped. ──
  const domains = [...new Set(emails.map(companyDomainOf).filter(Boolean))];
  if (domains.length) {
    const [dClients, dDeals, dContacts] = await Promise.all([
      prisma.client.findMany({ where: { domain: { in: domains } }, select: { id: true, company: true } }),
      prisma.deal.findMany({ where: { domain: { in: domains } }, select: { id: true, company: true } }),
      prisma.contact.findMany({ where: { domain: { in: domains } }, select: CONTACT_MATCH_SELECT, take: 20 }),
    ]);
    for (const cl of dClients) add({ kind: "client", id: cl.id, label: cl.company });
    for (const d of dDeals) add({ kind: "deal", id: d.id, label: `${d.company} (deal)` });
    for (const c of dContacts) {
      add({ kind: "contact", id: c.id, label: `${c.name} · ${c.company}` });
      addContactCompanies(c);
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
      prisma.contact.findMany({ select: CONTACT_MATCH_SELECT }),
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
        addContactCompanies(c);
      }
    }
  }

  // ── Pass (c): project — once a client is resolved, attach its SOLE active
  // project as a suggestion. A no-guess heuristic: clients with several active
  // projects stay a manual pick. Closes the gap where projects never resolved. ──
  const clientIds = [...byKind.client.keys()];
  if (clientIds.length) {
    const projects = await prisma.project.findMany({
      where: { clientId: { in: clientIds }, status: { not: "closed" } },
      select: { id: true, name: true, clientId: true },
    });
    const perClient = new Map<string, { id: string; name: string }[]>();
    for (const p of projects) {
      if (!p.clientId) continue;
      const arr = perClient.get(p.clientId) ?? [];
      arr.push({ id: p.id, name: p.name });
      perClient.set(p.clientId, arr);
    }
    for (const arr of perClient.values()) {
      if (arr.length === 1) add({ kind: "project", id: arr[0].id, label: arr[0].name });
    }
  }

  // Order: clients → projects → deals → contacts. A matched client leads (focus);
  // its sole project rides just behind so milestone/task scope can default to it.
  const targets = [
    ...byKind.client.values(),
    ...byKind.project.values(),
    ...byKind.deal.values(),
    ...byKind.contact.values(),
  ];

  // Ambiguous = the partner must choose THE focus: more than one client matched,
  // or more than one participant came in via a known email.
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
  const suggestedProjectId = firstOf("project");

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
    suggestedProjectId,
    taskOverlaps,
    milestoneOverlaps,
  };
}
