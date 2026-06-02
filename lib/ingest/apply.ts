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
import type { FieldChange, ListAddition } from "@/lib/ingest/types";

// A $transaction client (or the singleton) — same Pick pattern as lib/messaging.ts.
type Tx = Pick<PrismaClient, "contact" | "client" | "project" | "deal">;

// ── Allowlists ──────────────────────────────────────────────────────────
export const CONTACT_LIST_FIELDS = ["keyFacts", "hobbies", "networkAffiliations"] as const;
// email excluded — it's the match key. company/title are high-impact but allowed
// behind explicit per-item replace approval.
export const CONTACT_SCALAR_FIELDS = [
  "persona", "communicationStyle", "background", "title", "company", "phone", "notes",
] as const;

export const CLIENT_LIST_FIELDS = ["companyKeyFacts", "brandColors"] as const;
export const CLIENT_SCALAR_FIELDS = [
  "description", "headquarters", "founded", "website", "ownership",
  "companySize", "logoMonogram", "revenue", "paymentTerms", "notes",
] as const;

// Project scalars that may be overwritten (enum-validated). `description` is
// append-only via projectNotes, so it's not here.
export const PROJECT_SCALAR_FIELDS = ["phase", "status"] as const;

const PROJECT_PHASES = new Set(["discovery", "build", "run"]);
const ENGAGEMENT_STATUSES = new Set(["on_track", "at_risk", "blocked", "closing", "closed"]);
const DEAL_STAGES = new Set(["lead", "qualified", "discovery", "discussion", "proposal", "negotiation", "signed"]);

/** Hyphenated DB enum values → underscored Prisma identifiers ("at-risk" → "at_risk"). */
function normEnum(v: string): string {
  return v.trim().replace(/-/g, "_");
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
      keyFacts: true, hobbies: true, networkAffiliations: true,
    },
  });
  if (!c) return emptyResult();
  const data: Record<string, unknown> = {};
  const result = mergeChanges(
    c as Record<string, unknown>, input.fieldChanges, input.listAdditions,
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
      paymentTerms: true, notes: true, companyKeyFacts: true, brandColors: true,
    },
  });
  if (!c) return emptyResult();
  const data: Record<string, unknown> = {};
  const result = mergeChanges(
    c as Record<string, unknown>, input.fieldChanges, input.listAdditions,
    CLIENT_SCALAR_FIELDS, CLIENT_LIST_FIELDS, data,
  );
  if (Object.keys(data).length) {
    data.enrichedAt = new Date();
    await tx.client.update({ where: { id: clientId }, data });
  }
  return result;
}

/** Project: enum-validated phase/status overwrite + append-only notes. */
export async function applyProjectChanges(
  tx: Tx,
  projectId: string,
  input: { fieldChanges: FieldChange[]; projectNotes?: string | null },
): Promise<ApplyResult> {
  const p = await tx.project.findUnique({
    where: { id: projectId },
    select: { phase: true, status: true, description: true },
  });
  if (!p) return emptyResult();
  const result = emptyResult();
  const data: Record<string, unknown> = {};

  for (const fc of input.fieldChanges) {
    if (!(PROJECT_SCALAR_FIELDS as readonly string[]).includes(fc.field)) continue;
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
