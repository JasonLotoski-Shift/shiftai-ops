"use server";

// Meeting-ingest server actions (Phase 4b).
//
// Pipeline: paste transcript → MATCH an entity (participant emails → Contact →
// Client/Deal) → EXTRACT via generate() + the ingest-meeting skill → hold as a
// PENDING IngestProposal. A partner reviews each item and APPROVES → persist
// through the canonical recipe (Artifact + Interaction + Tasks + append-only
// enrichment + AuditLog), tagged "AGENT · CLAUDE".
//
// Non-negotiables (ROADMAP): propose-never-auto-write; don't guess the client
// (unassigned beats wrong); idempotency on the external meeting id.

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, folderIdFromUrl } from "@/lib/drive";
import { writeAudit, writeActivity, agentActor, partnerActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { generate } from "@/lib/ai";
import { formatDate, formatCAD } from "@/lib/format";
import { findDuplicateOpenTask } from "@/lib/ingest/dedup";
import { matchOutstandingInvoice } from "@/lib/finance-match";
import { convertToCad } from "@/lib/finance";
import type { ExpenseCategory } from "@/lib/types";
import type { InteractionType } from "@/lib/generated/prisma/enums";

// ── Extracted-proposal shape (mirrors the ingest-meeting skill output) ──
export type ExtractedActionItem = { title: string; owner: string | null; context: string; due: string | null };
export type ExtractedEnrich = { field: string; value: string };
// A vendor invoice detected on an email (accounts payable). Optional — only set
// by the ingest-email skill when the email is clearly a bill we owe. Surfaced in
// the Ingest review as "Add to AP" (creates a Bill). Additive: absence = no-op.
// Now only populated for emails under the finance label (ops-AR/AP).
export type ExtractedBill = {
  vendor: string;
  amount: number; // whole CAD
  currency?: string;
  invoiceNumber?: string;
  dueDate?: string; // YYYY-MM-DD
};
// A payment / remittance detected on a finance-label email (accounts receivable).
// AR is RECONCILE-ONLY: this points at an invoice WE already issued so the review
// marks it paid — it never creates a new AR record (no double-booking). Resolved
// into `arMatch` (the actual outstanding Invoice) by the poll for display.
export type ExtractedAR = {
  invoiceNumber?: string; // the firm's invoice number, if the email cites it
  amount?: number; // whole CAD, if stated
  paidDate?: string; // YYYY-MM-DD, if a payment date is stated
  clientHint?: string; // who the email is from / about, to aid matching
};
// How a finance-label email is classified. Drives which review action shows:
//  ap_bill → Add to AP (Bill) · reimbursable → Reimburse a person (Expense) ·
//  firm_paid → Log firm-paid (Expense) · ar_payment → Mark invoice paid · none.
export type FinanceType = "ap_bill" | "reimbursable" | "ar_payment" | "firm_paid" | "none";

export type ExtractedProposal = {
  summary: string;
  keyPoints: string[];
  actionItems: ExtractedActionItem[];
  enrichment: { contact: ExtractedEnrich[]; client: ExtractedEnrich[] };
  stageSignal: { suggestion: string; rationale: string } | null;
  // ── Finance (only set for emails under the finance label) ──
  financeType?: FinanceType;
  payer?: string | null; // for reimbursable — the person who paid personally
  billCandidate?: boolean; // legacy/derived: financeType === "ap_bill"
  bill?: ExtractedBill | null; // invoice/receipt line — used by ap_bill | reimbursable | firm_paid
  arCandidate?: boolean; // legacy/derived: financeType === "ar_payment"
  ar?: ExtractedAR | null;
  // The outstanding invoice the AR email matched (set server-side by the poll,
  // re-verified at reconcile time). Null = no confident match → reconcile manually.
  arMatch?: { invoiceId: string; number: string; amount: number } | null;
  // The email only linked out to view/pay an invoice (no amount / no attachment),
  // so the figures couldn't be read. The review flags it and surfaces the link(s).
  financeIncomplete?: boolean;
  financeLinks?: string[];
};

const CONTACT_LIST_FIELDS = ["keyFacts", "hobbies", "networkAffiliations"];
const CONTACT_SCALAR_FIELDS = ["persona", "communicationStyle", "background"];
const CLIENT_LIST_FIELDS = ["companyKeyFacts", "brandColors"];
const CLIENT_SCALAR_FIELDS = ["description", "headquarters", "founded", "website", "ownership", "companySize", "logoMonogram"];

function emailsFromText(text: string): string[] {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(m.map((e) => e.toLowerCase()))];
}

// ── Entity matching — participant emails → Contact → Client/Deal ──
async function matchEntity(emails: string[]): Promise<{
  contactId: string | null;
  clientId: string | null;
  dealId: string | null;
  ambiguous: boolean;
}> {
  if (emails.length === 0) return { contactId: null, clientId: null, dealId: null, ambiguous: false };

  const contacts = await prisma.contact.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: {
      id: true,
      primaryForClients: { select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      deals: { select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });

  if (contacts.length === 0) return { contactId: null, clientId: null, dealId: null, ambiguous: false };
  // More than one known participant → ambiguous which is THE contact; let the
  // partner attach. Don't guess.
  if (contacts.length > 1) return { contactId: null, clientId: null, dealId: null, ambiguous: true };

  const c = contacts[0];
  const clientId = c.primaryForClients[0]?.id ?? null;
  const dealId = clientId ? null : c.deals[0]?.id ?? null;
  return { contactId: c.id, clientId, dealId, ambiguous: false };
}

function parseProposalJSON(raw: string): ExtractedProposal {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Extraction returned malformed output — try again.");
  }

  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const actionItems: ExtractedActionItem[] = Array.isArray(o.actionItems)
    ? (o.actionItems as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .filter((a) => typeof a.title === "string" && (a.title as string).trim())
        .map((a) => ({
          title: (a.title as string).trim(),
          owner: typeof a.owner === "string" && a.owner.trim() ? (a.owner as string).trim() : null,
          context: typeof a.context === "string" ? (a.context as string).trim() : "",
          due: typeof a.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.due) ? a.due : null,
        }))
    : [];

  const enrich = (v: unknown): ExtractedEnrich[] =>
    Array.isArray(v)
      ? (v as unknown[])
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .filter((x) => typeof x.field === "string" && typeof x.value === "string" && (x.value as string).trim())
          .map((x) => ({ field: (x.field as string).trim(), value: (x.value as string).trim() }))
      : [];

  const en = (o.enrichment ?? {}) as Record<string, unknown>;
  const ss = o.stageSignal as Record<string, unknown> | null | undefined;

  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    keyPoints: strArr(o.keyPoints),
    actionItems,
    enrichment: { contact: enrich(en.contact), client: enrich(en.client) },
    stageSignal:
      ss && typeof ss === "object" && typeof ss.suggestion === "string"
        ? { suggestion: ss.suggestion, rationale: typeof ss.rationale === "string" ? ss.rationale : "" }
        : null,
  };
}

export async function extractAndQueue(input: {
  transcript: string;
  title: string;
  meetingDate: string; // YYYY-MM-DD
  participantEmails?: string;
}): Promise<{ id: string; ambiguous: boolean; matched: boolean }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerId = session.user.partnerId;
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const transcript = input.transcript.trim();
  if (transcript.length < 40) throw new Error("Transcript is too short to extract anything useful");
  const title = input.title.trim() || "Untitled meeting";
  const meetingDate = new Date(input.meetingDate);
  if (Number.isNaN(meetingDate.getTime())) throw new Error("Invalid meeting date");

  // Emails: explicit field first, else scrape the transcript.
  const explicit = emailsFromText(input.participantEmails ?? "");
  const emails = explicit.length ? explicit : emailsFromText(transcript);
  const match = await matchEntity(emails);

  // Build the context block for the skill.
  const ctxLines: string[] = [`## Meeting`, `Title: ${title}`, `Date: ${formatDate(meetingDate)}`];
  if (match.contactId) {
    const c = await prisma.contact.findUnique({
      where: { id: match.contactId },
      select: { name: true, title: true, company: true },
    });
    if (c) ctxLines.push("", "## Matched contact", `${c.name} — ${c.title} at ${c.company}`);
  } else if (match.ambiguous) {
    ctxLines.push("", "## Matched contact", "Multiple known participants — unassigned (partner will attach).");
  } else {
    ctxLines.push("", "## Matched contact", "No known participant matched — unassigned.");
  }

  const raw = await generate({
    skill: "ingest-meeting",
    context: ctxLines.join("\n"),
    intake: `## Transcript\n${transcript}`,
    maxTokens: 3000,
  });
  const proposal = parseProposalJSON(raw);

  const created = await prisma.ingestProposal.create({
    data: {
      source: "paste",
      title,
      meetingDate,
      transcript,
      proposal: proposal as object,
      status: "pending",
      matchedContactId: match.contactId,
      matchedClientId: match.clientId,
      matchedDealId: match.dealId,
      createdBy: partnerLabel,
    },
    select: { id: true },
  });

  // Tell the partner who queued it that there's a proposal awaiting review.
  // Runs outside a $transaction here — pass the singleton as db, that's fine.
  await notifyPartner(
    prisma,
    partnerId,
    "approval_needed",
    `A pasted meeting "${title}" is ready for your review`,
    { link: "/ingest" },
  );

  revalidatePath("/ingest");
  revalidatePath("/messages");
  return { id: created.id, ambiguous: match.ambiguous, matched: !!match.contactId };
}

// ── Approve: persist the partner-reviewed proposal ──
export async function approveProposal(
  id: string,
  input: {
    contactId?: string | null; // attach/override the contact for the Interaction
    clientId?: string | null;
    dealId?: string | null; // link a pipeline deal — logs the summary on its primary contact
    summary: string;
    actionItems: { title: string; ownerId: string; context: string; due: string }[];
    contactEnrich: ExtractedEnrich[];
    clientEnrich: ExtractedEnrich[];
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = agentActor("ingest-meeting");

  const proposal = await prisma.ingestProposal.findUnique({ where: { id } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  const contactId = input.contactId ?? proposal.matchedContactId;
  const clientId = input.clientId ?? proposal.matchedClientId;
  const dealId = input.dealId ?? proposal.matchedDealId;
  const summary = input.summary.trim() || (proposal.proposal as ExtractedProposal).summary || proposal.title;

  // Email proposals (Gmail) log as an email interaction and skip the Drive
  // upload — the body lives in the proposal/interaction, not a filed doc.
  const isEmail = proposal.source === "gmail";
  const direction = (proposal.proposal as { direction?: unknown }).direction;
  const interactionType: InteractionType = isEmail
    ? direction === "sent"
      ? "email_sent"
      : "email_received"
    : "meeting";

  // Upload the transcript to Drive (client folder if reachable, else root).
  const sharedRoot = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  let parentFolderId = sharedRoot ?? null;
  if (clientId) {
    const cl = await prisma.client.findUnique({ where: { id: clientId }, select: { driveFolderUrl: true } });
    if (cl?.driveFolderUrl) {
      try {
        parentFolderId = folderIdFromUrl(cl.driveFolderUrl);
      } catch {
        /* placeholder URL — fall back to root */
      }
    }
  }

  let driveUrl: string | null = null;
  let driveFileId: string | null = null;
  const fileName = `${proposal.meetingDate.toISOString().slice(0, 10)}-${proposal.title.replace(/\s+/g, "-").slice(0, 60)}-transcript.md`;
  if (parentFolderId && !isEmail) {
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
      // Drive failed — proceed with DB writes; transcript text is still in the proposal row.
    }
  }

  // Tallies surfaced in the audit + activity so a skip is never silent.
  let tasksCreated = 0;
  const tasksSkipped: { title: string; existingId: string }[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Artifact (the filed transcript), tagged AGENT · CLAUDE.
    if (driveUrl) {
      await tx.artifact.create({
        data: {
          type: "report",
          title: `Meeting transcript · ${proposal.title}`,
          driveUrl,
          fileName,
          createdBy: "AGENT · CLAUDE",
          generatedFromSkill: "ingest-meeting",
          reviewStatus: "approved",
          clientId: clientId ?? null,
          dealId: clientId ? null : dealId ?? null,
        },
      });
    }

    // 2. Interaction(s) on the relevant contact(s), advancing lastTouchAt. The
    //    attached contact and — when a deal is linked — the deal's primary
    //    contact. Interactions are contact-scoped, so logging "against the
    //    deal" means logging on its primary contact. De-duped so a single
    //    contact is never logged twice.
    const interactionContactIds = new Set<string>();
    if (contactId) interactionContactIds.add(contactId);
    if (dealId) {
      const deal = await tx.deal.findUnique({ where: { id: dealId }, select: { contactId: true } });
      if (deal?.contactId) interactionContactIds.add(deal.contactId);
    }
    // Write the full body to the DB ONCE (the first interaction), scoped to the
    // client/deal so the client/deal timeline can show the original words.
    let commsBodyWritten = false;
    for (const cid of interactionContactIds) {
      const contact = await tx.contact.findUnique({ where: { id: cid }, select: { lastTouchAt: true } });
      if (!contact) continue;
      await tx.interaction.create({
        data: {
          contactId: cid,
          type: interactionType,
          date: proposal.meetingDate,
          summary,
          body: commsBodyWritten ? null : proposal.transcript,
          subject: proposal.title,
          threadId: proposal.threadId,
          clientId: clientId ?? null,
          dealId: dealId ?? null,
          loggedBy: "AGENT · CLAUDE",
          channel: isEmail ? "gmail" : null,
        },
      });
      commsBodyWritten = true;
      if (proposal.meetingDate > contact.lastTouchAt) {
        await tx.contact.update({ where: { id: cid }, data: { lastTouchAt: proposal.meetingDate } });
      }
    }

    // Auto-ingested mail that matched NO contact still lands — one contact-less
    // comms row scoped by client/deal, so it shows on the client/deal timeline
    // instead of being silently dropped (the old behavior).
    if (interactionContactIds.size === 0 && (clientId || dealId)) {
      await tx.interaction.create({
        data: {
          contactId: null,
          type: interactionType,
          date: proposal.meetingDate,
          summary,
          body: proposal.transcript,
          subject: proposal.title,
          threadId: proposal.threadId,
          clientId: clientId ?? null,
          dealId: dealId ?? null,
          loggedBy: "AGENT · CLAUDE",
          channel: isEmail ? "gmail" : null,
        },
      });
    }

    // 3. Tasks from approved action items. Skip any that duplicate an open task
    //    already on the same client (a meeting + a follow-up email can propose
    //    the same one) — reported in the audit/activity, never silently dropped.
    for (const a of input.actionItems) {
      if (!a.title.trim() || !a.ownerId) continue;
      const dup = await findDuplicateOpenTask(tx, { title: a.title, clientId });
      if (dup) {
        tasksSkipped.push({ title: a.title.trim(), existingId: dup.id });
        continue;
      }
      const d = a.due ? new Date(a.due) : null;
      await tx.task.create({
        data: {
          title: a.title.trim(),
          priority: "medium",
          due: d && !Number.isNaN(d.getTime()) ? d : null, // no stated date → no date (not the meeting date)
          context: a.context?.trim() || `From ${isEmail ? "email" : "meeting"}: ${proposal.title}`,
          ownerId: a.ownerId,
          assignedById: session.user.partnerId,
          clientId: clientId ?? null,
        },
      });
      tasksCreated++;
    }

    // 4. Append-only enrichment.
    if (contactId && input.contactEnrich.length) {
      await applyContactEnrich(tx, contactId, input.contactEnrich);
    }
    if (clientId && input.clientEnrich.length) {
      await applyClientEnrich(tx, clientId, input.clientEnrich);
    }

    // 5. Mark the proposal approved.
    await tx.ingestProposal.update({
      where: { id },
      data: { status: "approved", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });

    await writeAudit(tx, {
      actor,
      action: "approve.ingestProposal",
      targetType: "IngestProposal",
      targetId: id,
      changes: {
        approvedBy: partnerLabel,
        contactId,
        clientId,
        dealId,
        tasks: tasksCreated,
        tasksSkippedAsDuplicate: tasksSkipped.length,
        tasksSkipped,
        contactEnrich: input.contactEnrich.length,
        clientEnrich: input.clientEnrich.length,
        artifact: !!driveUrl,
        driveFileId,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "ai",
      target: proposal.title,
      detail: `${isEmail ? "Email" : "Meeting"} ingested — ${tasksCreated} task(s)${tasksSkipped.length ? `, ${tasksSkipped.length} skipped as already-open duplicate(s)` : ""}, ${summary.length > 80 ? summary.slice(0, 77) + "…" : summary}`,
      link: contactId ? `/contacts/${contactId}` : clientId ? `/clients/${clientId}` : dealId ? `/pipeline/${dealId}` : "/ingest",
    });
  });

  revalidatePath("/ingest");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
  if (dealId) revalidatePath(`/pipeline/${dealId}`);
  return { ok: true };
}

type EnrichTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function applyContactEnrich(tx: EnrichTx, contactId: string, items: ExtractedEnrich[]) {
  const c = await tx.contact.findUnique({
    where: { id: contactId },
    select: { persona: true, communicationStyle: true, background: true, keyFacts: true, hobbies: true, networkAffiliations: true },
  });
  if (!c) return;
  const data: Record<string, unknown> = {};
  const lists: Record<string, string[]> = {
    keyFacts: [...c.keyFacts],
    hobbies: [...c.hobbies],
    networkAffiliations: [...c.networkAffiliations],
  };
  for (const it of items) {
    if (CONTACT_LIST_FIELDS.includes(it.field)) {
      if (!lists[it.field].some((v) => v.toLowerCase() === it.value.toLowerCase())) lists[it.field].push(it.value);
    } else if (CONTACT_SCALAR_FIELDS.includes(it.field)) {
      const current = (c as Record<string, unknown>)[it.field] as string | null;
      if (!current) data[it.field] = it.value;
    }
  }
  const cLists = c as unknown as Record<string, string[]>;
  for (const f of CONTACT_LIST_FIELDS) if (lists[f].length !== cLists[f].length) data[f] = lists[f];
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.contact.update({ where: { id: contactId }, data });
  }
}

async function applyClientEnrich(tx: EnrichTx, clientId: string, items: ExtractedEnrich[]) {
  const c = await tx.client.findUnique({
    where: { id: clientId },
    select: { companyKeyFacts: true, brandColors: true, description: true, headquarters: true, founded: true, website: true, ownership: true, companySize: true, logoMonogram: true },
  });
  if (!c) return;
  const data: Record<string, unknown> = {};
  const lists: Record<string, string[]> = { companyKeyFacts: [...c.companyKeyFacts], brandColors: [...c.brandColors] };
  for (const it of items) {
    if (CLIENT_LIST_FIELDS.includes(it.field)) {
      if (!lists[it.field].some((v) => v.toLowerCase() === it.value.toLowerCase())) lists[it.field].push(it.value);
    } else if (CLIENT_SCALAR_FIELDS.includes(it.field)) {
      const current = (c as Record<string, unknown>)[it.field] as string | null;
      if (!current) data[it.field] = it.value;
    }
  }
  const cLists = c as unknown as Record<string, string[]>;
  for (const f of CLIENT_LIST_FIELDS) if (lists[f].length !== cLists[f].length) data[f] = lists[f];
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.client.update({ where: { id: clientId }, data });
  }
}

export async function rejectProposal(id: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const proposal = await prisma.ingestProposal.findUnique({ where: { id }, select: { status: true } });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("Proposal already reviewed");

  await prisma.$transaction(async (tx) => {
    await tx.ingestProposal.update({
      where: { id },
      data: { status: "rejected", reviewedBy: partnerLabel, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor: agentActor("ingest-meeting"),
      action: "reject.ingestProposal",
      targetType: "IngestProposal",
      targetId: id,
      changes: { rejectedBy: partnerLabel },
    });
  });

  revalidatePath("/ingest");
  return { ok: true };
}

// Convert a bill-candidate email (the ingest-email skill flagged it as a vendor
// invoice) into a Bill (AP), status "received", source "gmail_ingest". Files the
// detected vendor/amount/number/due onto a Bill row the AP/AR tab then shows. The
// proposal is marked handled (approved) so it can't double-create. Intentionally
// NOT MP-gated: filing a detected vendor bill is data entry — the managing-partner
// gate is on viewing/paying in the AP/AR tab, not on logging what arrived.
// `settledPayoutIds` (Phase 2) links the new bill to the contractor payout(s) it
// documents in the SAME transaction — the picker that supplies them is itself
// MP-gated in the ingest card. The updateMany guards projectId + unlinked, so a
// stale or cross-project id is silently ignored rather than mis-linked.
export async function createBillFromProposal(id: string, opts?: { settledPayoutIds?: string[] }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, label);

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id },
    select: { id: true, status: true, title: true, meetingDate: true, proposal: true, matchedClientId: true, matchedProjectId: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("This item was already handled");

  const bill = (proposal.proposal as { bill?: unknown } | null)?.bill as ExtractedBill | null | undefined;
  if (!bill?.vendor?.trim() || !bill.amount || bill.amount <= 0) {
    throw new Error("No vendor-bill details detected on this item");
  }
  // Convert to CAD (the books' currency) — amount/total stay CAD; the source
  // currency + rate are kept on the row when it was foreign (e.g. USD).
  const fx = convertToCad(bill.amount, bill.currency);
  const amount = fx.cad;
  const dueAt = bill.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(bill.dueDate) ? new Date(bill.dueDate) : null;

  // Don't double-record. A vendor invoice NUMBER is the strong dup signal (same
  // vendor + same number = the same bill). We only block when the email carried a
  // number — repeat charges with no number (e.g. a monthly subscription) are
  // legitimately recurring, so those are allowed through.
  const num = bill.invoiceNumber?.trim();
  if (num) {
    const dup = await prisma.bill.findFirst({
      where: { number: { equals: num, mode: "insensitive" }, vendor: { equals: bill.vendor.trim(), mode: "insensitive" }, status: { not: "void" } },
      select: { id: true },
    });
    if (dup) throw new Error(`Already in AP: ${bill.vendor.trim()} · ${num}. Not added again.`);
  }

  // The invoice attachment filed to Drive at poll time (if any) travels onto the
  // Bill so the document is on file. No attachment → a note, and the bill flags in
  // the missing-document worklist until a PDF is uploaded.
  const att = (proposal.proposal as { attachment?: { driveUrl?: string | null; driveFileId?: string | null; fileName?: string | null } | null } | null)?.attachment ?? null;

  const billId = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        vendor: bill.vendor.trim(),
        amount,
        total: amount,
        currency: "CAD",
        origAmount: fx.origAmount,
        origCurrency: fx.origCurrency,
        fxRate: fx.fxRate,
        number: bill.invoiceNumber?.trim() || null,
        dueAt,
        issuedAt: proposal.meetingDate,
        status: "received",
        source: "gmail_ingest",
        description: proposal.title,
        clientId: proposal.matchedClientId,
        projectId: proposal.matchedProjectId,
        driveFileId: att?.driveFileId ?? null,
        driveUrl: att?.driveUrl ?? null,
        fileName: att?.fileName ?? null,
        notes: att?.driveUrl ? null : "No attachment — invoice was in the email body",
        createdBy: label,
      },
    });
    if (att?.driveUrl) {
      await tx.artifact.create({
        data: {
          type: "invoice",
          title: `AP bill — ${bill.vendor.trim()}${num ? ` · ${num}` : ""}`,
          driveUrl: att.driveUrl,
          fileName: att.fileName ?? null,
          createdBy: label,
          reviewStatus: "approved",
          clientId: proposal.matchedClientId,
          projectId: proposal.matchedProjectId,
        },
      });
    }
    // Phase 2: cross-reference the bill to the contractor payout(s) it settles.
    // Guarded to this project's still-unlinked payouts so a bad id can't mis-link.
    let linkedPayouts = 0;
    if (opts?.settledPayoutIds?.length && proposal.matchedProjectId) {
      const res = await tx.consultantPayout.updateMany({
        where: { id: { in: opts.settledPayoutIds }, projectId: proposal.matchedProjectId, settledByBillId: null },
        // A real invoice supersedes any prior "no invoice required" waiver (matches linkPayoutToBill).
        data: { settledByBillId: created.id, invoiceWaivedReason: null },
      });
      linkedPayouts = res.count;
    }
    await tx.ingestProposal.update({
      where: { id },
      data: { status: "approved", reviewedBy: label, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "create.billFromProposal",
      targetType: "Bill",
      targetId: created.id,
      changes: { vendor: bill.vendor, amount, source: "gmail_ingest", ingestProposalId: id, linkedPayouts },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: bill.vendor,
      detail: `Added AP bill from email · ${formatCAD(amount)}`,
      link: "/financials",
    });
    return created.id;
  });

  revalidatePath("/ingest");
  revalidatePath("/financials");
  return { ok: true as const, billId };
}

// File a finance email as an Expense instead of a vendor Bill:
//  - kind "reimbursable" → a PERSON (partner or consultant) paid it personally and
//    the firm owes them back (status "submitted", awaiting reimbursement).
//  - kind "firm_paid" → already paid on a firm card; a record only (status "paid").
// Converts the source currency to CAD (keeps origAmount/origCurrency/fxRate). NOT
// MP-gated — same as createBillFromProposal, it's data entry; reimbursing (paying)
// is the MP-gated step in the AP/AR tab.
export async function createExpenseFromProposal(
  id: string,
  opts: {
    kind: "reimbursable" | "firm_paid";
    paidById?: string | null;
    paidByConsultantId?: string | null;
    category?: ExpenseCategory | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, label);

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id },
    select: { id: true, status: true, title: true, meetingDate: true, proposal: true, matchedClientId: true, matchedProjectId: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("This item was already handled");

  const bill = (proposal.proposal as { bill?: unknown } | null)?.bill as ExtractedBill | null | undefined;
  if (!bill?.vendor?.trim() || !bill.amount || bill.amount <= 0) {
    throw new Error("No invoice/receipt details detected on this item");
  }

  // Resolve + validate the payer (exactly one, and only for reimbursable).
  let paidById: string | null = null;
  let paidByConsultantId: string | null = null;
  if (opts.kind === "reimbursable") {
    paidById = opts.paidById?.trim() || null;
    paidByConsultantId = opts.paidByConsultantId?.trim() || null;
    if (!paidById && !paidByConsultantId) throw new Error("Pick who to reimburse");
    if (paidById && paidByConsultantId) throw new Error("Pick one payer, not both");
    if (paidById && !(await prisma.partner.findUnique({ where: { id: paidById }, select: { id: true } }))) {
      throw new Error("Selected partner not found");
    }
    if (paidByConsultantId && !(await prisma.consultant.findUnique({ where: { id: paidByConsultantId }, select: { id: true } }))) {
      throw new Error("Selected person not found");
    }
  }

  const fx = convertToCad(bill.amount, bill.currency);
  const amount = fx.cad;
  const category: ExpenseCategory = opts.category ?? "subscription_software";

  // The receipt/invoice attachment filed to Drive at poll time (if any) — copied
  // onto the Expense; absent → flagged "needs photo".
  const att = (proposal.proposal as { attachment?: { driveUrl?: string | null; driveFileId?: string | null; fileName?: string | null } | null } | null)?.attachment ?? null;

  const expenseId = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        kind: opts.kind,
        category,
        vendor: bill.vendor.trim(),
        description: proposal.title,
        amount,
        total: amount,
        currency: "CAD",
        origAmount: fx.origAmount,
        origCurrency: fx.origCurrency,
        fxRate: fx.fxRate,
        spentAt: proposal.meetingDate,
        status: opts.kind === "firm_paid" ? "paid" : "submitted",
        paidById,
        paidByConsultantId,
        reimbursedAt: opts.kind === "firm_paid" ? proposal.meetingDate : null,
        clientId: proposal.matchedClientId,
        projectId: proposal.matchedProjectId,
        needsPhoto: !att?.driveUrl,
        driveFileId: att?.driveFileId ?? null,
        driveUrl: att?.driveUrl ?? null,
        fileName: att?.fileName ?? null,
        createdBy: label,
      },
    });
    if (att?.driveUrl) {
      await tx.artifact.create({
        data: {
          type: "other",
          title: `Receipt — ${bill.vendor.trim()} · ${formatCAD(amount)}`,
          driveUrl: att.driveUrl,
          fileName: att.fileName ?? null,
          createdBy: label,
          reviewStatus: "approved",
          clientId: proposal.matchedClientId,
          projectId: proposal.matchedProjectId,
        },
      });
    }
    await tx.ingestProposal.update({
      where: { id },
      data: { status: "approved", reviewedBy: label, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "create.expenseFromProposal",
      targetType: "Expense",
      targetId: created.id,
      changes: { vendor: bill.vendor, amount, kind: opts.kind, paidById, paidByConsultantId, source: "gmail_ingest", ingestProposalId: id },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: bill.vendor,
      detail: opts.kind === "reimbursable" ? `Reimbursable expense from email · ${formatCAD(amount)}` : `Firm-paid expense from email · ${formatCAD(amount)}`,
      link: "/financials",
    });
    return created.id;
  });

  revalidatePath("/ingest");
  revalidatePath("/financials");
  return { ok: true as const, expenseId };
}

// Reconcile an AR-candidate email (a payment / remittance the ingest-email skill
// flagged) against an invoice the firm ALREADY issued: find the single outstanding
// (sent | overdue) invoice it refers to and mark it paid. Never creates a new AR
// record — if no confident match exists, the partner reconciles manually. Mirrors
// markInvoicePaid's status guard. Same gating logic as createBillFromProposal:
// reconciliation is data entry, not a firm-money surface, so not MP-gated.
export async function reconcileInvoiceFromProposal(id: string) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, label);

  const proposal = await prisma.ingestProposal.findUnique({
    where: { id },
    select: { id: true, status: true, proposal: true, matchedClientId: true },
  });
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error("This item was already handled");

  const ar = (proposal.proposal as { ar?: unknown } | null)?.ar as ExtractedAR | null | undefined;
  if (!ar) throw new Error("No payment details detected on this item");

  // Re-match at click time — the stored arMatch can go stale (an invoice may have
  // been paid or voided since the poll ran).
  const matched = await matchOutstandingInvoice({
    clientId: proposal.matchedClientId,
    invoiceNumber: ar.invoiceNumber,
    amount: ar.amount,
  });
  if (!matched) {
    throw new Error("No matching outstanding invoice — reconcile manually on the Invoices page.");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: matched.id },
    select: { status: true, number: true },
  });
  if (!invoice) throw new Error("Matched invoice no longer exists");
  if (invoice.status !== "sent" && invoice.status !== "overdue") {
    throw new Error(`Invoice ${invoice.number} is "${invoice.status}" — can't mark paid from here.`);
  }

  const paidAt =
    ar.paidDate && /^\d{4}-\d{2}-\d{2}$/.test(ar.paidDate) ? new Date(ar.paidDate) : new Date();

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: matched.id },
      data: { status: "paid", paidAt },
    });
    await tx.ingestProposal.update({
      where: { id },
      data: { status: "approved", reviewedBy: label, reviewedAt: new Date() },
    });
    await writeAudit(tx, {
      actor,
      action: "reconcile.invoicePaidFromProposal",
      targetType: "Invoice",
      targetId: matched.id,
      changes: {
        status: { before: invoice.status, after: "paid" },
        paidAt: paidAt.toISOString(),
        ingestProposalId: id,
      },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: `Invoice ${invoice.number}`,
      detail: `Marked paid from email · ${formatCAD(matched.amount)}`,
      link: "/financials",
    });
  });

  revalidatePath("/ingest");
  revalidatePath("/invoices");
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return { ok: true as const, invoiceNumber: invoice.number };
}
