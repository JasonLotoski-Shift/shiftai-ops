// Unified ingest — overwrite-capable apply layer (server-only; tx-aware).
//
// The genuinely tricky, reusable part of the redesign. Persists a record's
// approved FieldChanges + ListAdditions:
//   - LIST fields: append + case-insensitive dedupe, NEVER overwrite.
//   - SCALAR fields: op "add" sets only if still empty (idempotent); op
//     "replace" overwrites AND returns {field, before, after} so the caller
//     can write it into AuditLog.changes.
// Every overwritable field is allowlisted per record kind — anything outside
// the allowlist is ignored (defense against a bad proposal). `email` is NOT
// overwritable (it's the contact match key).
//
// Mirrors the append-only merge in app/(app)/ingest/actions.ts (applyContactEnrich)
// and contacts/[id]/actions.ts (applyEnrichment), extended with the replace op.

import type { PrismaClient } from "@/lib/generated/prisma/client";
import type {
  FieldChange,
  ListAddition,
  ApprovedIntroContact,
  ApprovedIntroTask,
  CallReviewCandidate,
} from "@/lib/ingest/types";
import { findDuplicateOpenTask } from "@/lib/ingest/dedup";

// A $transaction client (or the singleton) — same Pick pattern as lib/messaging.ts.
type Tx = Pick<PrismaClient, "contact" | "client" | "project" | "deal">;

// The Lane-4 (intro) persistence writes tasks + a CallReview + reuses
// findDuplicateOpenTask (which takes the full $transaction client), so it uses the
// full tx client type rather than a narrow Pick — same convention as dedup.ts.
type IntroTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

// ── Allowlists ──────────────────────────────────────────────────────────
// Partner-judgment fields are NEVER proposable: relationshipStrength (contact),
// statusNote (client), probability/lostReason (deal). Deal stage stays
// signal-only via stageSignal — never a fieldChange.
export const CONTACT_LIST_FIELDS = ["keyFacts", "hobbies", "networkAffiliations", "importantDates"] as const;
// email excluded — it's the match key. company/title are high-impact but allowed
// behind explicit per-item replace approval.
export const CONTACT_SCALAR_FIELDS = [
  "persona", "communicationStyle", "background", "title", "company", "phone", "notes",
  "linkedinUrl", "location", "timezone", "mobilePhone", "preferredChannel", "subIndustry",
] as const;

export const CLIENT_LIST_FIELDS = [
  "companyKeyFacts", "brandColors", "currentSystems", "painPoints", "keyServices", "competitors",
] as const;
export const CLIENT_SCALAR_FIELDS = [
  "description", "headquarters", "founded", "website", "ownership",
  "companySize", "logoMonogram", "revenue", "paymentTerms", "notes",
  "linkedinUrl", "instagramUrl", "subIndustry", "locations",
  "revenueEstimate", "employeeCount", "renewalDate",
] as const;

// Deal — first allowlist (deals previously allowed NO field changes). The
// company profile gathered at deal stage + sales intel, enrichable from a
// call/email like a client is.
export const DEAL_SCALAR_FIELDS = [
  "website", "linkedinUrl", "instagramUrl", "headquarters", "companySize", "founded",
  "ownership", "description", "subIndustry", "revenueEstimate", "employeeCount",
  "nextStep", "competitor", "budget",
] as const;
export const DEAL_LIST_FIELDS = ["companyKeyFacts", "currentSystems", "painPoints"] as const;

// Project scalars that may be overwritten. phase/status are enum-validated;
// objectives/statusNote are free text. `description` is append-only via
// projectNotes, so it's not here.
export const PROJECT_SCALAR_FIELDS = ["phase", "status", "objectives", "statusNote"] as const;
export const PROJECT_LIST_FIELDS = ["successMetrics", "systemsBuilt", "risks"] as const;

const PROJECT_PHASES = new Set(["discovery", "build", "run"]);
const ENGAGEMENT_STATUSES = new Set(["on_track", "at_risk", "blocked", "closing", "closed"]);
const DEAL_STAGES = new Set(["lead", "qualified", "discovery", "discussion", "proposal", "negotiation", "signed"]);
const PREFERRED_CHANNELS = new Set(["email", "call", "text", "linkedin"]);

/** Hyphenated DB enum values → underscored Prisma identifiers ("at-risk" → "at_risk"). */
function normEnum(v: string): string {
  return v.trim().replace(/-/g, "_");
}

// ── Typed-column coercion ────────────────────────────────────────────────
// mergeChanges works on strings; Int / DateTime columns get coerced around it.

const INT_FIELDS = new Set(["revenueEstimate", "employeeCount"]);
const DATE_FIELDS = new Set(["renewalDate"]);

/** "$1,200,000" → "1200000"; "$1.2M" / "45 million" → the whole number
 *  (suffix-aware, mirrors the enrich coercers — never truncate "1.2M" to 1).
 *  Anything ambiguous (ranges, multiple figures, no digits) → null = drop. */
function coerceIntString(v: string): string | null {
  const cleaned = v.replace(/\([^)]*\)/g, " ").replace(/[~$,]/g, "");
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
  return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

/** Pre-merge: clean Int fields to digit strings (drop if NaN), require
 *  YYYY-MM-DD on date fields, validate preferredChannel. Drops invalid changes. */
function normalizeTypedChanges(fieldChanges: FieldChange[]): FieldChange[] {
  const out: FieldChange[] = [];
  for (const fc of fieldChanges) {
    if (INT_FIELDS.has(fc.field)) {
      const cleaned = coerceIntString(fc.proposed ?? "");
      if (cleaned === null) continue;
      out.push({ ...fc, proposed: cleaned });
    } else if (DATE_FIELDS.has(fc.field)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fc.proposed?.trim() ?? "")) continue;
      out.push({ ...fc, proposed: fc.proposed.trim() });
    } else if (fc.field === "preferredChannel") {
      const v = normEnum(fc.proposed ?? "").toLowerCase();
      if (!PREFERRED_CHANNELS.has(v)) continue;
      out.push({ ...fc, proposed: v });
    } else {
      out.push(fc);
    }
  }
  return out;
}

/** Pre-merge: stringify Int/Date current values so the string diff works
 *  (Int → "1200000", Date → "2026-06-10"). */
function stringifyCurrent(current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(current)) {
    if (typeof v === "number") out[k] = String(v);
    else if (v instanceof Date) out[k] = v.toISOString().slice(0, 10);
    else out[k] = v;
  }
  return out;
}

/** Post-merge: convert merged string values back onto the real column types. */
function typeCoerceData(data: Record<string, unknown>): void {
  for (const f of INT_FIELDS) {
    if (typeof data[f] === "string") {
      const n = Number.parseInt(data[f] as string, 10);
      if (Number.isFinite(n)) data[f] = n;
      else delete data[f];
    }
  }
  for (const f of DATE_FIELDS) {
    if (typeof data[f] === "string") {
      const d = new Date(`${data[f]}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) data[f] = d;
      else delete data[f];
    }
  }
}

export type ApplyResult = {
  adds: { field: string; value: string }[];
  replaces: { field: string; before: string; after: string }[];
  listAdds: { field: string; value: string }[];
};

const emptyResult = (): ApplyResult => ({ adds: [], replaces: [], listAdds: [] });

// Shared scalar/list merge. `current` is the live record; mutates `data` with
// the columns to write and returns what changed (for audit).
function mergeChanges(
  current: Record<string, unknown>,
  fieldChanges: FieldChange[],
  listAdditions: ListAddition[],
  scalarFields: readonly string[],
  listFields: readonly string[],
  data: Record<string, unknown>,
): ApplyResult {
  const result = emptyResult();

  // Scalars
  for (const fc of fieldChanges) {
    if (!scalarFields.includes(fc.field)) continue;
    const proposed = fc.proposed?.trim();
    if (!proposed) continue;
    const cur = (current[fc.field] as string | null) ?? null;
    const curTrim = cur?.trim() || "";
    if (fc.op === "add") {
      // Only set if still empty (idempotent — current state wins).
      if (!curTrim) {
        data[fc.field] = proposed;
        result.adds.push({ field: fc.field, value: proposed });
      }
    } else {
      // replace — overwrite regardless, record before/after.
      if (proposed !== curTrim) {
        data[fc.field] = proposed;
        result.replaces.push({ field: fc.field, before: cur ?? "", after: proposed });
      }
    }
  }

  // Lists — append + case-insensitive dedupe.
  const lists: Record<string, string[]> = {};
  for (const f of listFields) lists[f] = [...((current[f] as string[]) ?? [])];
  for (const la of listAdditions) {
    if (!listFields.includes(la.field)) continue;
    const value = la.value?.trim();
    if (!value) continue;
    const arr = lists[la.field];
    if (!arr.some((v) => v.toLowerCase() === value.toLowerCase())) {
      arr.push(value);
      result.listAdds.push({ field: la.field, value });
    }
  }
  for (const f of listFields) {
    if (lists[f].length !== ((current[f] as string[]) ?? []).length) data[f] = lists[f];
  }

  return result;
}

export async function applyContactChanges(
  tx: Tx,
  contactId: string,
  input: { fieldChanges: FieldChange[]; listAdditions: ListAddition[] },
): Promise<ApplyResult> {
  const c = await tx.contact.findUnique({
    where: { id: contactId },
    select: {
      persona: true, communicationStyle: true, background: true, title: true,
      company: true, phone: true, notes: true,
      linkedinUrl: true, location: true, timezone: true, mobilePhone: true, preferredChannel: true,
      subIndustry: true,
      keyFacts: true, hobbies: true, networkAffiliations: true, importantDates: true,
    },
  });
  if (!c) return emptyResult();
  const data: Record<string, unknown> = {};
  const result = mergeChanges(
    c as Record<string, unknown>, normalizeTypedChanges(input.fieldChanges), input.listAdditions,
    CONTACT_SCALAR_FIELDS, CONTACT_LIST_FIELDS, data,
  );
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.contact.update({ where: { id: contactId }, data });
  }
  return result;
}

export async function applyClientChanges(
  tx: Tx,
  clientId: string,
  input: { fieldChanges: FieldChange[]; listAdditions: ListAddition[] },
): Promise<ApplyResult> {
  const c = await tx.client.findUnique({
    where: { id: clientId },
    select: {
      description: true, headquarters: true, founded: true, website: true,
      ownership: true, companySize: true, logoMonogram: true, revenue: true,
      paymentTerms: true, notes: true,
      linkedinUrl: true, instagramUrl: true, subIndustry: true, locations: true,
      revenueEstimate: true, employeeCount: true, renewalDate: true,
      companyKeyFacts: true, brandColors: true,
      currentSystems: true, painPoints: true, keyServices: true, competitors: true,
    },
  });
  if (!c) return emptyResult();
  const data: Record<string, unknown> = {};
  const result = mergeChanges(
    stringifyCurrent(c as Record<string, unknown>), normalizeTypedChanges(input.fieldChanges), input.listAdditions,
    CLIENT_SCALAR_FIELDS, CLIENT_LIST_FIELDS, data,
  );
  typeCoerceData(data);
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.client.update({ where: { id: clientId }, data });
  }
  return result;
}

/** Deal — company profile + sales intel (the deal's first apply path). Stage
 *  is NOT here: it stays signal-only via applyDealStage below. */
export async function applyDealChanges(
  tx: Tx,
  dealId: string,
  input: { fieldChanges: FieldChange[]; listAdditions: ListAddition[] },
): Promise<ApplyResult> {
  const d = await tx.deal.findUnique({
    where: { id: dealId },
    select: {
      website: true, linkedinUrl: true, instagramUrl: true, headquarters: true,
      companySize: true, founded: true, ownership: true, description: true,
      subIndustry: true, revenueEstimate: true, employeeCount: true,
      nextStep: true, competitor: true, budget: true,
      companyKeyFacts: true, currentSystems: true, painPoints: true,
    },
  });
  if (!d) return emptyResult();
  const data: Record<string, unknown> = {};
  const result = mergeChanges(
    stringifyCurrent(d as Record<string, unknown>), normalizeTypedChanges(input.fieldChanges), input.listAdditions,
    DEAL_SCALAR_FIELDS, DEAL_LIST_FIELDS, data,
  );
  typeCoerceData(data);
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.deal.update({ where: { id: dealId }, data });
  }
  return result;
}

// Within PROJECT_SCALAR_FIELDS: enum-validated vs free-text.
const PROJECT_ENUM_FIELDS = ["phase", "status"] as const;
const PROJECT_TEXT_FIELDS = ["objectives", "statusNote"] as const;

/** Project: enum-validated phase/status + free-text scope fields + scope
 *  lists + append-only notes. */
export async function applyProjectChanges(
  tx: Tx,
  projectId: string,
  input: { fieldChanges: FieldChange[]; listAdditions?: ListAddition[]; projectNotes?: string | null },
): Promise<ApplyResult> {
  const p = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      phase: true, status: true, description: true,
      objectives: true, statusNote: true,
      successMetrics: true, systemsBuilt: true, risks: true,
    },
  });
  if (!p) return emptyResult();
  const data: Record<string, unknown> = {};

  // Free-text scalars + lists go through the shared merge.
  const result = mergeChanges(
    p as Record<string, unknown>, input.fieldChanges, input.listAdditions ?? [],
    PROJECT_TEXT_FIELDS, PROJECT_LIST_FIELDS, data,
  );

  for (const fc of input.fieldChanges) {
    if (!(PROJECT_ENUM_FIELDS as readonly string[]).includes(fc.field)) continue;
    const proposed = normEnum(fc.proposed ?? "");
    const valid = fc.field === "phase" ? PROJECT_PHASES.has(proposed) : ENGAGEMENT_STATUSES.has(proposed);
    if (!valid) continue;
    const cur = (p as Record<string, unknown>)[fc.field] as string;
    if (proposed !== cur) {
      data[fc.field] = proposed;
      result.replaces.push({ field: fc.field, before: cur, after: proposed });
    }
  }

  const notes = input.projectNotes?.trim();
  if (notes) {
    data.description = p.description ? `${p.description}\n\n${notes}` : notes;
    result.adds.push({ field: "projectNotes", value: notes });
  }

  if (Object.keys(data).length) await tx.project.update({ where: { id: projectId }, data });
  return result;
}

/** Deal: stage move only (enum-validated). Resets stageEnteredAt on a real move. */
export async function applyDealStage(
  tx: Tx,
  dealId: string,
  suggestion: string,
): Promise<{ moved: boolean; before?: string; after?: string }> {
  const stage = normEnum(suggestion);
  if (!DEAL_STAGES.has(stage)) return { moved: false };
  const d = await tx.deal.findUnique({ where: { id: dealId }, select: { stage: true } });
  if (!d || d.stage === stage) return { moved: false };
  await tx.deal.update({
    where: { id: dealId },
    data: { stage: stage as never, stageEnteredAt: new Date() },
  });
  return { moved: true, before: d.stage, after: stage };
}

// ── Lane 4 (intro / channel-partner, PURPLE) persistence ──────────────────
// The intro card writes three things on approve, kept here so the approve
// action (composer-actions.ts approveIntro) stays thin and the writes are one
// place. All tx-aware; the caller runs them inside its $transaction so a partial
// failure rolls back. Reuses findDuplicateOpenTask (the firm-board dedup floor).

/** Stamp the channel-partner marker on the introducer contact. A person can be
 *  both a prospect and a connector, so this is a FLAG, not a type swap. Sets
 *  sourceCategory = "intro" only when it's still unset (never clobbers a real
 *  lead source). channelNotes is append-only-friendly: overwrites only when a new
 *  note is supplied. Returns whether isChannelPartner flipped (for the audit). */
export async function applyChannelPartnerMarker(
  tx: IntroTx,
  contactId: string,
  input: { isChannelPartner: boolean; channelNotes: string | null },
): Promise<{ flipped: boolean }> {
  const c = await tx.contact.findUnique({
    where: { id: contactId },
    select: { isChannelPartner: true, sourceCategory: true },
  });
  if (!c) return { flipped: false };
  const data: Record<string, unknown> = {};
  // Honor the toggle in both directions: the card defaults it ON for this lane, so
  // an explicit uncheck must be able to clear an existing flag, not just set it.
  if (input.isChannelPartner !== c.isChannelPartner) data.isChannelPartner = input.isChannelPartner;
  const notes = input.channelNotes?.trim();
  if (notes) data.channelNotes = notes;
  if (input.isChannelPartner && !c.sourceCategory) data.sourceCategory = "intro";
  if (Object.keys(data).length) await tx.contact.update({ where: { id: contactId }, data });
  return { flipped: !!data.isChannelPartner };
}

/** Create the approved BD tasks on the introducer contact: firm-level (no client/
 *  project), category "firm", label "BD", scoped to contactId. Undated stays null.
 *  Skips any that duplicate an open task on the firm board (never silent — the
 *  skipped list is returned for the audit). */
export async function applyIntroBdTasks(
  tx: IntroTx,
  input: {
    contactId: string;
    tasks: ApprovedIntroTask[];
    assignedById: string;
    contextFallback: string;
  },
): Promise<{ created: number; skipped: { title: string; existingId: string }[] }> {
  let created = 0;
  const skipped: { title: string; existingId: string }[] = [];
  for (const t of input.tasks) {
    const title = t.title?.trim();
    if (!title) continue;
    const dup = await findDuplicateOpenTask(tx, { title, clientId: null, projectId: null, contactId: input.contactId });
    if (dup) {
      skipped.push({ title, existingId: dup.id });
      continue;
    }
    const d = t.due ? new Date(t.due) : null;
    await tx.task.create({
      data: {
        title,
        priority: "medium",
        due: d && !Number.isNaN(d.getTime()) ? d : null,
        context: t.context?.trim() || input.contextFallback,
        category: "firm",
        categoryLabel: "BD",
        ownerId: t.ownerId || null,
        assignedById: input.assignedById,
        contactId: input.contactId,
      },
    });
    created++;
  }
  return { created, skipped };
}

/** Write one CallReview row from the approved candidate. Ties to the call's
 *  Interaction (sourceInteractionId) and stamps the lane snapshot + scope. Returns
 *  the row id, or null when the candidate is empty (nothing worth recording). */
export async function applyCallReview(
  tx: IntroTx,
  input: {
    title: string;
    callDate: Date;
    candidate: CallReviewCandidate;
    sourceInteractionId: string | null;
    lane: string;
    clientId?: string | null;
    dealId?: string | null;
    contactId?: string | null;
    sensitivity?: "firm_wide" | "managing_partner";
    createdBy: string;
  },
): Promise<{ id: string } | null> {
  const whatWorked = (input.candidate.whatWorked ?? []).map((s) => s.trim()).filter(Boolean);
  const whatDidnt = (input.candidate.whatDidnt ?? []).map((s) => s.trim()).filter(Boolean);
  const lessons = (input.candidate.lessons ?? []).map((s) => s.trim()).filter(Boolean);
  const coachingNotes = input.candidate.coachingNotes?.trim() || null;
  // Nothing real to record → skip (no empty retro rows on the surface).
  if (!whatWorked.length && !whatDidnt.length && !lessons.length && !coachingNotes) return null;

  const rec = await tx.callReview.create({
    data: {
      title: input.title,
      callDate: input.callDate,
      whatWorked,
      whatDidnt,
      lessons,
      coachingNotes,
      sourceInteractionId: input.sourceInteractionId,
      lane: input.lane,
      clientId: input.clientId ?? null,
      dealId: input.dealId ?? null,
      contactId: input.contactId ?? null,
      sensitivity: input.sensitivity ?? "firm_wide",
      createdBy: input.createdBy,
    },
    select: { id: true },
  });
  return { id: rec.id };
}
