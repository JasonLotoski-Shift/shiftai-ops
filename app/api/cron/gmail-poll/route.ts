// Gmail ingest poll (cron). For each partner who connected Gmail, read the
// messages they've labeled (incrementally, by historyId), extract each via the
// ingest-email skill, and queue a PENDING IngestProposal for review on /ingest.
// Propose-never-auto-write; idempotent on the Gmail message id.
//
// Auth: CRON_SECRET. Vercel cron sends "Authorization: Bearer $CRON_SECRET"
// automatically; ?secret=<CRON_SECRET> also works for a manual trigger.
// Schedule lives in vercel.json. See docs/gmail-integration-plan.md.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/ai";
import { decryptSecret } from "@/lib/crypto";
import { notifyPartner } from "@/lib/messaging";
import { logOps, notifyOpsFailure, pruneOpsEvents } from "@/lib/ops";
import {
  gmailForRefreshToken,
  resolveLabelId,
  currentHistoryId,
  bootstrapLabeledIds,
  listLabeledIds,
  newLabeledIds,
  getEmail,
  fetchAttachment,
} from "@/lib/gmail";
import { extractFile, isExtractable, imageMediaType } from "@/lib/ingest/extract-file";
import { resolveTargetsFromText } from "@/lib/ingest/cross-reference";
import { matchOutstandingInvoice } from "@/lib/finance-match";
import { fileBillDoc } from "@/lib/firm-finance-drive";
import { apBillFileName } from "@/lib/finance";
import type { ExtractedProposal, ExtractedBill, ExtractedAR } from "@/app/(app)/ingest/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro plan — the poll fans over partners × messages

// Best-effort: file a finance email's invoice attachment to Drive at poll time
// (the bytes are already in hand for extraction) so "Add to AP" / Reimburse can
// attach the real document. Lands in AP-Bills/Unpaid; the Drive ref is stored on
// the proposal JSON and copied onto the Bill/Expense when filed. Null on failure.
type PolledDoc = { driveUrl: string; driveFileId: string; fileName: string };
async function filePolledInvoice(
  att: { buf: Buffer; fileName: string; mimeType: string },
  date: Date,
  proposal: ExtractedProposal,
): Promise<PolledDoc | null> {
  try {
    const billInfo = (proposal as { bill?: { vendor?: string | null; invoiceNumber?: string | null; amount?: number | null } | null }).bill;
    const dotExt = att.fileName.includes(".")
      ? att.fileName.split(".").pop()!.toLowerCase()
      : att.mimeType.includes("pdf") ? "pdf" : "bin";
    const fileName = apBillFileName({
      issuedAt: date,
      vendor: billInfo?.vendor?.trim() || "vendor",
      number: billInfo?.invoiceNumber ?? null,
      amount: billInfo?.amount ?? 0,
      ext: dotExt,
    });
    const res = await fileBillDoc({ bytes: att.buf, fileName, year: date.getFullYear(), mimeType: att.mimeType });
    return { driveUrl: res.webViewLink, driveFileId: res.fileId, fileName };
  } catch {
    return null;
  }
}

const FIRM_DOMAINS = ["shiftai.partners", "shiftcg.ai"];
function isInternal(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at !== -1 && FIRM_DOMAINS.includes(email.slice(at + 1));
}

// Postgres rejects NUL (0x00) in text/jsonb. Attachment/PDF text extraction can
// carry it; strip before any DB write.
function stripNul(s: string): string {
  return s.split(String.fromCharCode(0)).join("");
}

// A stale Gmail historyId (cursor older than ~1 week) makes history.list 404 with
// "Requested entity was not found". Detect it so the poll can reset rather than
// dead-end. Matches the Gmail/Gaxios 404 by code, HTTP status, or message.
function isExpiredHistory(e: unknown): boolean {
  const err = e as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  if (err?.code === 404 || err?.code === "404" || err?.status === 404 || err?.response?.status === 404) return true;
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes("not found") || msg.includes("starthistoryid") || msg.includes("invalid history");
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  return req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

// Lenient parse of the skill's JSON output → ExtractedProposal (mirrors the
// meeting ingest parser; tolerates fences / stray prose).
function parseProposal(raw: string): ExtractedProposal {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  const o = JSON.parse(text) as Record<string, unknown>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  const actionItems = Array.isArray(o.actionItems)
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
  const enrich = (v: unknown) =>
    Array.isArray(v)
      ? (v as unknown[])
          .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
          .filter((x) => typeof x.field === "string" && typeof x.value === "string" && (x.value as string).trim())
          .map((x) => ({ field: (x.field as string).trim(), value: (x.value as string).trim() }))
      : [];
  const en = (o.enrichment ?? {}) as Record<string, unknown>;
  const ss = o.stageSignal as Record<string, unknown> | null | undefined;
  // ── Finance classification (only honoured for finance-label mail) ──
  const FINANCE_TYPES = ["ap_bill", "reimbursable", "ar_payment", "firm_paid", "none"];
  const financeType = (typeof o.financeType === "string" && FINANCE_TYPES.includes(o.financeType)
    ? o.financeType
    : "none") as NonNullable<ExtractedProposal["financeType"]>;
  const payer = typeof o.payer === "string" && o.payer.trim() ? o.payer.trim() : null;

  // Invoice/receipt line — used by ap_bill | reimbursable | firm_paid. Parsed
  // whenever the skill returned a `bill` object (amount is in its OWN currency;
  // conversion to CAD happens at file time).
  const bd = o.bill && typeof o.bill === "object" ? (o.bill as Record<string, unknown>) : null;
  const billVendor = bd && typeof bd.vendor === "string" ? bd.vendor.trim() : "";
  const billAmount = bd
    ? typeof bd.amount === "number"
      ? Math.round(bd.amount)
      : typeof bd.amount === "string"
        ? Math.round(Number(bd.amount.replace(/[^0-9.-]/g, "")))
        : 0
    : 0;
  // Keep the bill line when EITHER a vendor OR a positive amount is present, so a
  // link-only finance email (no amount) still pre-fills the vendor / invoice # /
  // due on the green card. amount stays 0 when unknown (renders blank; the card's
  // file-time check blocks a $0 filing). Both empty → no bill line.
  const hasBillAmount = Number.isFinite(billAmount) && billAmount > 0;
  const bill: ExtractedBill | null =
    bd && (billVendor || hasBillAmount)
      ? {
          vendor: billVendor,
          amount: hasBillAmount ? billAmount : 0,
          currency: typeof bd.currency === "string" && bd.currency.trim() ? bd.currency.trim().toUpperCase() : "CAD",
          invoiceNumber: typeof bd.invoiceNumber === "string" && bd.invoiceNumber.trim() ? bd.invoiceNumber.trim() : undefined,
          dueDate: typeof bd.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(bd.dueDate) ? bd.dueDate : undefined,
        }
      : null;
  // AR — a payment / remittance on an invoice WE sent. Reconcile-only downstream.
  const ad = o.ar && typeof o.ar === "object" ? (o.ar as Record<string, unknown>) : null;
  const arAmount =
    ad && typeof ad.amount === "number"
      ? Math.round(ad.amount)
      : ad && typeof ad.amount === "string"
        ? Math.round(Number((ad.amount as string).replace(/[^0-9.-]/g, "")))
        : undefined;
  const ar: ExtractedAR | null = ad
    ? {
        invoiceNumber: typeof ad.invoiceNumber === "string" && ad.invoiceNumber.trim() ? ad.invoiceNumber.trim() : undefined,
        amount: typeof arAmount === "number" && Number.isFinite(arAmount) && arAmount > 0 ? arAmount : undefined,
        paidDate: typeof ad.paidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ad.paidDate) ? ad.paidDate : undefined,
        clientHint: typeof ad.clientHint === "string" && ad.clientHint.trim() ? ad.clientHint.trim() : undefined,
      }
    : null;
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    keyPoints: strArr(o.keyPoints),
    actionItems,
    enrichment: { contact: enrich(en.contact), client: enrich(en.client) },
    stageSignal:
      ss && typeof ss === "object" && typeof ss.suggestion === "string"
        ? { suggestion: ss.suggestion as string, rationale: typeof ss.rationale === "string" ? (ss.rationale as string) : "" }
        : null,
    financeType,
    payer,
    billCandidate: financeType === "ap_bill",
    bill,
    arCandidate: financeType === "ar_payment",
    ar,
    financeIncomplete: o.financeIncomplete === true,
    financeLinks: strArr(o.financeLinks),
  };
}

// Finance fields are only honoured for finance-label mail. For everything else
// (the general ops-log path) strip them so ordinary email never books AP/AR. For
// a finance-label AR candidate, resolve the outstanding invoice it refers to so
// the review can show the suggested match (re-verified at reconcile time).
async function finalizeFinance(
  proposal: ExtractedProposal,
  fromFinance: boolean,
  clientId: string | null,
): Promise<ExtractedProposal> {
  if (!fromFinance) {
    return {
      ...proposal,
      financeType: "none",
      payer: null,
      billCandidate: false,
      bill: null,
      arCandidate: false,
      ar: null,
      arMatch: null,
      financeIncomplete: false,
      financeLinks: [],
    };
  }
  let arMatch: ExtractedProposal["arMatch"] = null;
  if (proposal.financeType === "ar_payment" && proposal.ar) {
    const m = await matchOutstandingInvoice({
      clientId,
      invoiceNumber: proposal.ar.invoiceNumber,
      amount: proposal.ar.amount,
    });
    arMatch = m ? { invoiceId: m.id, number: m.number, amount: m.amount } : null;
  }
  return { ...proposal, arMatch };
}

// Resolve the engagement an email belongs to via the SHARED matcher
// (exact email → company domain → ContactLink committee → company/contact names
// → the client's sole active project). The old exact-one-contact gate dropped
// every multi-party thread to unassigned; this ranks all signals and pre-fills
// the proposal with the best guess — a SUGGESTION the partner confirms at
// approval (propose-never-auto-write; nothing is written to a client here).
async function matchEmail(input: { emails: string[]; body: string; subject: string }): Promise<{
  contactId: string | null;
  clientId: string | null;
  dealId: string | null;
  projectId: string | null;
  contactLabel: string | null;
}> {
  const empty = { contactId: null, clientId: null, dealId: null, projectId: null, contactLabel: null };
  if (!input.emails.length && !input.body.trim()) return empty;
  const { targets } = await resolveTargetsFromText({
    content: input.body,
    emailBlock: input.emails.join("\n"),
    title: input.subject,
  });
  const firstOf = (k: "client" | "deal" | "contact" | "project") => targets.find((t) => t.kind === k);
  const client = firstOf("client");
  const deal = firstOf("deal");
  const contact = firstOf("contact");
  const project = firstOf("project");
  return {
    contactId: contact?.id ?? null,
    clientId: client?.id ?? null,
    // Prefer a client; a deal only stands in when no client matched (old behavior).
    dealId: client ? null : deal?.id ?? null,
    projectId: client ? project?.id ?? null : null,
    contactLabel: contact?.label ?? client?.label ?? deal?.label ?? null,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  // Two watched labels: the general ingest label (ops-log → meetings / client
  // threads, no finance) and the finance label (ops-AR/AP → assume every email is
  // AP or AR). Both read under the one mailbox cursor below.
  const generalLabel = process.env.GMAIL_INGEST_LABEL ?? "ops-log";
  const financeLabel = process.env.GMAIL_FINANCE_LABEL ?? "ops-AR/AP";

  // One-time backfill mode (?backfill=finance): walk the ENTIRE finance label
  // (paginated, not the 25-message catch-up cap) and queue every historical bill /
  // payment for review. Idempotent on externalId, so it's safe to call repeatedly;
  // it processes up to BACKFILL_CAP items per call (to fit maxDuration) and reports
  // `more: true` while work remains. Does NOT touch the incremental cursor.
  const backfill = new URL(req.url).searchParams.get("backfill") === "finance";
  const BACKFILL_CAP = 25; // proposals per call — kept low so PDF-heavy mail fits maxDuration

  // Inert before the migration runs: if the table doesn't exist yet, no-op
  // cleanly so a pre-migration deploy doesn't 500 every hour.
  let conns: { partnerId: string; email: string; refreshToken: string; lastError: string | null }[];
  try {
    conns = await prisma.partnerGmailAuth.findMany({
      select: { partnerId: true, email: true, refreshToken: true, lastError: true },
    });
  } catch {
    return NextResponse.json({ ok: true, total: 0, note: "gmail ingest not migrated yet" });
  }

  const summary: Record<string, number | string> = {};
  let total = 0;
  let errorCount = 0;
  let anyMore = false; // backfill: any partner still has unprocessed finance mail

  for (const conn of conns) {
    let created = 0;
    let appended = 0;
    let skipped = 0;
    let hitCap = false;
    try {
      const gmail = gmailForRefreshToken(decryptSecret(conn.refreshToken));
      const generalLabelId = await resolveLabelId(gmail, generalLabel);
      const financeLabelId = await resolveLabelId(gmail, financeLabel);
      if (!generalLabelId && !financeLabelId) {
        summary[conn.email] = `labels "${generalLabel}" / "${financeLabel}" not found`;
        continue;
      }

      const state = await prisma.ingestSyncState.findUnique({
        where: { partnerId_source: { partnerId: conn.partnerId, source: "gmail" } },
      });

      // historyId is mailbox-global, so the ONE cursor covers both labels. Query
      // each present label from the same start cursor, union the message ids
      // (order-preserving, de-duped), tag the finance-label ones, and advance the
      // cursor to the max historyId seen. A message under BOTH labels is treated
      // as finance (financeIds.add runs regardless of the dedup).
      const ids: string[] = [];
      const financeIds = new Set<string>();
      let latest: string | null = state?.cursor ?? null;

      if (backfill) {
        // Backfill: walk the ENTIRE finance label, ignore the incremental cursor.
        if (!financeLabelId) {
          summary[conn.email] = `finance label "${financeLabel}" not found`;
          continue;
        }
        for (const mid of await listLabeledIds(gmail, financeLabelId)) {
          ids.push(mid);
          financeIds.add(mid);
        }
        latest = null; // never advance the incremental cursor in backfill
      } else {
        const watched = [
          { id: generalLabelId, finance: false },
          { id: financeLabelId, finance: true },
        ].filter((w): w is { id: string; finance: boolean } => !!w.id);
        const dedup = new Set<string>();
        const addIds = (list: string[], finance: boolean) => {
          for (const mid of list) {
            if (!dedup.has(mid)) { dedup.add(mid); ids.push(mid); }
            if (finance) financeIds.add(mid);
          }
        };

        let bootstrap = !state?.cursor;
        if (state?.cursor) {
          try {
            for (const w of watched) {
              const r = await newLabeledIds(gmail, state.cursor, w.id);
              addIds(r.ids, w.finance);
              if (latest === null || BigInt(r.latestHistoryId) > BigInt(latest)) latest = r.latestHistoryId;
            }
          } catch (e) {
            if (!isExpiredHistory(e)) throw e;
            // Gmail keeps mailbox history for ~1 week, so a cursor left untouched
            // longer than that 404s ("Requested entity was not found") and the poll
            // would dead-end forever. Self-heal: drop the partial incremental read
            // and re-bootstrap recent labeled mail for both labels, resetting the
            // cursor to current. The per-message externalId guard keeps the catch-up
            // idempotent (already-filed mail is skipped before any fetch).
            ids.length = 0; dedup.clear(); financeIds.clear();
            bootstrap = true;
            void logOps({ kind: "integration", name: "gmail", status: "ok", actor: conn.email, actorLabel: conn.email, detail: `${conn.email}: history cursor expired — re-bootstrapped` });
          }
        }
        if (bootstrap) {
          for (const w of watched) addIds(await bootstrapLabeledIds(gmail, w.id), w.finance);
          latest = await currentHistoryId(gmail);
        }
      }

      for (const id of ids) {
        if (backfill && created + appended >= BACKFILL_CAP) { hitCap = true; break; }
        const fromFinance = financeIds.has(id);
        // One bad message must never fail the whole partner's poll. A since-deleted
        // message 404s getEmail ("Requested entity was not found"); a create that
        // raced a concurrent run trips the externalId unique constraint. Either way
        // skip that message and keep going (the rest of the mail still flows).
        try {
        // The per-MESSAGE externalId still guards the FIRST message of a thread
        // (and standalone mail) from a re-poll. Appended replies are guarded by
        // the messageIds[] check below — their id is never an externalId.
        const exists = await prisma.ingestProposal.findUnique({ where: { externalId: id }, select: { id: true } });
        if (exists) continue;

        const email = await getEmail(gmail, id);
        const participants = [email.from, ...email.to, ...email.cc].filter(Boolean);
        const external = participants.filter((e) => !isInternal(e));
        if (external.length === 0) continue; // internal-only — don't ingest

        const direction = isInternal(email.from) ? "sent" : "received";
        const threadId = email.threadId || null;

        // Thread-collapse: if this thread already has a PENDING proposal, this
        // reply appends to it (one growing card) instead of spawning a new one.
        const pendingThread = threadId
          ? await prisma.ingestProposal.findFirst({
              where: { source: "gmail", threadId, status: "pending" },
              select: {
                id: true,
                transcript: true,
                proposal: true,
                matchedContactId: true,
                matchedClientId: true,
                matchedDealId: true,
                matchedProjectId: true,
              },
            })
          : null;

        // Idempotency for an APPENDED message (its id isn't the externalId): skip
        // if we've already folded it into this thread (survives a mid-poll retry).
        const seenIds: string[] =
          pendingThread && Array.isArray((pendingThread.proposal as { messageIds?: unknown }).messageIds)
            ? ((pendingThread.proposal as { messageIds: string[] }).messageIds)
            : [];
        if (pendingThread && seenIds.includes(id)) continue;

        // Read supported attachments (capped: <=5 files, ~15MB total). Text files
        // are parsed into the body; images are read by Claude vision. Per-attachment
        // try/catch so one bad file never fails the message.
        let fullBody = email.body;
        const attachNotes: string[] = [];
        const emailImages: { base64: string; mediaType: string }[] = [];
        let attachBytes = 0;
        // On a finance email, keep the first PDF/image — it's the invoice we file to Drive.
        let invoiceAttachment: { buf: Buffer; fileName: string; mimeType: string } | null = null;
        const relevant = email.attachments.filter((a) => isExtractable(a.fileName) || imageMediaType(a.fileName));
        for (const att of relevant.slice(0, 5)) {
          if (attachBytes + att.size > 15_000_000) {
            attachNotes.push(`Skipped large attachment: ${att.fileName}`);
            continue;
          }
          try {
            const buf = await fetchAttachment(gmail, id, att.attachmentId);
            attachBytes += buf.length;
            if (fromFinance && !invoiceAttachment && (imageMediaType(att.fileName) || /\.pdf$/i.test(att.fileName) || att.mimeType === "application/pdf")) {
              invoiceAttachment = { buf, fileName: att.fileName, mimeType: att.mimeType };
            }
            const imgType = imageMediaType(att.fileName);
            if (imgType) {
              if (buf.length > 5_000_000) {
                attachNotes.push(`Image too large (max ~5MB): ${att.fileName}`);
                continue;
              }
              emailImages.push({ base64: buf.toString("base64"), mediaType: imgType });
              fullBody += `\n\n## Attached image: ${att.fileName}`;
              continue;
            }
            const ex = await extractFile({ bytes: buf, fileName: att.fileName, mimeType: att.mimeType });
            if (ex.text) fullBody += `\n\n## Attachment: ${att.fileName}\n${ex.text}${ex.truncated ? "\n…(truncated)" : ""}`;
            if (ex.note) attachNotes.push(ex.note);
          } catch {
            attachNotes.push(`Couldn't read attachment: ${att.fileName}`);
          }
        }
        if (attachNotes.length) fullBody += `\n\n## Attachment notes\n${attachNotes.join("\n")}`;
        // Postgres text/jsonb can't store NUL (0x00), which attachment/PDF text
        // extraction sometimes carries. Strip it so the row inserts instead of
        // throwing "invalid byte sequence for encoding UTF8: 0x00".
        fullBody = stripNul(fullBody);

        const match = await matchEmail({ emails: external, body: email.body, subject: email.subject });
        const buildCtx = (isThread: boolean) =>
          [
            "## Email",
            `Subject: ${email.subject || "(no subject)"}`,
            `From: ${email.from}`,
            `To: ${email.to.join(", ") || "—"}`,
            `Date: ${email.date.toISOString().slice(0, 10)}`,
            `Direction: ${direction === "sent" ? "We sent this" : "We received this"}`,
            isThread ? "This is a REPLY on an existing thread — the intake is the WHOLE conversation, oldest first. Summarize the thread as a whole and extract action items from its latest state." : "",
            fromFinance
              ? "\n## Finance label\nThis email was filed under the finance label. Assume it is an account payable (a vendor bill we owe) OR an account receivable (a payment / remittance on an invoice WE sent). Classify it: set billCandidate+bill for AP, or arCandidate+ar for AR. If the email only LINKS OUT to view or pay an invoice (no amount in the body, no attached invoice), set financeIncomplete:true and put the URL(s) in financeLinks — do not guess the amount."
              : "",
            "",
            "## Matched contact",
            match.contactLabel ?? "No known contact matched — unassigned.",
          ]
            .filter(Boolean)
            .join("\n");

        if (pendingThread) {
          // ── Append to the thread + re-extract over the whole conversation ──
          const combined = `${pendingThread.transcript}\n\n---\n\n## Reply · ${email.date.toISOString().slice(0, 10)} · from ${email.from}\n${fullBody}`;
          let proposal: ExtractedProposal;
          try {
            const rawOut = await generate({
              skill: "ingest-email",
              context: buildCtx(true),
              intake: `## Email thread (oldest first)\n${combined}`,
              maxTokens: 2000,
              images: emailImages.length ? emailImages : undefined,
            });
            proposal = parseProposal(rawOut);
          } catch {
            // Keep the prior extraction on a model failure — never lose the thread.
            proposal = parseProposal(JSON.stringify(pendingThread.proposal));
          }
          proposal = await finalizeFinance(proposal, fromFinance, pendingThread.matchedClientId ?? match.clientId);
          // File this reply's invoice if it carried one; else keep any doc already filed on the thread.
          const replyDoc = fromFinance && invoiceAttachment ? await filePolledInvoice(invoiceAttachment, email.date, proposal) : null;
          const threadDoc = replyDoc ?? (pendingThread.proposal as { attachment?: PolledDoc }).attachment ?? null;
          await prisma.ingestProposal.update({
            where: { id: pendingThread.id },
            data: {
              transcript: combined,
              proposal: { ...proposal, direction, messageIds: [...seenIds, id], ...(threadDoc ? { attachment: threadDoc } : {}) } as object,
              // A finance reply on an existing thread escalates the lane (never
              // downgrades) so lane stays aligned with finance detection.
              ...(fromFinance ? { lane: "financial" } : {}),
              // Never clobber a partner-confirmed match — only fill what's empty.
              matchedContactId: pendingThread.matchedContactId ?? match.contactId,
              matchedClientId: pendingThread.matchedClientId ?? match.clientId,
              matchedDealId: pendingThread.matchedDealId ?? match.dealId,
              matchedProjectId: pendingThread.matchedProjectId ?? match.projectId,
            },
          });
          appended++;
          continue;
        }

        // ── New thread (or no thread). Flag a reply that lands on an ALREADY-FILED
        // thread so the review card can offer a one-click "append to the record". ──
        const priorAnswered = threadId
          ? (await prisma.interaction.findFirst({ where: { threadId }, select: { id: true } })) ??
            (await prisma.ingestProposal.findFirst({ where: { source: "gmail", threadId, status: "approved" }, select: { id: true } }))
          : null;

        let proposal: ExtractedProposal;
        try {
          const rawOut = await generate({
            skill: "ingest-email",
            context: buildCtx(false),
            intake: `## Email body\n${fullBody}`,
            maxTokens: 2000,
            images: emailImages.length ? emailImages : undefined,
          });
          proposal = parseProposal(rawOut);
        } catch {
          proposal = { summary: email.subject || "(email)", keyPoints: [], actionItems: [], enrichment: { contact: [], client: [] }, stageSignal: null };
        }
        proposal = await finalizeFinance(proposal, fromFinance, match.clientId);
        const filedDoc = fromFinance && invoiceAttachment ? await filePolledInvoice(invoiceAttachment, email.date, proposal) : null;

        await prisma.ingestProposal.create({
          data: {
            source: "gmail",
            externalId: id,
            threadId,
            title: email.subject || "(no subject)",
            meetingDate: email.date,
            transcript: fullBody,
            proposal: { ...proposal, direction, messageIds: [id], ...(priorAnswered ? { replyToThread: true } : {}), ...(filedDoc ? { attachment: filedDoc } : {}) } as object,
            ingestType: "email",
            // Finance-labelled email -> financial lane; everything else -> gold.
            lane: fromFinance ? "financial" : "client_records",
            status: "pending",
            matchedContactId: match.contactId,
            matchedClientId: match.clientId,
            matchedDealId: match.dealId,
            matchedProjectId: match.projectId,
            createdBy: "AGENT · CLAUDE",
          },
        });
        created++;
        } catch (e) {
          skipped++;
          void logOps({ kind: "integration", name: "gmail", status: "error", actor: conn.email, actorLabel: conn.email, detail: `skipped message ${id}`, error: e instanceof Error ? e.message.slice(0, 200) : "skip" });
          continue;
        }
      }

      if (latest) {
        await prisma.ingestSyncState.upsert({
          where: { partnerId_source: { partnerId: conn.partnerId, source: "gmail" } },
          create: { partnerId: conn.partnerId, source: "gmail", cursor: latest },
          update: { cursor: latest },
        });
      }

      // Recovered — clear a prior error so the status card goes healthy and the
      // next failure re-notifies (ok→error transition).
      if (conn.lastError) {
        await prisma.partnerGmailAuth.update({ where: { partnerId: conn.partnerId }, data: { lastError: null } }).catch(() => {});
      }

      // Suppress the per-call notification during a backfill (it runs in batches
      // and would ping repeatedly) — the partner is watching /ingest fill up.
      if (!backfill && (created > 0 || appended > 0)) {
        const parts = [
          created > 0 ? `${created} new email${created > 1 ? "s" : ""}` : null,
          appended > 0 ? `${appended} thread update${appended > 1 ? "s" : ""}` : null,
        ].filter(Boolean);
        await notifyPartner(
          prisma,
          conn.partnerId,
          "approval_needed",
          `${parts.join(" + ")} ready to review on Ingest`,
          { link: "/ingest" },
        );
      }
      summary[conn.email] =
        appended > 0 || skipped > 0 || hitCap
          ? `${created} new${appended ? `, ${appended} appended` : ""}${skipped ? `, ${skipped} skipped` : ""}${hitCap ? " (more)" : ""}`
          : created;
      total += created;
      anyMore = anyMore || hitCap;
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 300) : "poll failed";
      errorCount++;
      // Surface the failure on the connection so the UI can prompt a reconnect.
      await prisma.partnerGmailAuth.update({ where: { partnerId: conn.partnerId }, data: { lastError: msg } }).catch(() => {});
      void logOps({ kind: "integration", name: "gmail", status: "error", actor: conn.email, actorLabel: conn.email, detail: conn.email, error: msg });
      // Notify the connection owner once, on the ok→error transition (lastError null→set).
      if (!conn.lastError) await notifyOpsFailure([conn.partnerId], `Gmail sync failed for ${conn.email} — reconnect in Settings.`);
      summary[conn.email] = `error: ${msg}`;
    }
  }

  // Per-partner failures already alerted their owner above; the cron row carries
  // the run health for the status page (no extra firm-wide notify to avoid noise).
  void logOps({
    kind: "cron",
    name: "gmail-poll",
    status: errorCount > 0 ? "error" : "ok",
    actor: "CRON",
    actorLabel: "CRON",
    durationMs: Date.now() - t0,
    detail: `Polled ${conns.length} partner(s) — ${total} new, ${errorCount} failed`,
    meta: { partners: conns.length, created: total, errors: errorCount, summary },
  });

  // Opportunistic retention prune (hourly cron — no dedicated job).
  await pruneOpsEvents(30);

  return NextResponse.json({ ok: true, total, partners: conns.length, summary, ...(backfill ? { more: anyMore } : {}) });
}
