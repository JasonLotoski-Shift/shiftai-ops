// Tally.so integration — shared by the deal action (create a discovery form) and
// the webhook (save a submission). Server-only. Mirrors lib/fireflies.ts: one
// place for the API calls, the question→block mapping, signature verification,
// and the idempotent persist, so the action and webhook never diverge.
//
// Wire-format verified against developers.tally.so (2026-06-09):
//   - POST /forms { status, blocks[] }; each block { uuid, type, groupUuid, groupType, payload }
//   - FORM_TITLE payload {html}; INPUT_TEXT/TEXTAREA/… payload {html, isRequired}
//   - choice = a parent (MULTIPLE_CHOICE/CHECKBOXES/DROPDOWN) + child option blocks
//     whose groupUuid = the PARENT's uuid (that's the link); child payload {text,index,isFirst,isLast}
//   - RATING payload {stars}; LINEAR_SCALE payload {start,end}
//   - Webhooks are PER-FORM, not per-workspace. There is no global webhook. So after
//     creating each form we register one via POST /webhooks
//     { formId, url, eventTypes:["FORM_RESPONSE"], signingSecret } — WE supply the
//     signingSecret (Tally does not generate it), so every auto-created form shares
//     the one TALLY_WEBHOOK_SIGNING_SECRET and the route routes by formId.
//   - webhook delivery: header "Tally-Signature" = base64( HMAC-SHA256(rawBody, signingSecret) );
//     payload { eventId, eventType, data:{ formId, responseId, fields[] } };
//     choice fields carry options:[{id,text}] and value holds option ids → resolve to text.
// Some exact keys (share-url field, RANKING parent type, FILE_UPLOAD on free tier)
// are best-effort — validate on the first real form and adjust the tables here.

import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { uploadFile, folderIdFromUrl } from "@/lib/drive";
import { ensureDealDriveFolder } from "@/lib/deal-drive";
import { writeAudit, writeActivity, agentActor } from "@/lib/audit";
import { notifyPartner } from "@/lib/messaging";
import { logOps } from "@/lib/ops";

const TALLY_API = "https://api.tally.so";

// ── The structured question shape the discovery-questionnaire skill emits ──
export type SurveyQuestionType =
  | "short_text" | "long_text" | "number" | "email"
  | "single_select" | "multi_select" | "dropdown"
  | "rating" | "linear_scale" | "ranking" | "file_upload";

export type SurveyQuestion = {
  type: SurveyQuestionType;
  label: string;
  options?: string[];
  required?: boolean;
  section?: string;
};

const Q_TYPES: SurveyQuestionType[] = [
  "short_text", "long_text", "number", "email", "single_select",
  "multi_select", "dropdown", "rating", "linear_scale", "ranking", "file_upload",
];
const NEEDS_OPTIONS = new Set<SurveyQuestionType>(["single_select", "multi_select", "dropdown", "ranking"]);

/** Parse + validate the skill's JSON array. Drops malformed items; never throws. */
export function parseQuestions(raw: string): SurveyQuestion[] {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("[")) {
    const s = text.indexOf("[");
    const e = text.lastIndexOf("]");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: SurveyQuestion[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const type = o.type as SurveyQuestionType;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!Q_TYPES.includes(type) || !label) continue;
    const options = Array.isArray(o.options)
      ? o.options.filter((x): x is string => typeof x === "string" && !!x.trim()).map((s) => s.trim())
      : undefined;
    if (NEEDS_OPTIONS.has(type) && (!options || options.length < 2)) continue; // a choice needs ≥2 real options
    out.push({
      type,
      label,
      options: options && options.length ? options : undefined,
      required: !!o.required,
      section: typeof o.section === "string" ? o.section.trim() : undefined,
    });
  }
  return out;
}

// ── Question → Tally blocks ──
// Tally's real model (validated against the live API 2026-06-10): every QUESTION
// is a TITLE block carrying the label, FOLLOWED BY its input block(s). A block's
// groupType is its own structural type (NOT a generic "QUESTION"), and the label
// goes in the TITLE block's payload.html — input blocks carry NO html. Choice
// questions emit one option block per choice, all sharing ONE option groupUuid.
// (The earlier single-block / groupType:"QUESTION" / payload.html-on-input shape
// was rejected 400 VALIDATION — "groupType must be [INPUT_TEXT]", "payload.html
// is not allowed".)
type TallyBlock = { uuid: string; type: string; groupUuid: string; groupType: string; payload: Record<string, unknown> };

// How each question type renders AFTER its TITLE block:
//  - "input": one block; type === groupType; payload { isRequired, placeholder, …extra }.
//  - "choice": one block per option, sharing one groupUuid; option `type`, the
//    parent `group` as groupType; payload { text, index, isFirst, isLast, isRequired }.
// file_upload is downgraded to a "paste a link" text field (free-tier uncertain).
type BlockSpec =
  | { kind: "input"; type: string; extra?: Record<string, unknown> }
  | { kind: "choice"; type: string; group: string };

const BLOCK_MAP: Record<SurveyQuestionType, BlockSpec> = {
  short_text: { kind: "input", type: "INPUT_TEXT" },
  long_text: { kind: "input", type: "TEXTAREA" },
  number: { kind: "input", type: "INPUT_NUMBER" },
  email: { kind: "input", type: "INPUT_EMAIL" },
  rating: { kind: "input", type: "RATING", extra: { stars: 5 } },
  linear_scale: { kind: "input", type: "LINEAR_SCALE", extra: { start: 1, end: 10 } },
  file_upload: { kind: "input", type: "TEXTAREA" },
  single_select: { kind: "choice", type: "MULTIPLE_CHOICE_OPTION", group: "MULTIPLE_CHOICE" },
  multi_select: { kind: "choice", type: "CHECKBOX", group: "CHECKBOXES" },
  dropdown: { kind: "choice", type: "DROPDOWN_OPTION", group: "DROPDOWN" },
  ranking: { kind: "choice", type: "RANKING_OPTION", group: "RANKING" },
};

export function mapQuestionsToBlocks(title: string, questions: SurveyQuestion[]): TallyBlock[] {
  const blocks: TallyBlock[] = [];
  const formTitleUuid = randomUUID();
  blocks.push({ uuid: formTitleUuid, type: "FORM_TITLE", groupUuid: formTitleUuid, groupType: "FORM_TITLE", payload: { html: title } });

  for (const q of questions) {
    const spec = BLOCK_MAP[q.type] ?? BLOCK_MAP.long_text;
    const label = q.type === "file_upload" ? `${q.label} (paste a link)` : q.label;

    // Every question opens with a TITLE block carrying the label.
    const titleUuid = randomUUID();
    blocks.push({ uuid: titleUuid, type: "TITLE", groupUuid: titleUuid, groupType: "QUESTION", payload: { html: label } });

    if (spec.kind === "input") {
      const inputUuid = randomUUID();
      // placeholder is only valid on free-text inputs; RATING/LINEAR_SCALE reject it.
      const isText = ["INPUT_TEXT", "TEXTAREA", "INPUT_NUMBER", "INPUT_EMAIL"].includes(spec.type);
      blocks.push({
        uuid: inputUuid,
        type: spec.type,
        groupUuid: inputUuid,
        groupType: spec.type,
        payload: { isRequired: !!q.required, ...(isText ? { placeholder: "" } : {}), ...(spec.extra ?? {}) },
      });
    } else {
      const groupUuid = randomUUID(); // one group for all options of this question
      const opts = q.options ?? [];
      opts.forEach((opt, i) => {
        blocks.push({
          uuid: randomUUID(),
          type: spec.type,
          groupUuid,
          groupType: spec.group,
          payload: { text: opt, index: i, isFirst: i === 0, isLast: i === opts.length - 1, isRequired: !!q.required },
        });
      });
    }
  }
  return blocks;
}

/** Create a Tally form. Returns the form id + public URL. Logs an ops event.
 *  If `webhookUrl` is given AND TALLY_WEBHOOK_SIGNING_SECRET is set, also registers
 *  a per-form webhook so submissions flow back (Tally has no global webhook). */
export async function createTallyForm(input: { title: string; questions: SurveyQuestion[]; webhookUrl?: string }): Promise<{ formId: string; formUrl: string }> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) throw new Error("TALLY_API_KEY is not set — add it to .env (dev) and Vercel (prod).");
  const t0 = Date.now();
  let formId: string;
  let formUrl: string;
  try {
    const body = {
      status: "PUBLISHED",
      blocks: mapQuestionsToBlocks(input.title, input.questions),
      ...(process.env.TALLY_WORKSPACE_ID ? { workspaceId: process.env.TALLY_WORKSPACE_ID } : {}),
    };
    const res = await fetch(`${TALLY_API}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Tally API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { id?: string; formId?: string; shareUrl?: string; url?: string };
    formId = (json.id ?? json.formId) as string;
    if (!formId) throw new Error("Tally create returned no form id");
    formUrl = json.shareUrl ?? json.url ?? `https://tally.so/r/${formId}`;
    void logOps({ kind: "integration", name: "tally", status: "ok", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", durationMs: Date.now() - t0, detail: `Created form ${formId}` });
  } catch (e) {
    void logOps({ kind: "integration", name: "tally", status: "error", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", durationMs: Date.now() - t0, error: e instanceof Error ? e.message : "tally create failed" });
    throw e;
  }

  // Register the per-form webhook so responses reach us. Without it the form
  // works but no submission ever calls back. Skipped (with a loud error) if no
  // signing secret — an unsigned webhook would be rejected by the route anyway.
  if (input.webhookUrl) {
    await registerTallyWebhook({ formId, webhookUrl: input.webhookUrl, apiKey });
  }
  return { formId, formUrl };
}

/** Subscribe our endpoint to a form's responses. WE pass the signingSecret so
 *  every form shares one secret. Throws on failure (the survey row isn't written
 *  yet, so the partner sees the error and retries — the orphan form is harmless). */
export async function registerTallyWebhook(input: { formId: string; webhookUrl: string; apiKey?: string }): Promise<void> {
  const apiKey = input.apiKey ?? process.env.TALLY_API_KEY;
  const secret = process.env.TALLY_WEBHOOK_SIGNING_SECRET;
  if (!apiKey) throw new Error("TALLY_API_KEY is not set");
  if (!secret) {
    // No secret → the webhook route returns 501 and would reject anything anyway.
    void logOps({ kind: "integration", name: "tally", status: "error", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", error: `Form ${input.formId} created but TALLY_WEBHOOK_SIGNING_SECRET is unset — no webhook registered; responses will not flow back.` });
    return;
  }
  const t0 = Date.now();
  try {
    const res = await fetch(`${TALLY_API}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        formId: input.formId,
        url: input.webhookUrl,
        eventTypes: ["FORM_RESPONSE"],
        signingSecret: secret,
        isEnabled: true,
      }),
    });
    if (!res.ok) throw new Error(`Tally webhook ${res.status}: ${(await res.text()).slice(0, 300)}`);
    void logOps({ kind: "integration", name: "tally", status: "ok", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", durationMs: Date.now() - t0, detail: `Registered webhook on form ${input.formId} → ${input.webhookUrl}` });
  } catch (e) {
    void logOps({ kind: "integration", name: "tally", status: "error", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", durationMs: Date.now() - t0, error: e instanceof Error ? e.message : "tally webhook register failed" });
    throw e;
  }
}

// ── Poll side (manual "Check Tally" + a 6-hourly cron) ──
// The webhook is the primary path and delivers responses instantly; this is the
// backstop for a missed/failed delivery. It lists a form's submissions via the
// Tally API and feeds each through the SAME saveTallySubmission worker (idempotent
// on externalSubmissionId), so the poll and webhook can never diverge.
//
// NOTE: the submissions-API response shape (question/answer field names) is from
// the public docs and is best-effort — validate against a live form on first run.
// If a field name differs, parseTallySubmission yields blank answers (never a
// crash), so a wrong shape is inert, not destructive.

type TallyApiQuestion = {
  id?: string;
  type?: string;
  title?: string;
  label?: string;
  options?: { id?: string; text?: string }[];
};
type TallyApiSubmission = {
  id?: string;
  isCompleted?: boolean;
  responses?: Record<string, unknown>[];
};

/** GET /forms/{formId}/submissions — the questions table + completed submissions. */
export async function listTallySubmissions(
  formId: string,
): Promise<{ questions: TallyApiQuestion[]; submissions: TallyApiSubmission[] }> {
  const apiKey = process.env.TALLY_API_KEY;
  if (!apiKey) throw new Error("TALLY_API_KEY is not set");
  const res = await fetch(`${TALLY_API}/forms/${formId}/submissions?page=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Tally submissions ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as Record<string, unknown>;
  return {
    questions: Array.isArray(json.questions) ? (json.questions as TallyApiQuestion[]) : [],
    submissions: Array.isArray(json.submissions) ? (json.submissions as TallyApiSubmission[]) : [],
  };
}

// Reshape one submissions-API row into the WEBHOOK payload parseTallySubmission
// reads ({ data: { formId, responseId, fields:[{label,type,value,options}] } }),
// joining each response to its question for the label/type/options. Tolerant of
// the uncertain answer key (answer vs value).
function submissionToWebhookPayload(
  formId: string,
  sub: TallyApiSubmission,
  questions: TallyApiQuestion[],
): unknown {
  const qById = new Map(questions.filter((q) => q.id).map((q) => [q.id as string, q]));
  const fields = (sub.responses ?? []).map((r) => {
    const questionId = typeof r.questionId === "string" ? r.questionId : "";
    const q = questionId ? qById.get(questionId) : undefined;
    return {
      key: questionId,
      label: q?.title ?? q?.label ?? "",
      type: q?.type ?? "",
      value: r.answer ?? r.value ?? null,
      options: q?.options ?? [],
    };
  });
  return { data: { formId, responseId: sub.id, submissionId: sub.id, fields } };
}

export type TallyRescanResult = { scannedForms: number; created: number; notes: string[] };

/** Re-pull submissions for every form we have a DiscoverySurvey for and save any
 *  we haven't seen (idempotent via saveTallySubmission). Returns counts + notes. */
export async function rescanTallyForms(): Promise<TallyRescanResult> {
  const notes: string[] = [];
  if (!process.env.TALLY_API_KEY) return { scannedForms: 0, created: 0, notes: ["TALLY_API_KEY not set"] };

  const surveys = await prisma.discoverySurvey.findMany({
    where: { tallyFormId: { not: null } },
    select: { tallyFormId: true },
  });

  let created = 0;
  for (const s of surveys) {
    const formId = s.tallyFormId;
    if (!formId) continue;
    try {
      const { questions, submissions } = await listTallySubmissions(formId);
      for (const sub of submissions) {
        if (sub.isCompleted === false) continue;
        const r = await saveTallySubmission(submissionToWebhookPayload(formId, sub, questions));
        if (r.status === "saved") created++;
      }
    } catch (e) {
      notes.push(`Form ${formId}: ${e instanceof Error ? e.message.slice(0, 120) : "rescan failed"}`);
    }
  }
  return { scannedForms: surveys.length, created, notes };
}

// ── Webhook side ──
export function verifyTallySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.TALLY_WEBHOOK_SIGNING_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type TallyAnswer = { label: string; type: string; value: string };

function normalizeValue(f: Record<string, unknown>): string {
  const v = f.value;
  const options = Array.isArray(f.options) ? (f.options as { id?: string; text?: string }[]) : [];
  const resolve = (id: unknown) => options.find((o) => o.id === id)?.text ?? String(id);
  if (Array.isArray(v)) return v.map(resolve).join(", ");
  if (options.length && typeof v === "string") return resolve(v);
  if (v == null) return "";
  return String(v);
}

export function parseTallySubmission(payload: unknown): {
  formId: string | null;
  submissionId: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  answers: TallyAnswer[];
} {
  const data = ((payload as Record<string, unknown>)?.data ?? {}) as Record<string, unknown>;
  const fields = Array.isArray(data.fields) ? (data.fields as Record<string, unknown>[]) : [];
  const answers: TallyAnswer[] = [];
  let respondentEmail: string | null = null;
  let respondentName: string | null = null;
  for (const f of fields) {
    const label = typeof f.label === "string" ? f.label : typeof f.key === "string" ? f.key : "";
    const type = typeof f.type === "string" ? f.type : "";
    const value = normalizeValue(f);
    if (type.toUpperCase().includes("EMAIL") && !respondentEmail && value) respondentEmail = value;
    if (/name/i.test(label) && !respondentName && value) respondentName = value;
    answers.push({ label, type, value });
  }
  return {
    formId: typeof data.formId === "string" ? data.formId : null,
    submissionId: typeof data.responseId === "string" ? data.responseId : typeof data.submissionId === "string" ? data.submissionId : null,
    respondentName,
    respondentEmail,
    answers,
  };
}

function renderAnswersMarkdown(title: string, parsed: ReturnType<typeof parseTallySubmission>): string {
  const lines = [`# ${title} — responses`, ""];
  const who = [parsed.respondentName, parsed.respondentEmail].filter(Boolean).join(" · ");
  if (who) lines.push(`**Respondent:** ${who}`, "");
  for (const a of parsed.answers) {
    lines.push(`**${a.label}**`, "", a.value || "_(blank)_", "");
  }
  return lines.join("\n");
}

export type TallySaveResult = { status: "deduped" | "no_match" | "saved"; surveyId?: string };

/** The shared webhook worker: idempotent, matches the form, saves answers +
 *  a Drive copy + an Artifact, notifies the partner. Never the review queue. */
export async function saveTallySubmission(payload: unknown): Promise<TallySaveResult> {
  const parsed = parseTallySubmission(payload);
  if (!parsed.formId || !parsed.submissionId) return { status: "no_match" };

  const dupe = await prisma.discoverySurvey.findUnique({ where: { externalSubmissionId: parsed.submissionId }, select: { id: true } });
  if (dupe) return { status: "deduped", surveyId: dupe.id };

  const survey = await prisma.discoverySurvey.findUnique({
    where: { tallyFormId: parsed.formId },
    select: {
      id: true,
      title: true,
      dealId: true,
      clientId: true,
      deal: { select: { company: true, partnerLeadId: true } },
      client: { select: { company: true, partnerLeadId: true, driveFolderUrl: true } },
    },
  });
  if (!survey) return { status: "no_match" };

  // Drive copy (best-effort) — client folder if we have one, else the deal's
  // 00-Pipeline working folder, else the shared root.
  let driveUrl: string | null = null;
  try {
    let folder: string | null = null;
    if (survey.client?.driveFolderUrl) {
      try {
        folder = folderIdFromUrl(survey.client.driveFolderUrl);
      } catch {
        folder = null;
      }
    }
    if (!folder && survey.dealId) {
      try {
        folder = (await ensureDealDriveFolder(survey.dealId)).folderId;
      } catch {
        folder = null;
      }
    }
    if (!folder) folder = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID ?? null;
    if (folder) {
      const md = renderAnswersMarkdown(survey.title, parsed);
      const fileName = `${new Date().toISOString().slice(0, 10)}-${survey.title.replace(/\s+/g, "-").slice(0, 50)}-responses.md`;
      const up = await uploadFile(md, fileName, folder, "text/markdown");
      driveUrl = up.webViewLink;
    }
  } catch {
    /* Drive is best-effort; the DB answers are authoritative */
  }

  const company = survey.client?.company ?? survey.deal?.company ?? "the client";
  const partnerId = survey.client?.partnerLeadId ?? survey.deal?.partnerLeadId ?? null;
  const link = survey.dealId ? `/pipeline/${survey.dealId}` : survey.clientId ? `/clients/${survey.clientId}` : "/ingest";

  await prisma.$transaction(async (tx) => {
    await tx.discoverySurvey.update({
      where: { id: survey.id },
      data: {
        status: "responded",
        answers: parsed.answers as object,
        respondentName: parsed.respondentName,
        respondentEmail: parsed.respondentEmail,
        submittedAt: new Date(),
        externalSubmissionId: parsed.submissionId,
        driveUrl,
      },
    });
    if (driveUrl) {
      await tx.artifact.create({
        data: {
          type: "report",
          title: `Discovery questionnaire · ${company}`,
          driveUrl,
          createdBy: "AGENT · CLAUDE",
          generatedFromSkill: "discovery-questionnaire",
          reviewStatus: "approved",
          clientId: survey.clientId ?? null,
          dealId: survey.clientId ? null : survey.dealId ?? null,
        },
      });
    }
    await writeAudit(tx, {
      actor: agentActor("tally"),
      action: "responded.discoverySurvey",
      targetType: "DiscoverySurvey",
      targetId: survey.id,
      changes: { submissionId: parsed.submissionId, answers: parsed.answers.length },
    });
    await writeActivity(tx, {
      actor: agentActor("tally"),
      type: "doc",
      target: company,
      detail: `Discovery questionnaire returned — ${parsed.answers.length} answers`,
      link,
    });
    if (partnerId) {
      await notifyPartner(tx, partnerId, "deliverable_added", `${company} returned the discovery questionnaire — ${parsed.answers.length} answers ready for the report.`, { link });
    }
  });

  void logOps({ kind: "ingest", name: "tally", status: "ok", actor: "AGENT · CLAUDE", actorLabel: "AGENT · CLAUDE", detail: `${company} responded`, clientId: survey.clientId ?? undefined });
  return { status: "saved", surveyId: survey.id };
}
