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
} from "@/lib/ingest/apply";
import { fetchTargetData, buildIngestContext, formatPartnerRoster, type TargetRef } from "@/lib/ingest/context";
import { parseUnified } from "@/lib/ingest/parse";
import { findDuplicateOpenTask, findDuplicateOpenMilestone } from "@/lib/ingest/dedup";
import { resolveTargetsFromText, computeCrossReference, type DetectedTarget } from "@/lib/ingest/cross-reference";
import { extractFile, isExtractable, imageMediaType } from "@/lib/ingest/extract-file";
import { createContact } from "@/app/(app)/contacts/actions";
import { createContactTx } from "@/lib/contacts";
import { linkContact } from "@/lib/contact-links";
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

  const raw = await generate({ skill: "ingest", context, intake, maxTokens: 3500, images: images.length ? images : undefined });
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

// MilestoneStatus is @map'd (in_progress @map("in-progress")) — the create
// must receive the underscored identifier or Prisma aborts the whole tx.
const VALID_MILESTONE_STATUSES = new Set(["pending", "in_progress", "complete", "at_risk"]);

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
      // Dedupe by EMAIL only (parse guarantees a validated address on every
      // proposedContact). A name match alone is a guess — a different
      // "John Smith" at another company — and never merges silently; the
      // manual flow surfaces name matches to the partner instead.
      const existing = await tx.contact.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) {
        emailToContactId.set(email, existing.id);
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
