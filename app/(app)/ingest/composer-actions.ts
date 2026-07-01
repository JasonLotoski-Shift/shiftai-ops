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
import {
  applyContactChanges,
  applyClientChanges,
  applyProjectChanges,
  applyDealChanges,
  applyDealStage,
  applyChannelPartnerMarker,
  applyIntroBdTasks,
  applyCallReview,
} from "@/lib/ingest/apply";
import {
  fetchTargetData,
  buildIngestContext,
  formatPartnerRoster,
  fetchFirmOpenTaskCandidates,
  formatOpenTaskCandidates,
  type TargetRef,
} from "@/lib/ingest/context";
import { parseUnified } from "@/lib/ingest/parse";
import { findDuplicateOpenTask, findDuplicateOpenMilestone } from "@/lib/ingest/dedup";
import { resolveTargetsFromText, computeCrossReference, type DetectedTarget } from "@/lib/ingest/cross-reference";
import { extractFile, isExtractable, imageMediaType } from "@/lib/ingest/extract-file";
import { createContact } from "@/app/(app)/contacts/actions";
import { createContactTx } from "@/lib/contacts";
import { resolveContact } from "@/lib/resolve-entity";
import { persistIngestUploads } from "@/lib/ingest-uploads";
import { linkContact } from "@/lib/contact-links";
import { isInternalEmail } from "@/lib/fireflies";
import { parseFinanceProposal } from "@/lib/ingest/finance-parse";
import { matchOutstandingInvoice } from "@/lib/finance-match";
import { fileBillDoc } from "@/lib/firm-finance-drive";
import type {
  IngestType,
  IngestTargetKind,
  FieldChange,
  RecordProposal,
  TaskProposal,
  ContactLinkProposal,
  UnifiedProposal,
  ApproveUnifiedSelections,
  CrossReferenceResult,
  IntroProposal,
  ApproveIntroSelections,
} from "@/lib/ingest/types";
import { INGEST_TYPES } from "@/lib/ingest/types";
import type {
  InteractionType,
  MilestoneStatus,
  ArtifactType,
  TaskPriority,
} from "@/lib/generated/prisma/enums";

// ── 1. detectTargets — cheap, no model call. Delegates to the shared matcher
// (lib/ingest/cross-reference.ts) so the composer's "detect the target client"
// and the review-card cross-reference button resolve targets identically. ──
export async function detectTargets(input: {
  content: string;
  emailBlock?: string;
  title?: string;
}): Promise<{ targets: DetectedTarget[]; ambiguous: boolean }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return resolveTargetsFromText(input);
}

// ── 1b. crossReferenceProposal — the review-card "Cross-reference records &
// tasks" button (v1 + v2). Re-resolves the record a pending proposal belongs to
// and flags proposed tasks/milestones that already exist as open work. Advisory:
// the approval-time dedup stays the backstop. Pure read by default; when a
// partner confirms a focus (persistFocus*), it sets that one matched* column and
// writes one audit row — the only thing that happens is logged. ──
export async function crossReferenceProposal(
  proposalId: string,
  opts?: {
    scopeClientId?: string | null; // v1: scope task overlap to the attached client
    persistFocusKind?: IngestTargetKind; // v2: confirm + persist the focus
    persistFocusId?: string;
  },
): Promise<CrossReferenceResult> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  if (opts?.persistFocusKind && opts.persistFocusId) {
    const existing = await prisma.ingestProposal.findUnique({
      where: { id: proposalId },
      select: { status: true },
    });
    if (!existing) throw new Error("Proposal not found");
    if (existing.status !== "pending") throw new Error("Proposal already reviewed");
    const k = opts.persistFocusKind;
    await prisma.$transaction(async (tx) => {
      await tx.ingestProposal.update({
        where: { id: proposalId },
        // Set only the matching column; Prisma ignores the undefined ones.
        data: {
          matchedContactId: k === "contact" ? opts.persistFocusId : undefined,
          matchedClientId: k === "client" ? opts.persistFocusId : undefined,
          matchedDealId: k === "deal" ? opts.persistFocusId : undefined,
          matchedProjectId: k === "project" ? opts.persistFocusId : undefined,
        },
      });
      await writeAudit(tx, {
        actor: agentActor("ingest"),
        action: "crossReference.ingestProposal",
        targetType: "IngestProposal",
        targetId: proposalId,
        changes: { focus: { kind: k, id: opts.persistFocusId } },
      });
    });
    revalidatePath("/ingest");
  }

  return computeCrossReference(proposalId, { clientId: opts?.scopeClientId ?? null });
}

// ── 2. checkContactDuplicate — shared resolver (exact email → domain+name →
// fuzzy name/company). `duplicate` is the best exact/strong hit (safe to treat as
// the same person); `candidates` adds fuzzy near-matches for the partner to eyeball
// before adding anyway. Backward-compatible: `duplicate` keeps its old shape. ──
export async function checkContactDuplicate(input: {
  email: string;
  name?: string;
  company?: string;
}): Promise<{
  duplicate: { id: string; name: string; company: string } | null;
  candidates: { id: string; name: string; company: string; confidence: string; reason: string }[];
}> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const email = input.email.trim();
  if (!email && !input.name?.trim()) return { duplicate: null, candidates: [] };

  const { match, candidates } = await resolveContact({
    email,
    name: input.name,
    company: input.company,
  });
  return {
    duplicate: match ? { id: match.id, name: match.name, company: match.company } : null,
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      confidence: c.confidence,
      reason: c.reason,
    })),
  };
}

// ── 3. addContactInline — wrap the existing createContact. ──
export async function addContactInline(input: {
  name: string;
  title?: string;
  company: string;
  email: string;
  phone?: string;
  industry: string;
  subIndustry?: string;
  source?: string;
  notes?: string;
  partnerLeadId?: string;
}): Promise<{ id: string; name: string; company: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  // force:true — the composer ran its own checkContactDuplicate first and the
  // partner clicked Add, so skip createContact's dedup gate (it would never
  // return an id here). The result is always the created-row shape.
  const res = await createContact({
    name: input.name,
    title: input.title ?? "",
    company: input.company,
    email: input.email,
    phone: input.phone,
    industry: input.industry,
    subIndustry: input.subIndustry,
    source: input.source ?? "Ingest composer",
    notes: input.notes,
    partnerLeadId: input.partnerLeadId,
    force: true,
  });
  if (!("id" in res)) throw new Error("Failed to add contact");
  return { id: res.id, name: input.name.trim(), company: input.company.trim() };
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
  // Uploaded files (base64) — parsed server-side and appended to the content.
  files?: { base64: string; mimeType: string; fileName: string }[];
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  if (!(INGEST_TYPES as readonly string[]).includes(input.ingestType)) {
    throw new Error(`Invalid ingest type: ${input.ingestType}`);
  }
  let content = input.content.trim();

  // Split uploaded files: images go to Claude vision; everything else is parsed
  // to text. Each is best-effort — a failure adds a note, never throws.
  const fileNotes: string[] = [];
  const images: { base64: string; mediaType: string }[] = [];
  for (const f of input.files ?? []) {
    const imgType = imageMediaType(f.fileName);
    if (imgType) {
      if (images.length >= 5) {
        fileNotes.push(`Skipped extra image (max 5): ${f.fileName}`);
      } else if (f.base64.length > 7_000_000) {
        fileNotes.push(`Image too large (max ~5MB): ${f.fileName}`);
      } else {
        images.push({ base64: f.base64, mediaType: imgType });
        content += `\n\n## Attached image: ${f.fileName}`;
      }
      continue;
    }
    if (!isExtractable(f.fileName)) {
      fileNotes.push(`Unsupported file — skipped: ${f.fileName}`);
      continue;
    }
    try {
      const bytes = Buffer.from(f.base64, "base64");
      const ex = await extractFile({ bytes, fileName: f.fileName, mimeType: f.mimeType });
      if (ex.text) content += `\n\n## Attachment: ${f.fileName}\n${ex.text}${ex.truncated ? "\n…(truncated)" : ""}`;
      if (ex.note) fileNotes.push(ex.note);
    } catch {
      fileNotes.push(`Couldn't read file: ${f.fileName}`);
    }
  }
  if (fileNotes.length) content += `\n\n## Attachment notes\n${fileNotes.join("\n")}`;

  if (content.length < 40 && images.length === 0) {
    throw new Error(
      input.files?.length
        ? "Couldn't extract enough text from the file(s) — paste the notes, or check the file."
        : "Content is too short to extract anything useful",
    );
  }
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

  // 8000 (not 3500): a large multi-record document (e.g. a full SOP walkthrough)
  // emits a long structured proposal. At 3500 the JSON truncated mid-structure,
  // parseUnified couldn't JSON.parse it, and the throw surfaced in prod as the
  // redacted "Server Components render" error. The headroom for the longer call
  // comes from the ingest route's maxDuration (Vercel Pro) — see page.tsx.
  const raw = await generate({ skill: "ingest", context, intake, maxTokens: 8000, images: images.length ? images : undefined });
  const parsed = parseUnified(raw);

  // Build the set of valid open-task ids for reassign validation. Project AND
  // client targets contribute (3-lane Phase 2: the model can now merge against a
  // client-scoped open task, not just a project one). Milestones stay project-only.
  const openTaskIds = new Set<string>();
  const milestoneIds = new Set<string>();
  for (const t of loaded) {
    if (t.kind === "project") {
      for (const ot of t.openTasks) openTaskIds.add(ot.id);
      for (const m of t.milestones) if (m.id) milestoneIds.add(m.id);
    } else if (t.kind === "client") {
      for (const ot of t.openTasks) openTaskIds.add(ot.id);
    }
  }

  // ── Stamp the diff: re-read each record's live overwritable values and set
  // op ("add" if current empty else "replace") + existing. Drop a change whose
  // proposed value equals the current value (no-op). Only keep records whose
  // kind/id correspond to a loaded target (or null-id inline-new contact). ──
  const loadedByKey = new Map(loaded.map((t) => [`${t.kind}:${t.id}`, t]));

  const records: RecordProposal[] = [];
  for (const r of parsed.records) {
    // New people go through proposedContacts — a record with no id from the
    // context block can't be applied on approve, so it never reaches the card.
    if (!r.recordId) continue;
    // Resolve which loaded target this maps to.
    const loadedTarget = loadedByKey.get(`${r.kind}:${r.recordId}`);
    if (!loadedTarget) continue; // proposal for a record we didn't supply — drop

    const current = (loadedTarget.data ?? {}) as Record<string, unknown>;

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

  // ── People & links: a link's targetId must be a loaded deal/client target
  // (mirrors the reassignTaskId validation). An unknown target demotes to the
  // focus record when the focus is a deal/client; otherwise the link drops. ──
  const focusIsCompany =
    input.focus &&
    (input.focus.kind === "deal" || input.focus.kind === "client") &&
    loadedByKey.has(`${input.focus.kind}:${input.focus.id}`);
  const seenLinks = new Set<string>();
  const contactLinks: ContactLinkProposal[] = [];
  for (const cl of parsed.contactLinks) {
    let targetKind = cl.targetKind;
    let targetId = cl.targetId;
    if (!loadedByKey.has(`${targetKind}:${targetId}`)) {
      if (!focusIsCompany) continue; // invented/stale target, nowhere to demote — drop
      targetKind = input.focus!.kind as "deal" | "client";
      targetId = input.focus!.id;
    }
    const key = `${cl.contactEmail}|${targetKind}:${targetId}`;
    if (seenLinks.has(key)) continue; // one link per person per company
    seenLinks.add(key);
    contactLinks.push({ ...cl, targetKind, targetId });
  }
  const proposedContacts = parsed.proposedContacts;

  const unified: UnifiedProposal = {
    schemaVersion: 2,
    ingestType: input.ingestType,
    summary: parsed.summary,
    keyPoints: parsed.keyPoints,
    records,
    tasks,
    ...(proposedContacts.length ? { proposedContacts } : {}),
    ...(contactLinks.length ? { contactLinks } : {}),
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
      lane: "client_records",
      status: "pending",
      matchedContactId: focusKind === "contact" ? focusId : null,
      matchedClientId: focusKind === "client" ? focusId : null,
      matchedDealId: focusKind === "deal" ? focusId : null,
      matchedProjectId: focusKind === "project" ? focusId : null,
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  // Save a COPY of the original uploads to the client/deal Drive folder (not just
  // the extracted text) + register each as an Artifact. Best-effort — a Drive
  // failure never undoes the proposal. Scope: a client target/focus wins, else a
  // deal. Screenshots saved here become vision input for the discovery report +
  // prototype later (see loadScreenshotImages).
  if (input.files?.length) {
    const clientScope =
      (input.focus?.kind === "client" ? input.focus.id : null) ??
      input.targets?.find((t) => t.kind === "client")?.id ??
      null;
    const dealScope =
      (input.focus?.kind === "deal" ? input.focus.id : null) ??
      input.targets?.find((t) => t.kind === "deal")?.id ??
      null;
    try {
      await persistIngestUploads({
        files: input.files,
        clientId: clientScope,
        dealId: dealScope,
        actorLabel: partnerLabel,
        actorPartnerId: partnerId,
      });
    } catch {
      /* non-fatal — the file copy is a convenience, not the critical path */
    }
  }

  await notifyPartner(prisma, partnerId, "approval_needed", `"${title}" is ready for your review`, { link: "/ingest" });

  revalidatePath("/ingest");
  revalidatePath("/messages");
  return { id: created.id };
}

// MilestoneStatus is @map'd (in_progress @map("in-progress")) — the create
// must receive the underscored identifier or Prisma aborts the whole tx.
const VALID_MILESTONE_STATUSES = new Set(["pending", "in_progress", "complete", "at_risk"]);

// TaskPriority is a closed enum — a stray value (the model is free-form here)
// would cast through `as TaskPriority` and abort the whole create. Validate, else
// fall back to medium.
const VALID_TASK_PRIORITIES = new Set(["high", "medium", "low"]);

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
  let contactsCreated = 0;
  let contactsMatchedExisting = 0;
  let linksCreated = 0;
  let linksUpdated = 0;
  const linksSkipped: { contactEmail: string; reason: string }[] = [];
  // Skips surfaced in audit + activity so a dedup drop is never silent.
  const tasksSkipped: { title: string; existingId: string }[] = [];
  const milestonesSkipped: { title: string; existingId: string }[] = [];
  const replaceDetail: { field: string; before: string; after: string }[] = [];
  const affected = { contacts: new Set<string>(), clients: new Set<string>(), projects: new Set<string>(), deals: new Set<string>() };
  // Contacts that already received an interaction this run — so the deal-link
  // step below never double-logs the same contact.
  const interactedContacts = new Set<string>();
  // The deal this ingest logs against (hoisted so the per-contact interactions
  // can stamp dealId too, not just the deal-link step). The full body is written
  // to the DB ONCE (the first interaction) and scoped to the client/deal so the
  // client/deal timeline can show the original words; the rest carry only summary.
  const dealLinkId = selections.dealId ?? proposal.matchedDealId ?? null;
  let commsBodyWritten = false;

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
                  body: commsBodyWritten ? null : proposal.transcript,
                  subject: proposal.title,
                  threadId: proposal.threadId,
                  clientId: focusClientId,
                  dealId: dealLinkId,
                  loggedBy: "AGENT · CLAUDE",
                },
              });
              commsBodyWritten = true;
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
          listAdditions: r.listAdditions ?? [],
          projectNotes: r.projectNotes ?? null,
        });
        totalAdds += res.adds.length;
        totalReplaces += res.replaces.length;
        totalListAdds += res.listAdds.length;
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
          // Normalize + validate the status (never trust the client): a
          // hyphenated form becomes the underscored identifier; anything
          // off-list falls back to pending instead of aborting the tx.
          const mStatus = (m.status || "pending").replace(/-/g, "_");
          await tx.milestone.create({
            data: {
              title: m.title.trim(),
              dueDate: d && !Number.isNaN(d.getTime()) ? d : null,
              status: (VALID_MILESTONE_STATUSES.has(mStatus) ? mStatus : "pending") as MilestoneStatus,
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
        // Company profile + sales intel — the deal's first field allowlist.
        // Stage is NOT a fieldChange; the signal toggle below stays the only path.
        const res = await applyDealChanges(tx, r.recordId, {
          fieldChanges: r.fieldChanges ?? [],
          listAdditions: r.listAdditions ?? [],
        });
        totalAdds += res.adds.length;
        totalReplaces += res.replaces.length;
        totalListAdds += res.listAdds.length;
        replaceDetail.push(...res.replaces);

        if (r.applyStage && r.stageSuggestion) {
          const moved = await applyDealStage(tx, r.recordId, r.stageSuggestion);
          if (moved.moved) {
            stageMoves++;
            replaceDetail.push({ field: "deal.stage", before: moved.before ?? "", after: moved.after ?? "" });
          }
        }
      }
    }

    // ── People & links (D40 relationship model) ──
    // Approved new contacts first (deduped against the book — link to the
    // existing person instead of creating a twin), then the approved
    // Contact ↔ Deal/Client links via lib/contact-links (the single write path).
    const emailToContactId = new Map<string, string>();

    for (const pc of selections.proposedContacts ?? []) {
      const name = pc.name?.trim();
      const email = pc.email?.trim().toLowerCase();
      if (!name || !email) continue;
      // Dedupe via the shared resolver: link to the existing person on an EXACT
      // email or a STRONG (same company domain + matching name) hit — that catches
      // "same person, new email", which an email-only check would miss. A FUZZY
      // name/company guess is NOT auto-linked here (it would risk merging a
      // different person); those are surfaced to the partner on the manual flow.
      const { match } = await resolveContact({ email, name, company: pc.company }, tx);
      if (match) {
        emailToContactId.set(email, match.id);
        contactsMatchedExisting++;
        continue;
      }
      const created = await createContactTx(
        tx,
        {
          name,
          email,
          title: pc.title ?? undefined,
          company: pc.company ?? undefined,
          source: `Ingest · ${proposal.title}`,
          partnerLeadId: partnerId,
        },
        "AGENT · CLAUDE",
      );
      emailToContactId.set(email, created.id);
      affected.contacts.add(created.id);
      contactsCreated++;
    }

    for (const cl of selections.contactLinks ?? []) {
      const email = cl.contactEmail?.trim().toLowerCase();
      if (!email || (cl.targetKind !== "deal" && cl.targetKind !== "client") || !cl.targetId) continue;
      // Resolve the person: just-created above, else an existing contact.
      let contactId = emailToContactId.get(email) ?? null;
      if (!contactId) {
        const found = await tx.contact.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        });
        contactId = found?.id ?? null;
        if (contactId) emailToContactId.set(email, contactId);
      }
      if (!contactId) {
        linksSkipped.push({ contactEmail: email, reason: "no matching contact on file" });
        continue;
      }
      // Confirm the target still exists — a stale id would abort the whole tx.
      const targetExists =
        cl.targetKind === "deal"
          ? await tx.deal.findUnique({ where: { id: cl.targetId }, select: { id: true } })
          : await tx.client.findUnique({ where: { id: cl.targetId }, select: { id: true } });
      if (!targetExists) {
        linksSkipped.push({ contactEmail: email, reason: `${cl.targetKind} no longer exists` });
        continue;
      }
      const linked = await linkContact(tx, {
        contactId,
        dealId: cl.targetKind === "deal" ? cl.targetId : null,
        clientId: cl.targetKind === "client" ? cl.targetId : null,
        relationship: cl.relationship,
        role: cl.role,
        isPrimary: cl.isPrimary,
        addedBy: "AGENT · CLAUDE",
      });
      if (linked.created) linksCreated++;
      else linksUpdated++;
      affected.contacts.add(contactId);
      if (cl.targetKind === "deal") affected.deals.add(cl.targetId);
      else affected.clients.add(cl.targetId);
    }

    // ── Link a partner-selected pipeline deal ──
    // Log the summary as an interaction on the deal's PRIMARY contact
    // (interactions are contact-scoped, so "against the deal" = on its contact).
    // Skipped if that contact already got an interaction above (no double-log).
    // dealLinkId is hoisted above so the records loop can stamp it too.
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
              body: commsBodyWritten ? null : proposal.transcript,
              subject: proposal.title,
              threadId: proposal.threadId,
              clientId: focusClientId,
              dealId: dealLinkId,
              loggedBy: "AGENT · CLAUDE",
            },
          });
          commsBodyWritten = true;
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
      if (!t.title?.trim()) continue; // owner may be empty → the task lands UNASSIGNED
      const d = t.due ? new Date(t.due) : null;
      const due = d && !Number.isNaN(d.getTime()) ? d : null; // no stated date → no date (not the source date)

      if (t.reassignTaskId) {
        const existing = await tx.task.findUnique({ where: { id: t.reassignTaskId }, select: { ownerId: true } });
        if (existing) {
          await tx.task.update({
            where: { id: t.reassignTaskId },
            data: { ownerId: t.ownerId || null, assignedById: partnerId },
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
          priority: (VALID_TASK_PRIORITIES.has(t.priority) ? t.priority : "medium") as TaskPriority,
          due,
          context: t.context?.trim() || `From ingest: ${proposal.title}`,
          ownerId: t.ownerId || null, // empty → unassigned (not the reviewer)
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
        contactsCreated,
        contactsMatchedExisting,
        linksCreated,
        linksUpdated,
        linksSkipped,
        artifact: !!driveUrl,
        driveFileId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: proposal.title,
      detail: `Ingest approved — ${totalAdds} add(s), ${totalReplaces} overwrite(s), ${tasksCreated + tasksReassigned} task(s)${contactsCreated ? `, ${contactsCreated} new contact(s)` : ""}${linksCreated + linksUpdated ? `, ${linksCreated + linksUpdated} people link(s)` : ""}${tasksSkipped.length || milestonesSkipped.length ? `, ${tasksSkipped.length + milestonesSkipped.length} skipped as already-open duplicate(s)` : ""}${summary.length > 60 ? "" : ` · ${summary}`}`,
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

// ── 7. extractFinanceFromComposer — the GREEN lane (financials) entry from the
// composer. A dropped/pasted invoice, receipt, or remittance (decision 2: finance
// from all sources) runs the finance extraction (ingest-email skill), files the
// invoice document to Drive AP-Unpaid at ingest via fileBillDoc, and persists a v1
// finance IngestProposal (lane="financial") — the SAME shape a Gmail finance row
// has, so the green card and the finance actions read it identically. Writes no
// Bill/Expense: the partner files it from the green card (propose-never-auto-write).
export async function extractFinanceFromComposer(input: {
  title: string;
  date: string; // YYYY-MM-DD
  content: string;
  emailBlock?: string;
  clientId?: string | null;
  projectId?: string | null;
  // Uploaded files (base64) — parsed server-side; the first PDF/image is filed.
  files?: { base64: string; mimeType: string; fileName: string }[];
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  let content = input.content.trim();

  // Parse uploads: images → Claude vision; PDFs/docs → text. The FIRST PDF/image is
  // the document we file to Drive AP-Unpaid (the invoice/receipt scan).
  const fileNotes: string[] = [];
  const images: { base64: string; mediaType: string }[] = [];
  let invoiceFile: { base64: string; mimeType: string; fileName: string } | null = null;
  for (const f of input.files ?? []) {
    const imgType = imageMediaType(f.fileName);
    const isPdf = /\.pdf$/i.test(f.fileName) || f.mimeType === "application/pdf";
    if ((imgType || isPdf) && !invoiceFile) invoiceFile = f;
    if (imgType) {
      if (images.length >= 5) fileNotes.push(`Skipped extra image (max 5): ${f.fileName}`);
      else if (f.base64.length > 7_000_000) fileNotes.push(`Image too large (max ~5MB): ${f.fileName}`);
      else {
        images.push({ base64: f.base64, mediaType: imgType });
        content += `\n\n## Attached image: ${f.fileName}`;
      }
      continue;
    }
    if (!isExtractable(f.fileName)) {
      fileNotes.push(`Unsupported file — skipped: ${f.fileName}`);
      continue;
    }
    try {
      const bytes = Buffer.from(f.base64, "base64");
      const ex = await extractFile({ bytes, fileName: f.fileName, mimeType: f.mimeType });
      if (ex.text) content += `\n\n## Attachment: ${f.fileName}\n${ex.text}${ex.truncated ? "\n…(truncated)" : ""}`;
      if (ex.note) fileNotes.push(ex.note);
    } catch {
      fileNotes.push(`Couldn't read file: ${f.fileName}`);
    }
  }
  if (fileNotes.length) content += `\n\n## Attachment notes\n${fileNotes.join("\n")}`;

  const intake = input.emailBlock?.trim() ? `${content}\n\n## Email\n${input.emailBlock.trim()}` : content;
  if (intake.trim().length < 20 && images.length === 0) {
    throw new Error("Nothing to read — drop the invoice/receipt file or paste its text.");
  }

  const title = input.title.trim() || "Finance document";
  const date = input.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim()) ? input.date.trim() : new Date().toISOString().slice(0, 10);
  const docDate = new Date(date);

  let clientName: string | null = null;
  if (input.clientId) {
    const cl = await prisma.client.findUnique({ where: { id: input.clientId }, select: { company: true } });
    clientName = cl?.company ?? null;
  }

  // The "## Finance label" note is what unlocks the finance fields in the
  // ingest-email skill (it leaves them at defaults otherwise).
  const context = [
    `## Finance label`,
    `This is a finance document (invoice / receipt / remittance) dropped or pasted into the composer. Classify it into one financeType and fill the finance fields.`,
    ``,
    `## Source`,
    `Title: ${title}`,
    `Date: ${date}`,
    clientName ? `Client: ${clientName}` : `Client: (none — may be firm overhead)`,
  ].join("\n");

  const raw = await generate({
    skill: "ingest-email",
    context,
    intake: `## Document\n${intake}`,
    maxTokens: 2000,
    images: images.length ? images : undefined,
  });
  let proposal = parseFinanceProposal(raw);

  // Resolve the outstanding invoice an AR remittance pays (mirrors the poll's
  // finalizeFinance) so the green card can show the suggested match.
  if (proposal.financeType === "ar_payment" && proposal.ar) {
    const m = await matchOutstandingInvoice({ clientId: input.clientId ?? null, invoiceNumber: proposal.ar.invoiceNumber, amount: proposal.ar.amount });
    proposal = { ...proposal, arMatch: m ? { invoiceId: m.id, number: m.number, amount: m.amount } : null };
  }

  // File the document to Drive AP-Unpaid at ingest (same destination the poll
  // uses). Bypasses the client/deal-folder helper, so firm-overhead finance (no
  // client) still files. Best-effort: a Drive hiccup leaves attachment null and the
  // bill flags "needs document" once filed.
  let attachment: { driveUrl: string; driveFileId: string; fileName: string } | null = null;
  if (invoiceFile) {
    try {
      const bytes = Buffer.from(invoiceFile.base64, "base64");
      const res = await fileBillDoc({ bytes, fileName: invoiceFile.fileName, year: docDate.getFullYear(), mimeType: invoiceFile.mimeType });
      attachment = { driveUrl: res.webViewLink, driveFileId: res.fileId, fileName: invoiceFile.fileName };
    } catch {
      /* non-fatal — partner can upload the document later */
    }
  }

  const stored = { ...proposal, ...(attachment ? { attachment } : {}) };

  const created = await prisma.ingestProposal.create({
    data: {
      source: input.files?.length ? "drop" : "paste",
      title,
      meetingDate: docDate,
      transcript: intake.slice(0, 20000),
      proposal: stored as object,
      lane: "financial",
      status: "pending",
      // Finance ties to a client/project or firm-level, never a deal (decision 3).
      matchedClientId: input.clientId ?? null,
      matchedProjectId: input.projectId ?? null,
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  await notifyPartner(prisma, partnerId, "approval_needed", `Finance document "${title}" is ready to file`, { link: "/ingest" });
  revalidatePath("/ingest");
  revalidatePath("/messages");
  return { id: created.id };
}

// ── 8. extractIntroFromComposer — the PURPLE lane (intro / channel partner) entry
// from the composer. A pasted/dropped intro or BD call with an external person and
// no client/deal (docs/ingest-lane4-intro-and-call-review.md §2). Runs the
// ingest-meeting skill in its Lane-4 mode, persists a v1 intro IngestProposal
// (lane="intro"). Ties to no client/contact/deal at capture — the introducer is
// created or matched on approve. Writes nothing to a real record (propose-never-
// auto-write). The purple review card confirms the contact, BD tasks, targeting
// candidate, and call review before anything is written.
export async function extractIntroFromComposer(input: {
  title: string;
  date: string; // YYYY-MM-DD
  content: string;
  emailBlock?: string;
  files?: { base64: string; mimeType: string; fileName: string }[];
}): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  let content = input.content.trim();

  // Parse uploads: images → Claude vision; PDFs/docs → text. (An intro call is
  // usually a pasted transcript; files are handled for parity with the composer.)
  const fileNotes: string[] = [];
  const images: { base64: string; mediaType: string }[] = [];
  for (const f of input.files ?? []) {
    const imgType = imageMediaType(f.fileName);
    if (imgType) {
      if (images.length >= 5) fileNotes.push(`Skipped extra image (max 5): ${f.fileName}`);
      else if (f.base64.length > 7_000_000) fileNotes.push(`Image too large (max ~5MB): ${f.fileName}`);
      else {
        images.push({ base64: f.base64, mediaType: imgType });
        content += `\n\n## Attached image: ${f.fileName}`;
      }
      continue;
    }
    if (!isExtractable(f.fileName)) {
      fileNotes.push(`Unsupported file — skipped: ${f.fileName}`);
      continue;
    }
    try {
      const bytes = Buffer.from(f.base64, "base64");
      const ex = await extractFile({ bytes, fileName: f.fileName, mimeType: f.mimeType });
      if (ex.text) content += `\n\n## Attachment: ${f.fileName}\n${ex.text}${ex.truncated ? "\n…(truncated)" : ""}`;
      if (ex.note) fileNotes.push(ex.note);
    } catch {
      fileNotes.push(`Couldn't read file: ${f.fileName}`);
    }
  }
  if (fileNotes.length) content += `\n\n## Attachment notes\n${fileNotes.join("\n")}`;

  const intake = input.emailBlock?.trim() ? `${content}\n\n## Email block\n${input.emailBlock.trim()}` : content;
  if (intake.trim().length < 40 && images.length === 0) {
    throw new Error("Content is too short to extract an intro from — paste the call notes/transcript.");
  }

  const title = input.title.trim() || "Intro call";
  const date = input.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim()) ? input.date.trim() : new Date().toISOString().slice(0, 10);
  const meetingDate = new Date(date);

  // The "Type: intro / channel-partner call" line is what switches the skill into
  // its Lane-4 output shape (it returns the default client shape otherwise). The
  // firm board is the dedup candidate set (an intro's BD tasks are firm-level).
  const context = [
    `## Meeting`,
    `Title: ${title}`,
    `Date: ${date}`,
    `Source: composer`,
    `Type: intro / channel-partner call (an external person, no client or deal on file) — emit the Lane-4 intro shape: a channel-partner contact, contact-scoped BD tasks, and (only by exception) a targeting candidate. Do NOT invent a client or a deal.`,
    formatOpenTaskCandidates(await fetchFirmOpenTaskCandidates(), "firm"),
  ].join("\n");

  const raw = await generate({
    skill: "ingest-meeting",
    context,
    intake: `## Transcript\n${intake}`,
    maxTokens: 3000,
    images: images.length ? images : undefined,
  });
  const proposal = parseIntroProposal(raw, input.emailBlock ?? "");

  const created = await prisma.ingestProposal.create({
    data: {
      source: input.files?.length ? "drop" : "paste",
      ingestType: "meeting",
      title,
      meetingDate,
      transcript: intake.slice(0, 20000),
      proposal: proposal as object,
      lane: "intro",
      status: "pending",
      // Intro ties to nothing at capture — the introducer is created/matched on
      // approve; never a client/deal (docs/ingest-lane4-intro-and-call-review.md §3).
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  await notifyPartner(prisma, partnerId, "approval_needed", `Intro call "${title}" is ready for your review`, { link: "/ingest" });
  revalidatePath("/ingest");
  revalidatePath("/messages");
  return { id: created.id };
}

// Parse the ingest-meeting Lane-4 JSON into the IntroProposal shape. Robust to
// code fences / stray prose (mirrors parseProposalJSON in actions.ts). The skill
// supplies raw values; everything is validated/defaulted here so a thin or
// malformed response never crashes the ingest list.
function parseIntroProposal(raw: string, emailBlockFallback: string): IntroProposal {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    o = {};
  }

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : [];

  const c = (o.contact ?? {}) as Record<string, unknown>;
  // Seed the email from the model, else the first EXTERNAL address in the pasted
  // block. The introducer is an outsider, so skip any Shift address (e.g. a
  // "From: <partner>" header line) that would otherwise key the contact.
  const emailFromBlock =
    (emailBlockFallback.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).find(
      (e) => !isInternalEmail(e),
    ) ?? null;
  const contact: IntroProposal["contact"] = {
    recordId: null, // resolved on approve (matched or created)
    name: str(c.name),
    email: strOrNull(c.email) ?? emailFromBlock,
    title: strOrNull(c.title),
    company: strOrNull(c.company),
    channelNotes: strOrNull(c.channelNotes),
  };

  const tasks: IntroProposal["tasks"] = Array.isArray(o.tasks)
    ? (o.tasks as unknown[])
        .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
        .filter((t) => typeof t.title === "string" && (t.title as string).trim())
        .map((t) => ({
          title: (t.title as string).trim(),
          context: str(t.context),
          due: typeof t.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
        }))
    : [];

  // Targeting candidate — mirror the Lane-3 knowledgeCandidate parse.
  let knowledgeCandidate: IntroProposal["knowledgeCandidate"] = null;
  const kc = o.knowledgeCandidate as Record<string, unknown> | null | undefined;
  if (kc && typeof kc === "object" && typeof kc.title === "string" && kc.title.trim()) {
    const kind = kc.kind === "decision" ? "decision" : "learning";
    knowledgeCandidate = {
      isImportant: kc.isImportant === true,
      kind,
      title: kc.title.trim(),
      context: strOrNull(kc.context),
      optionsConsidered: strOrNull(kc.optionsConsidered),
      decision: strOrNull(kc.decision),
      consequences: strOrNull(kc.consequences),
      summary: strOrNull(kc.summary),
      sensitivity: kc.sensitivity === "managing_partner" ? "managing_partner" : "firm_wide",
      rationale: strOrNull(kc.rationale),
    };
  }

  // Call review — conservative; null unless it carries real signal.
  let callReview: IntroProposal["callReview"] = null;
  const cr = o.callReview as Record<string, unknown> | null | undefined;
  if (cr && typeof cr === "object") {
    const whatWorked = strArr(cr.whatWorked);
    const whatDidnt = strArr(cr.whatDidnt);
    const lessons = strArr(cr.lessons);
    const coachingNotes = strOrNull(cr.coachingNotes);
    if (whatWorked.length || whatDidnt.length || lessons.length || coachingNotes) {
      callReview = { whatWorked, whatDidnt, lessons, coachingNotes };
    }
  }

  return {
    lane: "intro",
    ingestType: "meeting",
    summary: str(o.summary),
    keyPoints: strArr(o.keyPoints),
    contact,
    tasks,
    knowledgeCandidate,
    callReview,
  };
}

// ── 9. approveIntro — the PURPLE (Lane 4) approval gate. Mirrors approveFirmMeeting
// (a firm-level sibling of approveProposal). On approve of an intro card it:
//  1. resolves the channel-partner Contact (matched id, or create/dedup a new one)
//     and stamps Contact.isChannelPartner + channelNotes (the §3 marker),
//  2. logs the call as an Interaction on that contact (the arm's-length comms body),
//  3. creates the kept BD tasks on that contactId (category "firm", label "BD"),
//  4. writes one CallReview row tied to the logged Interaction (lane "intro"),
//  5. and, if the partner keeps the targeting candidate, writes a DRAFT
//     DecisionRecord/KnowledgeItem through the SAME Gate 1 path Lane 3 uses
//     (invisible to skills until approved in /firm-knowledge, Gate 2).
// All-or-nothing in one transaction. No client, no deal is created (the intro
// pre-dates any deal; a Deal + ContactLink come later at handoff).
export async function approveIntro(
  proposalId: string,
  selections: ApproveIntroSelections,
): Promise<{ ok: true; contactId: string; draft: { kind: "decision" | "learning"; id: string } | null }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = agentActor("ingest-meeting");

  const proposal = await prisma.ingestProposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  const c = selections.contact;
  const name = c.name?.trim();
  if (!name) throw new Error("The channel partner needs a name");
  const email = c.email?.trim() || null;
  // A brand-new contact needs an email (Contact.email is required + the match key).
  // A matched contact (recordId set) already has one — no email required to update.
  if (!c.recordId && !email) throw new Error("Add the channel partner's email to create them (it's the match key)");

  const summary = selections.summary.trim() || (proposal.proposal as IntroProposal).summary || proposal.title;

  let tasksCreated = 0;
  let tasksSkipped: { title: string; existingId: string }[] = [];
  let draft: { kind: "decision" | "learning"; id: string } | null = null;
  let callReviewId: string | null = null;
  let contactCreated = false;

  const contactId = await prisma.$transaction(async (tx) => {
    // 1. Resolve the introducer contact: a matched id, an existing contact on the
    //    email (dedup — link, don't twin), else create a new one.
    let resolvedId = c.recordId ?? null;
    if (!resolvedId && email) {
      const { match } = await resolveContact({ email, name, company: c.company }, tx);
      if (match) resolvedId = match.id;
    }
    if (!resolvedId) {
      const created = await createContactTx(
        tx,
        {
          name,
          email: email!, // guaranteed non-null above for the create path
          title: c.title ?? undefined,
          company: c.company ?? undefined,
          source: `Intro · ${proposal.title}`,
          sourceCategory: "intro",
          partnerLeadId: partnerId,
        },
        "AGENT · CLAUDE",
      );
      resolvedId = created.id;
      contactCreated = true;
    }

    // 1b. Stamp the channel-partner marker (isChannelPartner + channelNotes).
    await applyChannelPartnerMarker(tx, resolvedId, {
      isChannelPartner: c.isChannelPartner,
      channelNotes: c.channelNotes,
    });

    // 2. Log the call as an Interaction on the introducer (advances lastTouchAt).
    //    Its id anchors the CallReview + a meeting-derived DecisionRecord below.
    //    Read the resolved contact's real name/company so a MATCHED contact labels
    //    the CallReview + activity with its own name, not the parsed one.
    const contact = await tx.contact.findUnique({
      where: { id: resolvedId },
      select: { lastTouchAt: true, name: true, company: true },
    });
    const displayName = contact?.name?.trim() || name;
    const displayCompany = contact?.company?.trim() || c.company?.trim() || "";
    const interaction = await tx.interaction.create({
      data: {
        contactId: resolvedId,
        type: "meeting",
        date: proposal.meetingDate,
        summary,
        body: proposal.transcript,
        subject: proposal.title,
        loggedBy: "AGENT · CLAUDE",
      },
      select: { id: true },
    });
    if (contact && proposal.meetingDate > contact.lastTouchAt) {
      await tx.contact.update({ where: { id: resolvedId }, data: { lastTouchAt: proposal.meetingDate } });
    }

    // 3. BD tasks on the introducer contact (firm-level, category "firm", "BD").
    const bd = await applyIntroBdTasks(tx, {
      contactId: resolvedId,
      tasks: selections.tasks,
      assignedById: partnerId,
      contextFallback: `From intro call: ${proposal.title}`,
    });
    tasksCreated = bd.created;
    tasksSkipped = bd.skipped;

    // 4. One CallReview row tied to the logged Interaction (lane "intro"). Skipped
    //    when the partner cleared the block (empty → no row).
    if (selections.callReview) {
      const cr = await applyCallReview(tx, {
        title: `Intro call · ${displayName}${displayCompany ? ` (${displayCompany})` : ""}`,
        callDate: proposal.meetingDate,
        candidate: selections.callReview,
        sourceInteractionId: interaction.id,
        lane: "intro",
        contactId: resolvedId,
        createdBy: "AGENT · CLAUDE",
      });
      callReviewId = cr?.id ?? null;
    }

    // 5. Targeting candidate → a DRAFT record (Gate 1), the SAME path Lane 3 uses.
    //    reviewStatus "draft" keeps it out of every skill until a partner approves
    //    it in /firm-knowledge (Gate 2). Stamped generatedFromSkill "ingest-meeting".
    const cand = selections.candidate;
    if (cand && cand.title?.trim()) {
      const sensitivity = cand.sensitivity === "managing_partner" ? "managing_partner" : "firm_wide";
      if (cand.kind === "decision") {
        const rec = await tx.decisionRecord.create({
          data: {
            title: cand.title.trim(),
            context: cand.context?.trim() || null,
            optionsConsidered: cand.optionsConsidered?.trim() || null,
            decision: cand.decision?.trim() || summary,
            consequences: cand.consequences?.trim() || null,
            decidedAt: proposal.meetingDate,
            decidedByLabel: "AGENT · CLAUDE",
            sourceInteractionId: interaction.id,
            reviewStatus: "draft",
            sensitivity,
            generatedFromSkill: "ingest-meeting",
            createdBy: "AGENT · CLAUDE",
          },
          select: { id: true },
        });
        draft = { kind: "decision", id: rec.id };
      } else {
        const body = cand.summary?.trim() || summary;
        const rec = await tx.knowledgeItem.create({
          data: {
            title: cand.title.trim(),
            source: "transcript",
            summary: body,
            extractedText: body,
            parseStatus: "parsed",
            parsedAt: new Date(),
            observedAt: proposal.meetingDate,
            reviewStatus: "draft",
            sensitivity,
            generatedFromSkill: "ingest-meeting",
            createdBy: "AGENT · CLAUDE",
          },
          select: { id: true },
        });
        draft = { kind: "learning", id: rec.id };
      }
    }

    // 6. Mark approved + audit + activity. Nothing happens silently.
    await tx.ingestProposal.update({
      where: { id: proposalId },
      data: { status: "approved", reviewedBy: partnerLabel, reviewedAt: new Date(), matchedContactId: resolvedId },
    });

    await writeAudit(tx, {
      actor,
      action: "approve.ingestProposal.intro",
      targetType: "IngestProposal",
      targetId: proposalId,
      changes: {
        approvedBy: partnerLabel,
        lane: "intro",
        contactId: resolvedId,
        contactCreated,
        isChannelPartner: c.isChannelPartner,
        bdTasks: tasksCreated,
        bdTasksSkippedAsDuplicate: tasksSkipped.length,
        bdTasksSkipped: tasksSkipped,
        callReview: callReviewId,
        draftRecord: draft,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: displayName,
      detail: `Intro call filed — channel partner ${contactCreated ? "added" : "updated"}, ${tasksCreated} BD task(s)${tasksSkipped.length ? `, ${tasksSkipped.length} skipped as already-open duplicate(s)` : ""}${callReviewId ? ", 1 call review" : ""}${draft ? `, 1 draft ${draft.kind === "decision" ? "decision" : "knowledge item"} for review` : ""}`,
      link: `/contacts/${resolvedId}`,
    });

    return resolvedId;
  });

  revalidatePath("/ingest");
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/call-reviews");
  if (draft) {
    revalidatePath("/firm-knowledge");
    revalidatePath("/firm-knowledge/decisions");
  }
  return { ok: true, contactId, draft };
}
