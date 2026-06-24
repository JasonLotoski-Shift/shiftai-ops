"use server";

// Discovery-questionnaire (Tally) + deal-scoped discovery report.
//
// Flow: generateQuestionnaire (draft structured Qs the partner edits) →
// createDiscoveryQuestionnaireForm (creates the Tally form, persists a
// DiscoverySurvey) → [client submits → webhook saves answers] →
// generate/saveDiscoveryReportForDeal (builds the client-facing report from the
// answers). Mirrors the canonical generate*/save* recipe. The webhook side lives
// in lib/tally.ts + app/api/ingest/tally.

import { Readable } from "node:stream";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive } from "@/lib/drive";
import { ensureDealDriveFolder } from "@/lib/deal-drive";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { buildDealContext } from "@/lib/deal-context";
import { loadDealDriveFiles } from "@/lib/deal-drive-context";
import { runDiscoveryChain } from "@/lib/discovery-research/chain";
import { createTallyForm, type SurveyQuestion } from "@/lib/tally";
import type { ArtifactType } from "@/lib/generated/prisma/enums";

/** Generate a deep, business-specific questionnaire as STRUCTURED questions the
 *  partner reviews/edits before a form is created. Runs a 4-round server-side
 *  research chain (research the whole company across every business function →
 *  5-6 call-anchored questions → broad whole-company coverage → critique +
 *  dedupe + assemble), so the survey learns the overall business, not just what
 *  the call happened to cover. Reads the WHOLE deal Drive folder (transcripts,
 *  notes, docs, screenshots) on round 1 only. Read-only — persistence is the
 *  separate createDiscoveryQuestionnaireForm step. */
export async function generateQuestionnaire(
  dealId: string,
  input: { focus?: string; notes?: string },
): Promise<{ questions: SurveyQuestion[] }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { context } = await buildDealContext(dealId);
  const driveCtx = await loadDealDriveFiles(dealId);

  const questions = await runDiscoveryChain({
    context,
    corpusText: driveCtx.text,
    images: driveCtx.images.length ? driveCtx.images : undefined,
    focus: input.focus,
    notes: input.notes,
    gen: generate,
  });
  if (questions.length === 0) throw new Error("The questionnaire came back empty or malformed — try again.");
  return { questions };
}

/** Create the Tally form from the (partner-edited) questions and persist a
 *  DiscoverySurvey row at status `sent`. The Tally API call is OUTSIDE the
 *  transaction (external side-effect, like the Drive create in convertDeal). */
export async function createDiscoveryQuestionnaireForm(
  dealId: string,
  input: { title: string; questions: SurveyQuestion[] },
): Promise<{ surveyId: string; tallyFormUrl: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  const title = input.title.trim() || `${deal.company} · Discovery questionnaire`;
  const questions = Array.isArray(input.questions) ? input.questions : [];
  if (questions.length === 0) throw new Error("No questions to create a form from");
  // No unresolved [NEEDS INPUT] markers in any label/option.
  assertNoNeedsInput(questions.map((q) => `${q.label} ${(q.options ?? []).join(" ")}`).join("\n"), "questionnaire");

  // Public URL Tally posts responses to. Derived from the request host (same
  // pattern as the Gmail OAuth callback) so prod uses ops.shiftai.partners; an
  // explicit TALLY_WEBHOOK_URL overrides (e.g. a tunnel for local testing).
  const host = (await headers()).get("host") ?? "localhost:3030";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const webhookUrl = process.env.TALLY_WEBHOOK_URL || `${proto}://${host}/api/ingest/tally`;

  const { formId, formUrl } = await createTallyForm({ title, questions, webhookUrl });

  const survey = await prisma.$transaction(async (tx) => {
    const created = await tx.discoverySurvey.create({
      data: {
        status: "sent",
        title,
        questions: questions as object,
        tallyFormId: formId,
        tallyFormUrl: formUrl,
        dealId: deal.id,
        createdBy: partnerLabel,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.discoverySurvey",
      targetType: "DiscoverySurvey",
      targetId: created.id,
      changes: { dealId, tallyFormId: formId, questions: questions.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: `Created a discovery questionnaire (${questions.length} questions) — send the link in the follow-up email`,
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { surveyId: survey.id, tallyFormUrl: formUrl };
}

function renderAnswersForContext(answers: unknown): string {
  if (!Array.isArray(answers)) return "";
  return (answers as { label?: string; value?: string }[])
    .map((a) => `- **${a.label ?? ""}**: ${a.value ?? ""}`)
    .join("\n");
}

/** Build the client-facing Discovery Report for a DEAL (prospect). The
 *  questionnaire answers are the PRIMARY source when the client has filled the
 *  form in — but they're optional: a call (Fireflies transcript), uploaded notes,
 *  and our own research carry the report on their own when there's no survey yet.
 *  Reads the whole deal Drive folder for that grounding (full transcripts/docs),
 *  on top of the Prisma context + the partner's framing. Read-only. */
export async function generateDiscoveryReportForDeal(
  dealId: string,
  input: { findings?: string; timeBack?: string; outcomes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const { context } = await buildDealContext(dealId);
  const survey = await prisma.discoverySurvey.findFirst({
    where: { dealId, status: "responded" },
    orderBy: { submittedAt: "desc" },
    select: { answers: true },
  });

  // Read the WHOLE deal Drive folder (call transcripts, notes, research, docs +
  // screenshots → vision) so the report grounds in what was actually said, not
  // just the one-line interaction summaries in the Prisma context. This is what
  // makes the no-questionnaire path strong; it also enriches the survey path with
  // the full call. Best-effort — a Drive hiccup degrades to record data only.
  const driveCtx = await loadDealDriveFiles(dealId);

  const parts = [context];
  if (survey?.answers) {
    parts.push(`## Discovery questionnaire responses (from the client — primary source)\n${renderAnswersForContext(survey.answers)}`);
  }
  if (driveCtx.text) {
    parts.push(`## Files from the deal's Drive folder (call transcripts, notes, research, docs)\n${driveCtx.text}`);
  }
  const fullContext = parts.join("\n\n");

  // The default findings instruction adapts to what we have: lean on the client's
  // own answers when present, else build the findings from the call + research and
  // be explicit about what's inferred (the skill marks confirmed vs estimated).
  const findingsDefault = survey?.answers
    ? "(Use the questionnaire responses above as the findings — pull the pains, systems, and numbers from their own answers.)"
    : "(No questionnaire back yet — build the findings from the call transcripts, notes, and research in the context above. Label anything you infer as estimated, mark missing load-bearing facts [NEEDS INPUT], and never invent a number, quote, or system.)";

  const intake = [
    "## Discovery findings",
    input.findings?.trim() || findingsDefault,
    `Time-back target: ${input.timeBack?.trim() || "[NEEDS INPUT: time-back target]"}`,
    `The two outcomes the close confirms (X and Y): ${input.outcomes?.trim() || "[NEEDS INPUT: the two outcomes]"}`,
  ].join("\n");

  const body = await generate({
    skill: "discovery-report",
    context: fullContext,
    intake,
    maxTokens: 10000,
    images: driveCtx.images.length ? driveCtx.images : undefined,
  });
  return { body: body.trim() };
}

/** Persist the deal's Discovery Report (HTML) → the deal's 00-Pipeline working
 *  folder + Artifact(dealId). */
export async function saveDiscoveryReportForDeal(dealId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Discovery report body is required");
  assertNoNeedsInput(body, "discovery report");

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  const { folderId } = await ensureDealDriveFolder(dealId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-discovery-report.html`;
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId], mimeType: "text/html" },
    media: { mimeType: "text/html", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload returned no ID");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "report" as ArtifactType,
        title: `Discovery report · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "discovery-report",
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.artifact.discovery-report.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, driveFileId: fileId, bodyLength: body.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: "Drafted discovery report — awaiting review",
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}
