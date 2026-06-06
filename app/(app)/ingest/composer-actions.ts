"use server";

// Unified ingest — composer server actions (the redesigned single flow).
//
// One composer: the partner picks an ingest TYPE + one-or-many TARGET records
// (AI-detected and/or hand-picked) + pastes content/email/files (and can add a
// new contact inline). A single unified agent (skills/ingest) proposes changes
// across ALL records as a v2 UnifiedProposal, held as a PENDING IngestProposal.
// The review screen approves every ADD and every OVERWRITE (before→after)
// individually — propose-never-auto-write.
//
// The genuinely tricky part — the overwrite-capable apply layer + the diff
// stamping — is split out: lib/ingest/apply.ts (apply), lib/ingest/context.ts
// (context), lib/ingest/parse.ts (parse). This file orchestrates them and owns
// the six exported actions the composer + review card call.
//
// Legacy v1 actions (ingest/actions.ts, projects/[id]/drop-actions.ts) are left
// untouched and keep serving already-pending v1 proposals.

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, folderIdFromUrl } from "@/lib/drive";
import { writeAudit, writeActivity, agentActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { generate } from "@/lib/ai";
import { applyContactChanges, applyClientChanges, applyProjectChanges, applyDealStage } from "@/lib/ingest/apply";
import { fetchTargetData, buildIngestContext, formatPartnerRoster, type TargetRef } from "@/lib/ingest/context";
import { parseUnified } from "@/lib/ingest/parse";
import { findDuplicateOpenTask, findDuplicateOpenMilestone } from "@/lib/ingest/dedup";
import { createContact } from "@/app/(app)/contacts/actions";
import type {
  IngestType,
  IngestTargetKind,
  FieldChange,
  RecordProposal,
  TaskProposal,
  UnifiedProposal,
  ApproveUnifiedSelections,
} from "@/lib/ingest/types";
import { INGEST_TYPES } from "@/lib/ingest/types";
import type {
  InteractionType,
  MilestoneStatus,
  ArtifactType,
  TaskPriority,
} from "@/lib/generated/prisma/enums";

// ── 1. detectTargets — cheap, no model call. Two complementary passes:
//   (a) emails scraped from the text → Contact → its Client/Deal (high precision);
//   (b) company / contact NAMES mentioned in the text → Client / Deal / Contact.
// Pass (b) is what makes "detect the target client" work when the notes name the
// client but carry no recognizable contact email. Results are deduped; clients
// are surfaced first so a single matched client becomes the composer's focus. ──
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

export async function detectTargets(input: {
  content: string;
  emailBlock?: string;
  title?: string;
}): Promise<{ targets: { kind: IngestTargetKind; id: string; label: string }[]; ambiguous: boolean }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  type T = { kind: IngestTargetKind; id: string; label: string };
  // Keep matches bucketed by kind so we can order the output (clients first) and
  // dedupe within each kind.
  const byKind: Record<IngestTargetKind, Map<string, T>> = {
    client: new Map(),
    deal: new Map(),
    contact: new Map(),
    project: new Map(),
  };
  const add = (t: T) => {
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

  // Order: clients → deals → contacts. The composer makes the FIRST target the
  // focus, so a matched client leads — which is what "target client" wants.
  const targets = [...byKind.client.values(), ...byKind.deal.values(), ...byKind.contact.values()];

  // Ambiguous = the partner must choose which is THE focus: more than one client
  // matched, or more than one participant came in via email.
  const ambiguous = byKind.client.size > 1 || emailContacts > 1;

  return { targets, ambiguous };
}

// ── 2. checkContactDuplicate — case-insensitive email (and optional name). ──
export async function checkContactDuplicate(input: {
  email: string;
  name?: string;
}): Promise<{ duplicate: { id: string; name: string; company: string } | null }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const email = input.email.trim();
  if (!email) return { duplicate: null };

  const found = await prisma.contact.findFirst({
    where: {
      OR: [
        { email: { equals: email, mode: "insensitive" } },
        ...(input.name?.trim() ? [{ name: { equals: input.name.trim(), mode: "insensitive" as const } }] : []),
      ],
    },
    select: { id: true, name: true, company: true },
  });
  return { duplicate: found ?? null };
}

// ── 3. addContactInline — wrap the existing createContact. ──
export async function addContactInline(input: {
  name: string;
  title?: string;
  company: string;
  email: string;
  phone?: string;
  industry: string;
  source?: string;
  notes?: string;
  partnerLeadId?: string;
}): Promise<{ id: string; name: string; company: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { id } = await createContact({
    name: input.name,
    title: input.title ?? "",
    company: input.company,
    email: input.email,
    phone: input.phone,
    industry: input.industry,
    source: input.source ?? "Ingest composer",
    notes: input.notes,
    partnerLeadId: input.partnerLeadId,
  });
  return { id, name: input.name.trim(), company: input.company.trim() };
}

// ── 4. extractUnified — the one unified extraction. Builds context across all
// targets, runs the ingest skill once, stamps the diff (op/existing) server-side,
// validates reassignTaskId, persists a pending v2 IngestProposal. Writes no firm
// records — the approval gate is the only path to a real write. ──
export async function extractUnified(input: {
  ingestType: IngestType;
  title: string;
  date: string; // YYYY-MM-DD
  content: string;
  emailBlock?: string;
  focus?: { kind: IngestTargetKind; id: string } | null;
  targets: { kind: IngestTargetKind; id: string }[];
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  if (!(INGEST_TYPES as readonly string[]).includes(input.ingestType)) {
    throw new Error(`Invalid ingest type: ${input.ingestType}`);
  }
  const content = input.content.trim();
  if (content.length < 40) throw new Error("Content is too short to extract anything useful");
  const title = input.title.trim() || "Untitled ingest";
  const date = input.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim()) ? input.date.trim() : new Date().toISOString().slice(0, 10);
  const meetingDate = new Date(date);

  // De-dupe the focus into the target set so the focus record is always loaded.
  const refMap = new Map<string, TargetRef>();
  for (const t of input.targets ?? []) refMap.set(`${t.kind}:${t.id}`, { kind: t.kind, id: t.id });
  if (input.focus) refMap.set(`${input.focus.kind}:${input.focus.id}`, { kind: input.focus.kind, id: input.focus.id });

  // Load each target's current data (drops any stale/missing id).
  const loaded = (await Promise.all([...refMap.values()].map((r) => fetchTargetData(r)))).filter(
    (t): t is NonNullable<typeof t> => t !== null,
  );

  const partners = await prisma.partner.findMany({ select: { id: true, name: true } });

  const context =
    buildIngestContext({ ingestType: input.ingestType, title, date, focus: input.focus ?? null, targets: loaded }) +
    "\n" +
    formatPartnerRoster(partners);

  const intake = input.emailBlock?.trim()
    ? `## Content\n${content}\n\n## Email block\n${input.emailBlock.trim()}`
    : `## Content\n${content}`;

  const raw = await generate({ skill: "ingest", context, intake, maxTokens: 3500 });
  const parsed = parseUnified(raw);

  // Build the set of valid open-task ids (project targets only) for reassign validation.
  const openTaskIds = new Set<string>();
  const milestoneIds = new Set<string>();
  for (const t of loaded) {
    if (t.kind === "project") {
      for (const ot of t.openTasks) openTaskIds.add(ot.id);
      for (const m of t.milestones) if (m.id) milestoneIds.add(m.id);
    }
  }

  // ── Stamp the diff: re-read each record's live overwritable values and set
  // op ("add" if current empty else "replace") + existing. Drop a change whose
  // proposed value equals the current value (no-op). Only keep records whose
  // kind/id correspond to a loaded target (or null-id inline-new contact). ──
  const loadedByKey = new Map(loaded.map((t) => [`${t.kind}:${t.id}`, t]));

  const records: RecordProposal[] = [];
  for (const r of parsed.records) {
    // Resolve which loaded target this maps to. recordId null = inline-new contact.
    const loadedTarget = r.recordId ? loadedByKey.get(`${r.kind}:${r.recordId}`) : null;
    if (r.recordId && !loadedTarget) continue; // proposal for a record we didn't supply — drop

    const current = (loadedTarget?.data ?? {}) as Record<string, unknown>;

    const fieldChanges: FieldChange[] = [];
    for (const fc of r.fieldChanges) {
      const cur = current[fc.field];
      const curStr =
        cur === null || cur === undefined
          ? ""
          : Array.isArray(cur)
            ? "" // list fields aren't scalar changes — ignore if mis-routed
            : String(cur).trim();
      // Project enums are stored underscored; the proposed may be hyphenated. Compare loosely.
      const proposedNorm = fc.proposed.trim();
      if (proposedNorm.replace(/-/g, "_") === curStr.replace(/-/g, "_")) continue; // identical → drop
      fieldChanges.push({
        field: fc.field,
        proposed: proposedNorm,
        existing: curStr || null,
        op: curStr ? "replace" : "add",
      });
    }

    records.push({
      kind: r.kind,
      recordId: r.recordId,
      label: r.label || loadedTarget?.label || "",
      fieldChanges,
      listAdditions: r.listAdditions,
      interactions: r.interactions,
      projectNotes: r.projectNotes ?? null,
      milestones: r.milestones,
      deliverables: r.deliverables,
      stageSignal: r.stageSignal ?? null,
    });
  }

  // ── Tasks: validate reassignTaskId against the supplied open tasks; an
  // unknown id is demoted to a brand-new task (reassignTaskId = null). ──
  const tasks: TaskProposal[] = parsed.tasks.map((t) => ({
    title: t.title,
    context: t.context,
    priority: t.priority,
    due: t.due,
    ownerHint: t.ownerHint,
    clientId: t.clientId,
    projectId: t.projectId,
    milestoneId: t.milestoneId && milestoneIds.has(t.milestoneId) ? t.milestoneId : null,
    reassignTaskId: t.reassignTaskId && openTaskIds.has(t.reassignTaskId) ? t.reassignTaskId : null,
  }));

  const unified: UnifiedProposal = {
    schemaVersion: 2,
    ingestType: input.ingestType,
    summary: parsed.summary,
    keyPoints: parsed.keyPoints,
    records,
    tasks,
  };

  // Focus record drives the matched* FKs (the review surface scopes off these).
  const focusKind = input.focus?.kind ?? null;
  const focusId = input.focus?.id ?? null;

  const created = await prisma.ingestProposal.create({
    data: {
      source: "paste",
      ingestType: input.ingestType,
      title,
      meetingDate,
      transcript: content,
      proposal: unified as object,
      status: "pending",
      matchedContactId: focusKind === "contact" ? focusId : null,
      matchedClientId: focusKind === "client" ? focusId : null,
      matchedDealId: focusKind === "deal" ? focusId : null,
      matchedProjectId: focusKind === "project" ? focusId : null,
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  await notifyPartner(prisma, partnerId, "approval_needed", `"${title}" is ready for your review`, { link: "/ingest" });

  revalidatePath("/ingest");
  revalidatePath("/messages");
  return { id: created.id };
}

// ── 5. approveUnified — the partner-approval gate. One transaction; applies
// every approved record change + task, files the content to Drive, marks the
// proposal approved, audits. ──
export async function approveUnified(
  proposalId: string,
  selections: ApproveUnifiedSelections,
): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = agentActor("ingest");

  const proposal = await prisma.ingestProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  const data = proposal.proposal as UnifiedProposal;
  const summary = data?.summary?.trim() || proposal.title;

  // Resolve a Drive folder: focus client's folder if reachable, else shared root.
  const focusClientId =
    proposal.matchedClientId ??
    (selections.records.find((r) => r.kind === "client")?.recordId ?? null);
  const sharedRoot = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID ?? null;
  let parentFolderId = sharedRoot;
  if (focusClientId) {
    const cl = await prisma.client.findUnique({ where: { id: focusClientId }, select: { driveFolderUrl: true } });
    if (cl?.driveFolderUrl) {
      try {
        parentFolderId = folderIdFromUrl(cl.driveFolderUrl);
      } catch {
        /* placeholder URL — fall back to root */
      }
    }
  }

  // Upload the content to Drive BEFORE the transaction (a DB failure rolls back
  // DB writes; an orphan Drive file stays, its id captured in the audit row).
  let driveUrl: string | null = null;
  let driveFileId: string | null = null;
  const fileName = `${proposal.meetingDate.toISOString().slice(0, 10)}-${proposal.title.replace(/\s+/g, "-").slice(0, 60)}-ingest.md`;
  if (parentFolderId) {
    try {
      const res = await drive.files.create({
        requestBody: { name: fileName, parents: [parentFolderId], mimeType: "text/markdown" },
        media: { mimeType: "text/markdown", body: Readable.from(`# ${proposal.title}\n\n${proposal.transcript}`) },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
      driveUrl = res.data.webViewLink ?? null;
      driveFileId = res.data.id ?? null;
    } catch {
      // Drive failed — proceed with DB writes; the content is still in the proposal row.
    }
  }

  // Running tallies for the audit summary.
  let totalAdds = 0;
  let totalReplaces = 0;
  let totalListAdds = 0;
  let interactionsCreated = 0;
  let milestonesCreated = 0;
  let deliverablesCreated = 0;
  let tasksCreated = 0;
  let tasksReassigned = 0;
  let stageMoves = 0;
  // Skips surfaced in audit + activity so a dedup drop is never silent.
  const tasksSkipped: { title: string; existingId: string }[] = [];
  const milestonesSkipped: { title: string; existingId: string }[] = [];
  const replaceDetail: { field: string; before: string; after: string }[] = [];
  const affected = { contacts: new Set<string>(), clients: new Set<string>(), projects: new Set<string>(), deals: new Set<string>() };
  // Contacts that already received an interaction this run — so the deal-link
  // step below never double-logs the same contact.
  const interactedContacts = new Set<string>();

  await prisma.$transaction(async (tx) => {
    // ── Records ──
    for (const r of selections.records) {
      if (r.kind === "contact") {
        if (!r.recordId) continue; // inline-new contact already created via addContactInline → has an id
        affected.contacts.add(r.recordId);
        const res = await applyContactChanges(tx, r.recordId, {
          fieldChanges: r.fieldChanges ?? [],
          listAdditions: r.listAdditions ?? [],
        });
        totalAdds += res.adds.length;
        totalReplaces += res.replaces.length;
        totalListAdds += res.listAdds.length;
        replaceDetail.push(...res.replaces);

        // Approved interactions on the contact (advance lastTouchAt).
        const interactions = r.interactions ?? [];
        if (interactions.length) {
          const contact = await tx.contact.findUnique({ where: { id: r.recordId }, select: { lastTouchAt: true } });
          if (contact) {
            let maxDate = contact.lastTouchAt;
            for (const it of interactions) {
              const d = it.date ? new Date(it.date) : proposal.meetingDate;
              const when = Number.isNaN(d.getTime()) ? proposal.meetingDate : d;
              await tx.interaction.create({
                data: {
                  contactId: r.recordId,
                  type: it.type as InteractionType,
                  date: when,
                  summary: it.summary,
                  loggedBy: "AGENT · CLAUDE",
                },
              });
              interactionsCreated++;
              if (when > maxDate) maxDate = when;
            }
            interactedContacts.add(r.recordId);
            if (maxDate > contact.lastTouchAt) {
              await tx.contact.update({ where: { id: r.recordId }, data: { lastTouchAt: maxDate } });
            }
          }
        }
      } else if (r.kind === "client") {
        if (!r.recordId) continue;
        affected.clients.add(r.recordId);
        const res = await applyClientChanges(tx, r.recordId, {
          fieldChanges: r.fieldChanges ?? [],
          listAdditions: r.listAdditions ?? [],
        });
        totalAdds += res.adds.length;
        totalReplaces += res.replaces.length;
        totalListAdds += res.listAdds.length;
        replaceDetail.push(...res.replaces);
      } else if (r.kind === "project") {
        if (!r.recordId) continue;
        affected.projects.add(r.recordId);
        const res = await applyProjectChanges(tx, r.recordId, {
          fieldChanges: r.fieldChanges ?? [],
          projectNotes: r.projectNotes ?? null,
        });
        totalAdds += res.adds.length;
        totalReplaces += res.replaces.length;
        replaceDetail.push(...res.replaces);

        // Approved milestones. Undated stays null (off the timeline). Skip any
        // that duplicate a live milestone already on this project.
        for (const m of r.milestones ?? []) {
          if (!m.title?.trim()) continue;
          const dupM = await findDuplicateOpenMilestone(tx, { title: m.title, projectId: r.recordId });
          if (dupM) {
            milestonesSkipped.push({ title: m.title.trim(), existingId: dupM.id });
            continue;
          }
          const d = m.dueDate ? new Date(m.dueDate) : null;
          await tx.milestone.create({
            data: {
              title: m.title.trim(),
              dueDate: d && !Number.isNaN(d.getTime()) ? d : null,
              status: (m.status as MilestoneStatus) ?? ("pending" as MilestoneStatus),
              projectId: r.recordId,
              category: "project",
            },
          });
          milestonesCreated++;
        }

        // Approved deliverables → Artifact rows (tagged AGENT · CLAUDE).
        const proj = await tx.project.findUnique({ where: { id: r.recordId }, select: { clientId: true } });
        for (const d of r.deliverables ?? []) {
          if (!d.title?.trim()) continue;
          await tx.artifact.create({
            data: {
              type: (d.type as ArtifactType) ?? ("other" as ArtifactType),
              title: d.title.trim(),
              // Proposed deliverable — no Drive file yet; placeholder URL.
              driveUrl: "",
              createdBy: "AGENT · CLAUDE",
              generatedFromSkill: "ingest",
              reviewStatus: "draft",
              projectId: r.recordId,
              clientId: proj?.clientId ?? null,
            },
          });
          deliverablesCreated++;
        }
      } else if (r.kind === "deal") {
        if (!r.recordId) continue;
        affected.deals.add(r.recordId);
        if (r.applyStage && r.stageSuggestion) {
          const moved = await applyDealStage(tx, r.recordId, r.stageSuggestion);
          if (moved.moved) {
            stageMoves++;
            replaceDetail.push({ field: "deal.stage", before: moved.before ?? "", after: moved.after ?? "" });
          }
        }
      }
    }

    // ── Link a partner-selected pipeline deal ──
    // Log the summary as an interaction on the deal's PRIMARY contact
    // (interactions are contact-scoped, so "against the deal" = on its contact).
    // Skipped if that contact already got an interaction above (no double-log).
    const dealLinkId = selections.dealId ?? proposal.matchedDealId ?? null;
    if (dealLinkId) {
      const deal = await tx.deal.findUnique({ where: { id: dealLinkId }, select: { contactId: true } });
      if (deal?.contactId && !interactedContacts.has(deal.contactId)) {
        const contact = await tx.contact.findUnique({ where: { id: deal.contactId }, select: { lastTouchAt: true } });
        if (contact) {
          const dealInteractionType: InteractionType =
            proposal.ingestType === "email"
              ? "email_received"
              : proposal.ingestType === "meeting"
                ? "meeting"
                : proposal.ingestType === "interaction"
                  ? "call"
                  : "other";
          await tx.interaction.create({
            data: {
              contactId: deal.contactId,
              type: dealInteractionType,
              date: proposal.meetingDate,
              summary,
              loggedBy: "AGENT · CLAUDE",
            },
          });
          interactionsCreated++;
          interactedContacts.add(deal.contactId);
          affected.contacts.add(deal.contactId);
          if (proposal.meetingDate > contact.lastTouchAt) {
            await tx.contact.update({ where: { id: deal.contactId }, data: { lastTouchAt: proposal.meetingDate } });
          }
        }
      }
      affected.deals.add(dealLinkId);
    }

    // ── Tasks ──
    for (const t of selections.tasks) {
      if (!t.title?.trim() || !t.ownerId) continue;
      const d = t.due ? new Date(t.due) : null;
      const due = d && !Number.isNaN(d.getTime()) ? d : proposal.meetingDate;

      if (t.reassignTaskId) {
        const existing = await tx.task.findUnique({ where: { id: t.reassignTaskId }, select: { ownerId: true } });
        if (existing) {
          await tx.task.update({
            where: { id: t.reassignTaskId },
            data: { ownerId: t.ownerId, assignedById: partnerId },
          });
          tasksReassigned++;
          replaceDetail.push({ field: "task.owner", before: existing.ownerId ?? "", after: t.ownerId });
          continue;
        }
        // The task vanished since extract — fall through and create a new one.
      }

      // Skip a brand-new task that duplicates an open task already on this
      // project/client (reassigns above are exempt — they re-own, not create).
      const dupT = await findDuplicateOpenTask(tx, { title: t.title, clientId: t.clientId, projectId: t.projectId });
      if (dupT) {
        tasksSkipped.push({ title: t.title.trim(), existingId: dupT.id });
        continue;
      }

      await tx.task.create({
        data: {
          title: t.title.trim(),
          priority: (t.priority as TaskPriority) ?? ("medium" as TaskPriority),
          due,
          context: t.context?.trim() || `From ingest: ${proposal.title}`,
          ownerId: t.ownerId,
          assignedById: partnerId,
          clientId: t.clientId,
          projectId: t.projectId,
          milestoneId: t.milestoneId,
          // Derive the board category from scope (project/client → project, else firm).
          category: t.projectId || t.clientId ? "project" : "firm",
        },
      });
      tasksCreated++;
    }

    // ── File the content as an Artifact (the filed source). ──
    if (driveUrl) {
      await tx.artifact.create({
        data: {
          type: "report" as ArtifactType,
          title: `Ingest source · ${proposal.title}`,
          driveUrl,
          fileName,
          createdBy: "AGENT · CLAUDE",
          generatedFromSkill: "ingest",
          reviewStatus: "approved",
          clientId: focusClientId ?? null,
          dealId: focusClientId ? null : dealLinkId ?? null,
        },
      });
    }

    // ── Mark the proposal approved. ──
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "approved", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });

    await writeAudit(tx, {
      actor,
      action: "approve.ingestProposal",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: {
        approvedBy: partnerLabel,
        ingestType: proposal.ingestType,
        dealLinked: selections.dealId ?? proposal.matchedDealId ?? null,
        adds: totalAdds,
        replaces: totalReplaces,
        listAdds: totalListAdds,
        replaceDetail,
        interactions: interactionsCreated,
        milestones: milestonesCreated,
        milestonesSkippedAsDuplicate: milestonesSkipped.length,
        milestonesSkipped,
        deliverables: deliverablesCreated,
        tasksCreated,
        tasksReassigned,
        tasksSkippedAsDuplicate: tasksSkipped.length,
        tasksSkipped,
        stageMoves,
        artifact: !!driveUrl,
        driveFileId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: proposal.title,
      detail: `Ingest approved — ${totalAdds} add(s), ${totalReplaces} overwrite(s), ${tasksCreated + tasksReassigned} task(s)${tasksSkipped.length || milestonesSkipped.length ? `, ${tasksSkipped.length + milestonesSkipped.length} skipped as already-open duplicate(s)` : ""}${summary.length > 60 ? "" : ` · ${summary}`}`,
      link: "/ingest",
    });
  });

  revalidatePath("/ingest");
  for (const id of affected.contacts) revalidatePath(`/contacts/${id}`);
  for (const id of affected.clients) revalidatePath(`/clients/${id}`);
  for (const id of affected.projects) revalidatePath(`/projects/${id}`);
  for (const id of affected.deals) revalidatePath(`/pipeline/${id}`);
  return { ok: true };
}

// ── 6. rejectUnified — mark rejected + audit (mirrors rejectProposal). ──
export async function rejectUnified(proposalId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const proposal = await prisma.ingestProposal.findUnique({ where: { id: proposalId }, select: { status: true } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  await prisma.$transaction(async (tx) => {
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "rejected", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor: agentActor("ingest"),
      action: "reject.ingestProposal",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: { rejectedBy: partnerLabel },
    });
  });

  revalidatePath("/ingest");
  return { ok: true };
}
