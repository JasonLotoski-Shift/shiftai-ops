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
  newLabeledIds,
  getEmail,
} from "@/lib/gmail";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Pro plan — the poll fans over partners × messages

const FIRM_DOMAINS = ["shiftai.partners", "shiftcg.ai"];
function isInternal(email: string): boolean {
  const at = email.lastIndexOf("@");
  return at !== -1 && FIRM_DOMAINS.includes(email.slice(at + 1));
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
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    keyPoints: strArr(o.keyPoints),
    actionItems,
    enrichment: { contact: enrich(en.contact), client: enrich(en.client) },
    stageSignal:
      ss && typeof ss === "object" && typeof ss.suggestion === "string"
        ? { suggestion: ss.suggestion as string, rationale: typeof ss.rationale === "string" ? (ss.rationale as string) : "" }
        : null,
  };
}

async function matchByEmails(emails: string[]): Promise<{
  contactId: string | null;
  clientId: string | null;
  dealId: string | null;
  contactLabel: string | null;
}> {
  if (!emails.length) return { contactId: null, clientId: null, dealId: null, contactLabel: null };
  const contacts = await prisma.contact.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      company: true,
      primaryForClients: { select: { id: true }, take: 1, orderBy: { updatedAt: "desc" } },
      deals: { select: { id: true }, take: 1, orderBy: { updatedAt: "desc" } },
    },
  });
  if (contacts.length !== 1) return { contactId: null, clientId: null, dealId: null, contactLabel: null }; // 0 or ambiguous → unassigned
  const c = contacts[0];
  const clientId = c.primaryForClients[0]?.id ?? null;
  return {
    contactId: c.id,
    clientId,
    dealId: clientId ? null : c.deals[0]?.id ?? null,
    contactLabel: `${c.name}${c.company ? ` · ${c.company}` : ""}`,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const t0 = Date.now();
  const label = process.env.GMAIL_INGEST_LABEL ?? "ops-log";

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

  for (const conn of conns) {
    let created = 0;
    try {
      const gmail = gmailForRefreshToken(decryptSecret(conn.refreshToken));
      const labelId = await resolveLabelId(gmail, label);
      if (!labelId) {
        summary[conn.email] = `label "${label}" not found`;
        continue;
      }

      const state = await prisma.ingestSyncState.findUnique({
        where: { partnerId_source: { partnerId: conn.partnerId, source: "gmail" } },
      });

      let ids: string[];
      let latest: string | null;
      if (state?.cursor) {
        const r = await newLabeledIds(gmail, state.cursor, labelId);
        ids = r.ids;
        latest = r.latestHistoryId;
      } else {
        ids = await bootstrapLabeledIds(gmail, labelId);
        latest = await currentHistoryId(gmail);
      }

      for (const id of ids) {
        const exists = await prisma.ingestProposal.findUnique({ where: { externalId: id }, select: { id: true } });
        if (exists) continue;

        const email = await getEmail(gmail, id);
        const participants = [email.from, ...email.to, ...email.cc].filter(Boolean);
        const external = participants.filter((e) => !isInternal(e));
        if (external.length === 0) continue; // internal-only — don't ingest

        const direction = isInternal(email.from) ? "sent" : "received";
        const match = await matchByEmails(external);

        const ctx = [
          "## Email",
          `Subject: ${email.subject || "(no subject)"}`,
          `From: ${email.from}`,
          `To: ${email.to.join(", ") || "—"}`,
          `Date: ${email.date.toISOString().slice(0, 10)}`,
          `Direction: ${direction === "sent" ? "We sent this" : "We received this"}`,
          "",
          "## Matched contact",
          match.contactLabel ?? "No known contact matched — unassigned.",
        ].join("\n");

        let proposal: ExtractedProposal;
        try {
          const rawOut = await generate({
            skill: "ingest-email",
            context: ctx,
            intake: `## Email body\n${email.body}`,
            maxTokens: 2000,
          });
          proposal = parseProposal(rawOut);
        } catch {
          proposal = { summary: email.subject || "(email)", keyPoints: [], actionItems: [], enrichment: { contact: [], client: [] }, stageSignal: null };
        }

        await prisma.ingestProposal.create({
          data: {
            source: "gmail",
            externalId: id,
            title: email.subject || "(no subject)",
            meetingDate: email.date,
            transcript: email.body,
            proposal: { ...proposal, direction } as object,
            ingestType: "email",
            status: "pending",
            matchedContactId: match.contactId,
            matchedClientId: match.clientId,
            matchedDealId: match.dealId,
            createdBy: "AGENT · CLAUDE",
          },
        });
        created++;
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

      if (created > 0) {
        await notifyPartner(
          prisma,
          conn.partnerId,
          "approval_needed",
          `${created} new email${created > 1 ? "s" : ""} ready to review on Ingest`,
          { link: "/ingest" },
        );
      }
      summary[conn.email] = created;
      total += created;
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

  return NextResponse.json({ ok: true, total, partners: conns.length, summary });
}
