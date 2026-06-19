"use server";

// Pipeline / deal-scoped mutations.
//
// Canonical mutation recipe (see shiftai-ops/CLAUDE.md "Wire a Quick
// Action end-to-end").

import { Readable } from "node:stream";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { drive, seedClientSubfolders } from "@/lib/drive";
import { ensureDealDriveFolder, moveDealFolderToClient } from "@/lib/deal-drive";
import { writeAudit, writeActivity, partnerActor, agentActor } from "@/lib/audit";
import { assertNoNeedsInput } from "@/lib/no-hallucination";
import { generate } from "@/lib/ai";
import { renderContract, type ContractIntake } from "@/lib/contract/template";
import { latestScopeText } from "@/lib/contract/scope-source";
import { applyStandardScheduleTx } from "@/lib/billing/apply";
import { buildDealContext } from "@/lib/deal-context";
import { linkContact, repointDealLinksToClient } from "@/lib/contact-links";
import { normalizeDomain } from "@/lib/apollo";
import { validateIndustry, validateSubIndustry } from "@/lib/industries";
import type { DealStage, Industry, ArtifactType } from "@/lib/generated/prisma/enums";

/**
 * Convert a deal in stage `proposal` or `negotiation` into a signed Client.
 *
 * In one transaction:
 *   - Creates a Drive folder for the client inside the Shared Drive
 *   - Creates Client row (using the deal's company / industry / partner / contact)
 *   - Creates a starter Project row (Phase 1 — Discovery, scope = caller's input)
 *   - Flips Deal.stage → signed
 *   - Writes the audit row
 *
 * The Drive folder create happens INSIDE the transaction's await chain so a
 * later DB error rolls back the DB writes — but the Drive folder itself is
 * not rolled back (Drive has no transaction). On DB failure the orphan
 * folder is harmless and can be deleted in Drive; we log its ID in the
 * audit row so it's findable.
 *
 * Phase 4 will replace this with the /onboard-client skill (full scaffold
 * — workspace + engagement charter + per-client CLAUDE.md). For Phase 3
 * this is the minimum that flips the deal and creates the records.
 */
const VALID_PROJECT_TYPES_CONVERT = ["discovery_report", "pilot_project", "subscription", "full_build", "buyout"];

export async function convertDeal(
  dealId: string,
  input: { scope: string; projectType?: string },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  // Validate — an empty scope falls back to the deal's gathered notes below,
  // so the new project always opens with a real description.
  const scope = input.scope.trim();
  if (scope) assertNoNeedsInput(scope, "engagement scope");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") {
    throw new Error("Deal is already signed");
  }

  const projectDescription = scope || deal.notes?.trim() || "";
  if (!projectDescription) throw new Error("Engagement scope is required");

  // Accepted estimate (if any) → seeds the new project's economics + fee.
  const acceptedEstimate = await prisma.estimate.findFirst({
    where: { dealId, status: "accepted" },
    orderBy: { version: "desc" },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  // Create the Drive folder BEFORE the DB transaction so we have its ID
  // to store on the Client row. If this fails, no DB writes happen.
  const sharedDriveFolderId = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
  if (!sharedDriveFolderId) {
    throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
  }
  const folderRes = await drive.files.create({
    requestBody: {
      name: deal.company,
      mimeType: "application/vnd.google-apps.folder",
      parents: [sharedDriveFolderId],
    },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const folderId = folderRes.data.id;
  const folderUrl = folderRes.data.webViewLink;
  if (!folderId || !folderUrl) {
    throw new Error("Drive folder creation returned no ID");
  }

  // Seed the standard subfolder structure (best-effort — never blocks the
  // Client/Project create if a subfolder hiccups).
  await seedClientSubfolders(folderId);

  // If the deal accumulated working files in 00-Pipeline, move that folder into
  // the new client folder as "00-Pipeline-files" (best-effort — never blocks
  // the conversion; the files stay reachable via their Artifact links either way).
  let dealFolderMoved = false;
  if (deal.driveFolderId) {
    try {
      await moveDealFolderToClient({ dealFolderId: deal.driveFolderId, clientFolderId: folderId });
      dealFolderMoved = true;
    } catch (e) {
      console.warn(`convertDeal: couldn't move deal working folder ${deal.driveFolderId}:`, e);
    }
  }

  // Sensible defaults for fields not collected by the modal — partners
  // can edit on the Client / Project pages after convert.
  const workspacePath = `C:\\Users\\jason\\Desktop\\Shift\\03-Clients\\${deal.company.replace(/\s+/g, "")}`;
  const startDate = new Date();
  const targetEndDate = new Date(startDate);
  targetEndDate.setDate(targetEndDate.getDate() + 28); // ~4 weeks for Discovery

  // Engagement type — defaults to a discovery report (matches the seeded
  // "Phase 1 — Discovery" project); the partner can change it on the project.
  const projectType = (input.projectType && VALID_PROJECT_TYPES_CONVERT.includes(input.projectType))
    ? input.projectType
    : "discovery_report";

  const result = await prisma.$transaction(async (tx) => {
    const client = await tx.client.create({
      data: {
        company: deal.company,
        industry: deal.industry,
        revenue: "—", // partner fills in on the Client page
        driveFolderUrl: folderUrl,
        workspacePath,
        contractValue: deal.valueEstimate,
        contractSignedAt: new Date(),
        status: "on_track",
        // Seed the engagement with the deal's context — by now the note has
        // been structured by the structure-deal-notes pass on create.
        notes: deal.notes?.trim() || null,
        partnerLeadId: deal.partnerLeadId,
        primaryContactId: deal.contactId,
        // Carry the company profile gathered at deal stage onto the new
        // Client — only fields the deal actually has (?? undefined = omit).
        website: deal.website ?? undefined,
        domain:
          deal.domain ??
          (deal.website ? normalizeDomain(deal.website) || undefined : undefined),
        linkedinUrl: deal.linkedinUrl ?? undefined,
        instagramUrl: deal.instagramUrl ?? undefined,
        revenueEstimate: deal.revenueEstimate ?? undefined,
        employeeCount: deal.employeeCount ?? undefined,
        companySize: deal.companySize ?? undefined,
        headquarters: deal.headquarters ?? undefined,
        founded: deal.founded ?? undefined,
        ownership: deal.ownership ?? undefined,
        description: deal.description ?? undefined,
        subIndustry: deal.subIndustry ?? undefined,
        companyKeyFacts: deal.companyKeyFacts.length ? deal.companyKeyFacts : undefined,
        currentSystems: deal.currentSystems.length ? deal.currentSystems : undefined,
        painPoints: deal.painPoints.length ? deal.painPoints : undefined,
        enrichedAt: deal.enrichedAt ?? undefined,
      },
    });

    const project = await tx.project.create({
      data: {
        name: `${deal.company} · Phase 1 — Discovery`,
        phase: "discovery",
        projectType: projectType as never,
        status: "on_track",
        startDate,
        targetEndDate,
        // Seed the fee from the accepted estimate if present, else the deal's
        // estimated value, so the project doesn't start at $0; editable later.
        budgetFee: acceptedEstimate && acceptedEstimate.totalValue > 0 ? acceptedEstimate.totalValue : deal.valueEstimate || 0,
        description: projectDescription,
        clientId: client.id,
        partnerLeadId: deal.partnerLeadId,
        // The deal's contact owns the project on their side until told otherwise.
        clientLeadId: deal.contactId,
      },
    });

    // Convert the accepted estimate's lines into the project's economics lines,
    // carrying the tier + rate snapshots over (Phase 5).
    if (acceptedEstimate && acceptedEstimate.lines.length > 0) {
      for (let i = 0; i < acceptedEstimate.lines.length; i++) {
        const l = acceptedEstimate.lines[i];
        await tx.projectEconomicsLine.create({
          data: {
            projectId: project.id,
            role: l.role,
            hours: l.hours,
            payRateCents: l.payRateCents,
            billRateCents: l.billRateCents,
            isExtra: l.isExtra,
            sortOrder: i,
            rateTierId: l.rateTierId,
            fromFirmDefault: false,
          },
        });
      }
    }

    // Carry the discovery questionnaire(s) and EVERY deal doc over to the new
    // client — repoint (don't copy): clientId is added so they show on the
    // client's Deliverables tab, dealId stays for provenance (both FKs
    // nullable by design).
    const surveyCarry = await tx.discoverySurvey.updateMany({ where: { dealId }, data: { clientId: client.id } });
    const artifactCarry = await tx.artifact.updateMany({
      where: { dealId, clientId: null },
      data: { clientId: client.id },
    });

    // Carry the buying committee + intro paths: every Contact↔Deal link
    // re-points to the new client (merging where the contact is already
    // linked). Then make sure the deal's contact is on the client as the
    // single primary — keeping a partner-set relationship if one carried
    // over (the helper merges if the repoint already moved that link, and
    // un-stars any other primary).
    const linkCarry = await repointDealLinksToClient(tx, { dealId, clientId: client.id });
    const carriedLink = await tx.contactLink.findFirst({
      where: { contactId: deal.contactId, clientId: client.id },
      select: { relationship: true },
    });
    await linkContact(tx, {
      contactId: deal.contactId,
      clientId: client.id,
      relationship: carriedLink?.relationship ?? "works_there",
      isPrimary: true,
      addedBy: partnerLabel,
    });

    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "signed", lastTouchAt: new Date(), stageEnteredAt: new Date() },
    });

    // Auto-generate the standard client schedule from the seeded value, so the
    // new project opens with a billing plan. The shape follows the project type:
    // buy-out → one lump-sum installment; subscription → the first month
    // (month-by-month from there); everything else → 50/25/25.
    let scheduleCreated = 0;
    if (project.budgetFee > 0) {
      const sched = await applyStandardScheduleTx(tx, {
        projectId: project.id,
        value: project.budgetFee,
        startDate,
        targetEndDate,
        projectType,
      });
      scheduleCreated = sched.created;
    }

    await writeAudit(tx, {
      actor,
      action: "convert.deal.signed",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        stage: { before: deal.stage, after: "signed" },
        createdClientId: client.id,
        createdProjectId: project.id,
        installmentsCreated: scheduleCreated,
        driveFolderId: folderId,
        dealFolderMoved,
        discoverySurveysRepointed: surveyCarry.count,
        artifactsRepointed: artifactCarry.count,
        contactLinksMoved: linkCarry.moved,
        contactLinksMerged: linkCarry.merged,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: "Signed — engagement opened",
      link: `/clients/${client.id}`,
    });

    return { clientId: client.id, projectId: project.id };
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/clients");
  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Draft proposal Quick Action — generation + persistence for the `scope` skill.
//
// generateProposal: read/generate only — pulls deal + contact + recent
// interactions, runs the scope skill, returns the draft (editable in the modal).
// saveProposal: persists per the recipe — Drive upload + Artifact + AuditLog +
// Activity, one transaction. A deal has no Drive folder yet, so the file lands
// in the Shared Drive root; the Artifact is scoped to the deal.
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// updateDeal — edit a deal's core fields (company, value, stage, industry,
// close-target date, notes) plus the D40 sales-intel fields (website,
// next step, competitor, probability, budget, lost reason) from the deal
// detail page. One write; the page re-renders from it (no denormalized
// copies). A website change keeps the normalized domain in step.
//
// Stage rules mirror the board (pipeline/actions.ts updateDealStage):
//   - "signed" is NOT settable here — signing runs Convert (scaffolds the
//     Client + Project + Drive folder); a bare flip would orphan all that.
//   - An already-signed deal is frozen — it's been converted; edit the Client.
//   - A real stage change resets lastTouchAt + stageEnteredAt (the board's
//     aging color goes back to fresh).
// ──────────────────────────────────────────────────────────────────────

const VALID_STAGES_EDIT: DealStage[] = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation"];

export async function updateDeal(
  dealId: string,
  input: {
    company?: string;
    valueEstimate?: number;
    stage?: string;
    industry?: string;
    subIndustry?: string | null;
    closeTargetDate?: string; // YYYY-MM-DD
    notes?: string | null;
    website?: string | null;
    nextStep?: string | null;
    competitor?: string | null;
    probability?: number | null; // 0–100 whole percent
    budget?: string | null; // as stated/floated — free text
    lostReason?: string | null;
  },
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      company: true,
      valueEstimate: true,
      stage: true,
      industry: true,
      subIndustry: true,
      closeTargetDate: true,
      notes: true,
      website: true,
      domain: true,
      nextStep: true,
      competitor: true,
      probability: true,
      budget: true,
      lostReason: true,
    },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") {
    throw new Error("This deal is signed — edit the client it became, not the deal.");
  }

  const data: {
    company?: string;
    valueEstimate?: number;
    stage?: DealStage;
    industry?: Industry;
    subIndustry?: string | null;
    closeTargetDate?: Date;
    notes?: string | null;
    website?: string | null;
    domain?: string | null;
    nextStep?: string | null;
    competitor?: string | null;
    probability?: number | null;
    budget?: string | null;
    lostReason?: string | null;
    lastTouchAt?: Date;
    stageEnteredAt?: Date;
  } = {};
  const changes: Record<string, { before: unknown; after: unknown }> = {};

  if (input.company !== undefined) {
    const company = input.company.trim();
    if (!company) throw new Error("Company is required");
    if (company.length > 200) throw new Error("Company name is too long (max 200 chars)");
    if (company !== deal.company) {
      data.company = company;
      changes.company = { before: deal.company, after: company };
    }
  }

  if (input.valueEstimate !== undefined) {
    const value = Math.round(Number(input.valueEstimate));
    if (!Number.isFinite(value) || value < 0) throw new Error("Enter a valid estimated value");
    if (value !== deal.valueEstimate) {
      data.valueEstimate = value;
      changes.valueEstimate = { before: deal.valueEstimate, after: value };
    }
  }

  let stageChanged = false;
  if (input.stage !== undefined && input.stage !== deal.stage) {
    if (input.stage === "signed") {
      throw new Error("Use Convert → Client to sign a deal — it scaffolds the engagement.");
    }
    if (!VALID_STAGES_EDIT.includes(input.stage as DealStage)) {
      throw new Error(`Invalid stage: ${input.stage}`);
    }
    data.stage = input.stage as DealStage;
    changes.stage = { before: deal.stage, after: input.stage };
    stageChanged = true;
  }

  if (input.industry !== undefined && input.industry !== deal.industry) {
    if (!validateIndustry(input.industry)) {
      throw new Error(`Invalid industry: ${input.industry}`);
    }
    data.industry = input.industry as Industry;
    changes.industry = { before: deal.industry, after: input.industry };
  }

  // Sub-industry validated against the EFFECTIVE vertical (the new one if the
  // industry is also changing in this same edit, else the deal's current one).
  // "" clears; an off-list value is rejected so the field stays controlled.
  if (input.subIndustry !== undefined) {
    const effectiveIndustry = (data.industry ?? deal.industry) as Industry;
    const subIndustry = input.subIndustry?.trim() || null;
    if (subIndustry && !validateSubIndustry(effectiveIndustry, subIndustry)) {
      throw new Error(`Invalid sub-industry for ${effectiveIndustry}: ${subIndustry}`);
    }
    if (subIndustry !== (deal.subIndustry ?? null)) {
      data.subIndustry = subIndustry;
      changes.subIndustry = { before: deal.subIndustry ?? null, after: subIndustry };
    }
  }

  if (input.closeTargetDate !== undefined) {
    const d = new Date(input.closeTargetDate);
    if (Number.isNaN(d.getTime())) throw new Error(`Invalid close-target date: ${input.closeTargetDate}`);
    if (d.getTime() !== deal.closeTargetDate.getTime()) {
      data.closeTargetDate = d;
      changes.closeTargetDate = { before: deal.closeTargetDate.toISOString(), after: d.toISOString() };
    }
  }

  if (input.notes !== undefined) {
    const notes = input.notes?.trim() || null;
    if (notes !== (deal.notes ?? null)) {
      data.notes = notes;
      changes.notes = { before: deal.notes ?? null, after: notes };
    }
  }

  if (input.website !== undefined) {
    const website = input.website?.trim() || null;
    if (website !== (deal.website ?? null)) {
      data.website = website;
      changes.website = { before: deal.website ?? null, after: website };
      // Keep the normalized domain in step with the website.
      const domain = website ? normalizeDomain(website) || null : null;
      if (domain !== (deal.domain ?? null)) {
        data.domain = domain;
        changes.domain = { before: deal.domain ?? null, after: domain };
      }
    }
  }

  if (input.nextStep !== undefined) {
    const nextStep = input.nextStep?.trim() || null;
    if (nextStep !== (deal.nextStep ?? null)) {
      data.nextStep = nextStep;
      changes.nextStep = { before: deal.nextStep ?? null, after: nextStep };
    }
  }

  if (input.competitor !== undefined) {
    const competitor = input.competitor?.trim() || null;
    if (competitor !== (deal.competitor ?? null)) {
      data.competitor = competitor;
      changes.competitor = { before: deal.competitor ?? null, after: competitor };
    }
  }

  if (input.probability !== undefined) {
    const probability = input.probability === null ? null : Math.round(Number(input.probability));
    if (probability !== null && (!Number.isFinite(probability) || probability < 0 || probability > 100)) {
      throw new Error("Probability must be a whole number from 0 to 100");
    }
    if (probability !== (deal.probability ?? null)) {
      data.probability = probability;
      changes.probability = { before: deal.probability ?? null, after: probability };
    }
  }

  if (input.budget !== undefined) {
    const budget = input.budget?.trim() || null;
    if (budget !== (deal.budget ?? null)) {
      data.budget = budget;
      changes.budget = { before: deal.budget ?? null, after: budget };
    }
  }

  if (input.lostReason !== undefined) {
    const lostReason = input.lostReason?.trim() || null;
    if (lostReason !== (deal.lostReason ?? null)) {
      data.lostReason = lostReason;
      changes.lostReason = { before: deal.lostReason ?? null, after: lostReason };
    }
  }

  if (Object.keys(changes).length === 0) return { ok: true as const };

  // A stage move is a touch — reset both clocks so the board ages from now.
  if (stageChanged) {
    const now = new Date();
    data.lastTouchAt = now;
    data.stageEnteredAt = now;
  }

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.deal",
      targetType: "Deal",
      targetId: dealId,
      changes,
    });
    if (stageChanged) {
      await writeActivity(tx, {
        actor,
        type: "status",
        target: data.company ?? deal.company,
        detail: `Moved to ${STAGE_LABELS_EDIT[data.stage as DealStage]}`,
        link: `/pipeline/${dealId}`,
      });
    }
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// markDealReplied (D36) — a cold-emailed lead-stage deal got a reply.
//
// Guards: the deal is at stage "lead", coldOutreachAt is set, and
// outreachRepliedAt is still null. Promotes lead → qualified, stamps
// outreachRepliedAt, resets the stage clock, and logs an email_received
// Interaction on the deal's Contact. Audit (update.deal.stage) + activity.
// ──────────────────────────────────────────────────────────────────────
export async function markDealReplied(dealId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { stage: true, company: true, contactId: true, coldOutreachAt: true, outreachRepliedAt: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage !== "lead" || !deal.coldOutreachAt || deal.outreachRepliedAt) {
    throw new Error("This deal isn’t awaiting a cold-outreach reply");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({
      where: { id: dealId },
      data: { stage: "qualified", stageEnteredAt: now, lastTouchAt: now, outreachRepliedAt: now },
    });
    await tx.interaction.create({
      data: {
        contactId: deal.contactId,
        type: "email_received",
        date: now,
        summary: "Prospect replied to cold outreach",
        loggedBy: partnerLabel,
        channel: "email",
      },
    });
    await writeAudit(tx, {
      actor,
      action: "update.deal.stage",
      targetType: "Deal",
      targetId: dealId,
      changes: { stage: { before: "lead", after: "qualified" }, repliedAt: now.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: "Prospect replied — moved to Qualified",
      link: `/pipeline/${dealId}`,
    });
  });

  revalidatePath(`/pipeline/${dealId}`);
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

const STAGE_LABELS_EDIT: Record<DealStage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery Call",
  discussion: "Discussion Call",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

// ──────────────────────────────────────────────────────────────────────
// deleteDeal — permanently remove a pipeline deal and everything scoped to it.
//
// Only allowed BEFORE signing: a signed deal has become a Client (project +
// Drive folder + billing), so deleting it here would orphan all that — the
// guard sends you to the client instead. Estimates (+lines) and contact links
// cascade via their FK. The nullable-FK children (artifacts, discovery
// surveys, tasks, action drafts, prototype runs) would default to SET NULL, so
// we delete them explicitly to avoid orphan rows. Drive files the deal already
// produced are left intact — Drive has no transaction; the rows go, the files
// stay reachable in Drive.
// ──────────────────────────────────────────────────────────────────────
export async function deleteDeal(dealId: string): Promise<{ ok: true }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const actor = partnerActor(
    session.user.partnerId,
    session.user.name ?? session.user.email ?? "Unknown",
  );

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true, stage: true, valueEstimate: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.stage === "signed") {
    throw new Error("This deal is signed — it became a client. Delete the client, not the deal.");
  }

  await prisma.$transaction(async (tx) => {
    // Nullable-FK children — delete explicitly (the DB would otherwise leave
    // them as orphans with a null dealId). Sequential on the tx client.
    const artifacts = await tx.artifact.deleteMany({ where: { dealId } });
    const surveys = await tx.discoverySurvey.deleteMany({ where: { dealId } });
    const tasks = await tx.task.deleteMany({ where: { dealId } });
    const drafts = await tx.actionDraft.deleteMany({ where: { dealId } });
    const runs = await tx.prototypeRun.deleteMany({ where: { dealId } }); // run steps cascade
    // Estimates (+lines) and contact links cascade on this delete.
    await tx.deal.delete({ where: { id: dealId } });
    await writeAudit(tx, {
      actor,
      action: "delete.deal",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        company: deal.company,
        stage: deal.stage,
        valueEstimate: deal.valueEstimate,
        deleted: {
          artifacts: artifacts.count,
          discoverySurveys: surveys.count,
          tasks: tasks.count,
          actionDrafts: drafts.count,
          prototypeRuns: runs.count,
        },
      },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: deal.company,
      detail: "Deal deleted from pipeline",
      link: "/pipeline",
    });
  });

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function generateProposal(
  dealId: string,
  input: { focus: string; fee?: string; timeline?: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const { deal, context } = await buildDealContext(dealId);

  // Ground the scope in the prototype when one exists — the SOW commits to building
  // for real what the prototype demonstrated. Optional: a partner can draft a scope
  // before a prototype, and the skill handles the no-prototype case.
  const proto = await prisma.artifact.findFirst({
    where: { dealId, generatedFromSkill: { in: ["prototype-builder", "html-prototype"] } },
    orderBy: { createdAt: "desc" },
    select: { driveUrl: true },
  });

  const intake = [
    "## This scope of work",
    `Focus / what to scope: ${focus}`,
    proto?.driveUrl
      ? `Prototype already built for this deal — the scope commits to building it for real. Link: ${proto.driveUrl}`
      : "No prototype built yet — scope from the deal context.",
    `Fee to state (one-time build fee and/or monthly subscription): ${input.fee?.trim() || "(none provided — do not invent one; use [NEEDS INPUT] where a price belongs)"}`,
    `Timeline to state: ${input.timeline?.trim() || "(none provided — do not invent dates; use [NEEDS INPUT])"}`,
    `Extra notes from the partner: ${input.notes?.trim() || "(none)"}`,
    `Prepared by: ${deal.partnerLead?.name ?? "[NEEDS INPUT: preparer name]"}`,
  ].join("\n");

  const body = await generate({ skill: "scope", context, intake, maxTokens: 6000 });
  return { body: body.trim() };
}

// ──────────────────────────────────────────────────────────────────────
// Deal-scoped generative docs — discovery prep (internal) and the
// book-a-meeting note. Each follows the canonical recipe:
// generate* (read + generate, returns the editable draft) → save* (Drive
// upload → Artifact + AuditLog + Activity, one transaction). The skill name IS
// the registry key (matches the skills/<name>/SKILL.md folder).
// (The post-call survey skill was removed 2026-06-12 — the discovery
// questionnaire in tally-actions.ts covers that step with a live Tally form.)
// ──────────────────────────────────────────────────────────────────────

const DEAL_DOCS = {
  "discovery-prep": { title: "Discovery prep", fileSuffix: "discovery-prep", artifactType: "report", maxTokens: 3000 },
  "book-meeting": { title: "Meeting note", fileSuffix: "meeting-note", artifactType: "other", maxTokens: 1200 },
} as const;
type DealDocSkill = keyof typeof DEAL_DOCS;

function isDealDocSkill(s: string): s is DealDocSkill {
  return s in DEAL_DOCS;
}

export async function generateDealDoc(
  dealId: string,
  input: { skill: string; focus: string; notes?: string },
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isDealDocSkill(input.skill)) throw new Error(`Unknown deal doc skill: ${input.skill}`);

  const focus = input.focus.trim();
  if (!focus) throw new Error("Focus is required");

  const { context } = await buildDealContext(dealId);
  const cfg = DEAL_DOCS[input.skill];

  const intake = [
    `## This ${cfg.title.toLowerCase()}`,
    `Focus / what to anchor on: ${focus}`,
    `Anything else to weave in: ${input.notes?.trim() || "(none)"}`,
  ].join("\n");

  const body = await generate({ skill: input.skill, context, intake, maxTokens: cfg.maxTokens });
  return { body: body.trim() };
}

export async function saveDealDoc(dealId: string, input: { skill: string; body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  if (!isDealDocSkill(input.skill)) throw new Error(`Unknown deal doc skill: ${input.skill}`);
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);
  const cfg = DEAL_DOCS[input.skill];

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error(`${cfg.title} body is required`);
  assertNoNeedsInput(body, cfg.title.toLowerCase());

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, company: true } });
  if (!deal) throw new Error("Deal not found");

  // File into the deal's own 00-Pipeline working folder (created on first use).
  const { folderId } = await ensureDealDriveFolder(dealId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-${cfg.fileSuffix}.md`;
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId], mimeType: "text/markdown" },
    media: { mimeType: "text/markdown", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload returned no ID");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: cfg.artifactType as ArtifactType,
        title: `${cfg.title} · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: input.skill,
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.artifact.dealDoc.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, skill: input.skill, driveFileId: fileId, bodyLength: body.length },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: `Drafted ${cfg.title.toLowerCase()} — awaiting review`,
      link: `/pipeline/${dealId}`,
    });
    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Deal company web enrichment — the "Enrich from web" card on the deal
// page. Near-verbatim port of the client pattern (clients/[id]/actions.ts
// generateCompanyEnrichment / applyCompanyEnrichment), same skill
// (enrich-company-web) — the deal action passes its own current-values
// block and its own field set (no brandColors; adds socials, firmographics,
// and the Shift signal lists):
//
//   generateDealCompanyEnrichment() runs the skill with web search ON,
//     PROPOSES company-profile additions + conflicts (cited from public
//     sources), writes nothing.
//   applyDealCompanyEnrichment() merges the partner-approved additions
//     append-only: scalars set ONLY if currently empty; lists appended with
//     case-insensitive dedupe. Never overwrites — divergences come back as
//     conflicts the partner resolves by hand.
//
// revenueEstimate / employeeCount are Int columns — proposed values are
// coerced (strip $ / commas / "~", parse "12M" / "1.2B" suffixes to whole
// CAD) and skipped when ambiguous. When website lands and domain is empty,
// domain derives via normalizeDomain.
// ──────────────────────────────────────────────────────────────────────

const DEAL_ENRICH_LIST_FIELDS = ["companyKeyFacts", "currentSystems", "painPoints"] as const;
const DEAL_ENRICH_SCALAR_FIELDS = [
  "website",
  "companySize",
  "headquarters",
  "founded",
  "ownership",
  "description",
  "linkedinUrl",
  "instagramUrl",
  "revenueEstimate",
  "employeeCount",
  "subIndustry",
] as const;
// Scalars stored as Int — string proposals are coerced before merging.
const DEAL_ENRICH_INT_FIELDS = ["revenueEstimate", "employeeCount"] as const;
type DealEnrichListField = (typeof DEAL_ENRICH_LIST_FIELDS)[number];
type DealEnrichScalarField = (typeof DEAL_ENRICH_SCALAR_FIELDS)[number];
type DealEnrichField = DealEnrichListField | DealEnrichScalarField;

export type DealCompanyEnrichAddition = { field: DealEnrichField; value: string };
export type DealCompanyEnrichConflict = {
  field: DealEnrichScalarField;
  existing: string;
  proposed: string;
  note?: string;
};

const ALL_DEAL_ENRICH_FIELDS: string[] = [
  ...DEAL_ENRICH_LIST_FIELDS,
  ...DEAL_ENRICH_SCALAR_FIELDS,
];

function isDealEnrichField(f: unknown): f is DealEnrichField {
  return typeof f === "string" && ALL_DEAL_ENRICH_FIELDS.includes(f);
}

/**
 * Coerce a proposed value for an Int column to a whole number. Strips a
 * "(source: …)" tag plus $/commas/"~", then accepts exactly ONE number —
 * optionally suffixed "12M" / "1.2B" / "12 million" style. Ranges or
 * multi-number strings are ambiguous → null (caller skips the addition).
 */
function coerceEnrichInt(raw: string): number | null {
  const cleaned = raw.replace(/\([^)]*\)/g, " ").replace(/[~$,]/g, "");
  const tokens = [...cleaned.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?/gi)];
  if (tokens.length !== 1) return null;
  const n = Number(tokens[0][1]);
  if (!Number.isFinite(n)) return null;
  const suffix = tokens[0][2]?.toLowerCase();
  const mult =
    !suffix ? 1
    : suffix.startsWith("k") || suffix === "thousand" ? 1_000
    : suffix.startsWith("m") ? 1_000_000
    : 1_000_000_000;
  const value = Math.round(n * mult);
  return value > 0 ? value : null;
}

function parseDealEnrichmentJSON(raw: string): {
  additions: DealCompanyEnrichAddition[];
  conflicts: DealCompanyEnrichConflict[];
} {
  let text = raw.trim();
  // Strip a ```json fence if the model added one despite instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Otherwise slice to the outermost braces.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
  }

  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("Enrichment returned malformed output — try again.");
  }
  const o = obj as { additions?: unknown; conflicts?: unknown };

  const additions: DealCompanyEnrichAddition[] = Array.isArray(o.additions)
    ? o.additions
        .filter(
          (a): a is { field: DealEnrichField; value: string } =>
            !!a &&
            typeof a === "object" &&
            isDealEnrichField((a as { field?: unknown }).field) &&
            typeof (a as { value?: unknown }).value === "string" &&
            (a as { value: string }).value.trim().length > 0,
        )
        .map((a) => ({ field: a.field, value: a.value.trim() }))
    : [];

  const isScalarField = (f: unknown): f is DealEnrichScalarField =>
    typeof f === "string" &&
    (DEAL_ENRICH_SCALAR_FIELDS as readonly string[]).includes(f);

  const conflicts: DealCompanyEnrichConflict[] = Array.isArray(o.conflicts)
    ? o.conflicts
        .filter(
          (c): c is DealCompanyEnrichConflict =>
            !!c &&
            typeof c === "object" &&
            isScalarField((c as { field?: unknown }).field) &&
            typeof (c as { existing?: unknown }).existing === "string" &&
            typeof (c as { proposed?: unknown }).proposed === "string",
        )
        .map((c) => ({
          field: c.field,
          existing: c.existing,
          proposed: c.proposed,
          note: typeof c.note === "string" ? c.note : undefined,
        }))
    : [];

  return { additions, conflicts };
}

export async function generateDealCompanyEnrichment(
  dealId: string,
): Promise<{ additions: DealCompanyEnrichAddition[]; conflicts: DealCompanyEnrichConflict[] }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      company: true,
      industry: true,
      website: true,
      linkedinUrl: true,
      instagramUrl: true,
      revenueEstimate: true,
      employeeCount: true,
      companySize: true,
      headquarters: true,
      founded: true,
      ownership: true,
      description: true,
      subIndustry: true,
      companyKeyFacts: true,
      currentSystems: true,
      painPoints: true,
    },
  });
  if (!deal) throw new Error("Deal not found");

  const ctx: string[] = [
    "## Company record (existing — prospect, not yet a client)",
    `Company: ${deal.company}`,
    `Industry: ${deal.industry}`,
    `Website: ${deal.website || "(empty)"}`,
    `LinkedIn: ${deal.linkedinUrl || "(empty)"}`,
    `Instagram: ${deal.instagramUrl || "(empty)"}`,
    `Revenue estimate (CAD): ${deal.revenueEstimate ?? "(empty)"}`,
    `Employee count: ${deal.employeeCount ?? "(empty)"}`,
    `Company size: ${deal.companySize || "(empty)"}`,
    `Headquarters: ${deal.headquarters || "(empty)"}`,
    `Founded: ${deal.founded || "(empty)"}`,
    `Ownership: ${deal.ownership || "(empty)"}`,
    `Sub-industry: ${deal.subIndustry || "(empty)"}`,
    `Description: ${deal.description || "(empty)"}`,
    `Key facts: ${deal.companyKeyFacts.length ? deal.companyKeyFacts.join("; ") : "(none)"}`,
    `Current systems: ${deal.currentSystems.length ? deal.currentSystems.join("; ") : "(none)"}`,
    `Pain points: ${deal.painPoints.length ? deal.painPoints.join("; ") : "(none)"}`,
  ];

  const raw = await generate({
    skill: "enrich-company-web",
    context: ctx.join("\n"),
    intake: [
      "Use web search to find public, authoritative facts about this exact company (use the company name, industry, and website to disambiguate).",
      "This record is a PROSPECT (deal), so use the deal field set — `field` must be exactly one of:",
      "website, companySize, headquarters, founded, ownership, description, linkedinUrl, instagramUrl, revenueEstimate, employeeCount, subIndustry (single-value); companyKeyFacts, currentSystems, painPoints (lists — one addition per item).",
      "No brandColors for deals. revenueEstimate and employeeCount must be numbers a source actually states.",
      "Propose company-profile additions, citing a source for every fact. Return the JSON object exactly as specified.",
    ].join("\n"),
    webSearch: true,
    maxTokens: 2000,
  });

  return parseDealEnrichmentJSON(raw);
}

export async function applyDealCompanyEnrichment(
  dealId: string,
  additions: DealCompanyEnrichAddition[],
) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";

  const clean = (additions ?? []).filter(
    (a) => isDealEnrichField(a?.field) && a.value?.trim(),
  );
  if (clean.length === 0) throw new Error("No additions to apply");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      company: true,
      website: true,
      domain: true,
      linkedinUrl: true,
      instagramUrl: true,
      revenueEstimate: true,
      employeeCount: true,
      companySize: true,
      headquarters: true,
      founded: true,
      ownership: true,
      description: true,
      subIndustry: true,
      companyKeyFacts: true,
      currentSystems: true,
      painPoints: true,
    },
  });
  if (!deal) throw new Error("Deal not found");

  // Non-destructive update: append new list facts (case-insensitive dedupe);
  // set scalar fields ONLY if currently empty (never overwrite — that's a
  // conflict the partner resolves by hand). Int scalars coerce first; an
  // unparseable number is skipped, never guessed.
  const data: Record<string, unknown> = {};
  const lists: Record<DealEnrichListField, string[]> = {
    companyKeyFacts: [...deal.companyKeyFacts],
    currentSystems: [...deal.currentSystems],
    painPoints: [...deal.painPoints],
  };
  const applied: DealCompanyEnrichAddition[] = [];
  const skipped: DealCompanyEnrichAddition[] = [];

  for (const a of clean) {
    if ((DEAL_ENRICH_LIST_FIELDS as readonly string[]).includes(a.field)) {
      const arr = lists[a.field as DealEnrichListField];
      const exists = arr.some((v) => v.toLowerCase() === a.value.toLowerCase());
      if (!exists) {
        arr.push(a.value);
        applied.push(a);
      } else {
        skipped.push(a);
      }
    } else if ((DEAL_ENRICH_INT_FIELDS as readonly string[]).includes(a.field)) {
      const f = a.field as (typeof DEAL_ENRICH_INT_FIELDS)[number];
      const value = coerceEnrichInt(a.value);
      if (value !== null && deal[f] === null) {
        data[f] = value;
        applied.push(a);
      } else {
        skipped.push(a);
      }
    } else {
      const f = a.field as Exclude<DealEnrichScalarField, "revenueEstimate" | "employeeCount">;
      const current = deal[f];
      if (!current || !current.trim()) {
        // URL fields land as the bare value — drop the trailing source tag so
        // click-outs work and the domain derives clean.
        const isUrlField = f === "website" || f === "linkedinUrl" || f === "instagramUrl";
        const value = isUrlField ? a.value.replace(/\s*\(.*$/, "").trim() : a.value;
        if (!value) {
          skipped.push(a);
          continue;
        }
        data[f] = value;
        applied.push(a);
        if (f === "website" && !deal.domain) {
          const domain = normalizeDomain(value);
          if (domain) data.domain = domain;
        }
      } else {
        // Already set — don't overwrite. Partner resolves conflicts manually.
        skipped.push(a);
      }
    }
  }

  for (const lf of DEAL_ENRICH_LIST_FIELDS) {
    if (lists[lf].length !== deal[lf].length) data[lf] = lists[lf];
  }

  if (applied.length === 0) {
    return { applied: 0, skipped: skipped.length };
  }

  data.enrichedAt = new Date();
  // The act of enriching is itself an AI surface, attributed to the skill.
  const aiActor = agentActor("enrich-company-web");

  await prisma.$transaction(async (tx) => {
    await tx.deal.update({ where: { id: dealId }, data });

    await writeAudit(tx, {
      actor: aiActor,
      action: "update.deal.enrich",
      targetType: "Deal",
      targetId: dealId,
      changes: {
        approvedBy: partnerLabel,
        applied: applied.map((a) => ({ field: a.field, value: a.value })),
        skipped: skipped.length,
      },
    });

    await writeActivity(tx, {
      actor: aiActor,
      type: "ai",
      target: deal.company,
      detail: `Enriched company profile — ${applied.length} fact(s) added (approved by ${partnerLabel.split(" ")[0]})`,
      link: `/pipeline/${dealId}`,
    });
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { applied: applied.length, skipped: skipped.length };
}

export async function saveProposal(dealId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trimEnd();
  if (!body.trim()) throw new Error("Proposal body is required");
  assertNoNeedsInput(body, "proposal");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true },
  });
  if (!deal) throw new Error("Deal not found");

  // File into the deal's own 00-Pipeline working folder (created on first use).
  const { folderId } = await ensureDealDriveFolder(dealId);

  const today = new Date().toISOString().slice(0, 10);
  const fileName = `${today}-${deal.company.replace(/\s+/g, "-")}-scope-of-work.md`;
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId], mimeType: "text/markdown" },
    media: { mimeType: "text/markdown", body: Readable.from(body) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload returned no ID");

  const artifact = await prisma.$transaction(async (tx) => {
    const created = await tx.artifact.create({
      data: {
        type: "proposal",
        title: `Scope of work · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "scope",
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.scope.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: "Drafted scope of work — awaiting review",
      link: `/pipeline/${dealId}`,
    });

    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}

// ──────────────────────────────────────────────────────────────────────
// Generate Contract (deal-scoped) — the firm's standard agreement as a fillable,
// self-contained HTML document with a Download-PDF (browser print) button. A deal
// becomes a client only once the contract is signed, so the action lives here too,
// not just on the client page. Same shape and template as the client-scoped twin
// in app/(app)/clients/[id]/actions.ts; files to the deal's Drive folder with a
// dealId Artifact. The legal terms are counsel-approved (2026-06-18); only the
// parties/fees/dates and Schedule A (the Deliverable) change per deal.
// ──────────────────────────────────────────────────────────────────────

export async function generateContract(
  dealId: string,
  input: ContractIntake,
): Promise<{ body: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const preparedBy = session.user.name ?? session.user.email ?? "";

  const { deal, context } = await buildDealContext(dealId);

  const sowText = await latestScopeText({ dealId });
  const fullContext = sowText
    ? `${context}\n\n## Approved scope of work (source of truth for Schedule A — build the Deliverable from this)\n${sowText}`
    : context;

  const intake = [
    "## Draft Schedule A (the Deliverable / Statement of Work) for this deal's contract.",
    `Engagement / project name: ${input.projectName?.trim() || "(use the engagement from the context)"}`,
    "",
    "## Scope notes from the partner",
    input.scopeNotes?.trim() ||
      "(none — build Schedule A from the approved scope and the deal context)",
  ].join("\n");

  const scheduleAHtml = (
    await generate({ skill: "generate-contract", context: fullContext, intake, maxTokens: 8000 })
  ).trim();

  const body = renderContract({
    clientLegalName: input.clientLegalName,
    clientAddress: input.clientAddress,
    clientContactName: deal.contact.name,
    clientContactTitle: deal.contact.title,
    clientContactEmail: deal.contact.email,
    effectiveDate: input.effectiveDate,
    projectName: input.projectName,
    recital: input.recital ?? "",
    buildFee: input.buildFee,
    backgroundIpLicenseFee: input.backgroundIpLicenseFee,
    supportFee: input.supportFee ?? "",
    paymentTerms: input.paymentTerms,
    scheduleAHtml,
    preparedBy,
  });

  return { body };
}

export async function saveContract(dealId: string, input: { body: string }) {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const partnerLabel = session.user.name ?? session.user.email ?? "Unknown";
  const actor = partnerActor(session.user.partnerId, partnerLabel);

  const body = input.body.trim();
  if (!body) throw new Error("Contract body is required");
  assertNoNeedsInput(body, "contract");

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, company: true },
  });
  if (!deal) throw new Error("Deal not found");

  const { folderId } = await ensureDealDriveFolder(dealId);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = `Services Agreement (DRAFT) - ${deal.company} - ${today}.html`;
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
        type: "contract",
        title: `Contract (draft) · ${deal.company} · ${today}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: "generate-contract",
        reviewStatus: "draft",
        dealId: deal.id,
      },
    });

    await writeAudit(tx, {
      actor,
      action: "create.artifact.contract.draft",
      targetType: "Artifact",
      targetId: created.id,
      changes: { dealId, driveFileId: fileId, bodyLength: body.length },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: deal.company,
      detail: "Drafted a client contract",
      link: `/pipeline/${dealId}`,
    });

    return created;
  });

  revalidatePath(`/pipeline/${dealId}`);
  return { artifactId: artifact.id, driveUrl: webViewLink };
}
