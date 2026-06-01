// Unified ingest — parse the model's raw JSON into the UnifiedProposal shape
// MINUS the server-stamped fields. The model only ever supplies {field, proposed}
// for scalar changes; the CALLER (extractUnified) re-reads the live record and
// stamps op/existing. Likewise schemaVersion is set server-side.
//
// Robust to code fences / stray pre- or post-prose, exactly like
// parseProposalJSON in app/(app)/ingest/actions.ts. Carries the enum normalizers
// (hyphen → underscore) and validates against the allowed sets, mirroring
// drop-actions.ts (toMilestoneStatus / toTaskPriority / toInteractionType).

import type {
  IngestType,
  IngestTargetKind,
  ListAddition,
  ProposedInteraction,
  ProposedMilestone,
  ProposedDeliverable,
} from "@/lib/ingest/types";
import { INGEST_TYPES } from "@/lib/ingest/types";

// A field change as it comes off the model: proposed value only. The server
// diffs against the live record to stamp op + existing.
export type RawFieldChange = { field: string; proposed: string };

// One record's proposed changes before server-stamping. Mirrors RecordProposal
// minus the diff fields on fieldChanges.
export type ParsedRecord = {
  kind: IngestTargetKind;
  recordId: string | null;
  label: string;
  fieldChanges: RawFieldChange[];
  listAdditions: ListAddition[];
  interactions?: ProposedInteraction[];
  projectNotes?: string | null;
  milestones?: ProposedMilestone[];
  deliverables?: ProposedDeliverable[];
  stageSignal?: { suggestion: string; rationale: string } | null;
};

export type ParsedTask = {
  title: string;
  context: string;
  priority: string;
  due: string | null;
  ownerHint: string | null;
  clientId: string | null;
  projectId: string | null;
  milestoneId: string | null;
  reassignTaskId: string | null;
};

export type ParsedUnified = {
  ingestType: IngestType | null;
  summary: string;
  keyPoints: string[];
  records: ParsedRecord[];
  tasks: ParsedTask[];
};

// ── Allowed enum value sets (hyphenated DB forms the skill emits) ──
const TARGET_KINDS = ["contact", "client", "project", "deal"] as const;
const MILESTONE_STATUSES = ["pending", "in-progress", "complete", "at-risk"] as const;
const TASK_PRIORITIES = ["high", "medium", "low"] as const;
const INTERACTION_TYPES = ["meeting", "call", "email-received", "email-sent", "other"] as const;
const ARTIFACT_TYPES = ["proposal", "deck", "email", "sow", "invoice", "report", "other"] as const;

// Enum @map convention: the generated client expects the UNDERSCORED TS
// identifier; the skill emits the hyphenated DB form. Normalize on parse,
// falling back to a safe default when the value is unrecognized.
function normMilestoneStatus(v: string): string {
  const ok = (MILESTONE_STATUSES as readonly string[]).includes(v) ? v : "pending";
  return ok.replace(/-/g, "_");
}
function normTaskPriority(v: string): string {
  return (TASK_PRIORITIES as readonly string[]).includes(v) ? v : "medium";
}
function normInteractionType(v: string): string {
  const ok = (INTERACTION_TYPES as readonly string[]).includes(v) ? v : "other";
  return ok.replace(/-/g, "_");
}
function normArtifactType(v: string): string {
  return (ARTIFACT_TYPES as readonly string[]).includes(v) ? v : "other";
}

const isoDate = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const strArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
    : [];

const objArr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];

/** Slice raw model output down to the outermost JSON object, tolerant of fences/prose. */
function sliceJSON(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("Extraction returned malformed output — try again.");
  }
}

function parseFieldChanges(v: unknown): RawFieldChange[] {
  return objArr(v)
    .filter((fc) => typeof fc.field === "string" && (fc.field as string).trim() && typeof fc.proposed === "string" && (fc.proposed as string).trim())
    .map((fc) => ({ field: (fc.field as string).trim(), proposed: (fc.proposed as string).trim() }));
}

function parseListAdditions(v: unknown): ListAddition[] {
  return objArr(v)
    .filter((la) => typeof la.field === "string" && (la.field as string).trim() && typeof la.value === "string" && (la.value as string).trim())
    .map((la) => ({ field: (la.field as string).trim(), value: (la.value as string).trim() }));
}

function parseInteractions(v: unknown): ProposedInteraction[] {
  return objArr(v)
    .filter((it) => typeof it.summary === "string" && (it.summary as string).trim())
    .map((it) => ({
      type: normInteractionType(str(it.type) || "other"),
      summary: (it.summary as string).trim(),
      date: isoDate(it.date),
    }));
}

function parseMilestones(v: unknown): ProposedMilestone[] {
  return objArr(v)
    .filter((m) => typeof m.title === "string" && (m.title as string).trim())
    .map((m) => ({
      title: (m.title as string).trim(),
      dueDate: isoDate(m.dueDate),
      status: normMilestoneStatus(str(m.status) || "pending"),
    }));
}

function parseDeliverables(v: unknown): ProposedDeliverable[] {
  return objArr(v)
    .filter((d) => typeof d.title === "string" && (d.title as string).trim())
    .map((d) => ({ type: normArtifactType(str(d.type) || "other"), title: (d.title as string).trim() }));
}

function parseStageSignal(v: unknown): { suggestion: string; rationale: string } | null {
  if (!v || typeof v !== "object") return null;
  const ss = v as Record<string, unknown>;
  const suggestion = str(ss.suggestion);
  if (!suggestion) return null;
  return { suggestion, rationale: str(ss.rationale) };
}

function parseRecords(v: unknown): ParsedRecord[] {
  return objArr(v)
    .filter((r) => typeof r.kind === "string" && (TARGET_KINDS as readonly string[]).includes((r.kind as string).trim()))
    .map((r) => {
      const kind = (r.kind as string).trim() as IngestTargetKind;
      const recordId = typeof r.recordId === "string" && r.recordId.trim() ? (r.recordId as string).trim() : null;
      const rec: ParsedRecord = {
        kind,
        recordId,
        label: str(r.label),
        fieldChanges: parseFieldChanges(r.fieldChanges),
        listAdditions: parseListAdditions(r.listAdditions),
      };
      if (kind === "contact") {
        const interactions = parseInteractions(r.interactions);
        if (interactions.length) rec.interactions = interactions;
      }
      if (kind === "project") {
        const notes = str(r.projectNotes);
        if (notes) rec.projectNotes = notes;
        const milestones = parseMilestones(r.milestones);
        if (milestones.length) rec.milestones = milestones;
        const deliverables = parseDeliverables(r.deliverables);
        if (deliverables.length) rec.deliverables = deliverables;
      }
      if (kind === "deal") {
        const stageSignal = parseStageSignal(r.stageSignal);
        if (stageSignal) rec.stageSignal = stageSignal;
      }
      return rec;
    });
}

function parseTasks(v: unknown): ParsedTask[] {
  return objArr(v)
    .filter((t) => typeof t.title === "string" && (t.title as string).trim())
    .map((t) => ({
      title: (t.title as string).trim(),
      context: str(t.context),
      priority: normTaskPriority(str(t.priority) || "medium"),
      due: isoDate(t.due),
      ownerHint: str(t.ownerHint) || null,
      clientId: str(t.clientId) || null,
      projectId: str(t.projectId) || null,
      milestoneId: str(t.milestoneId) || null,
      reassignTaskId: str(t.reassignTaskId) || null,
    }));
}

/**
 * Parse the model's raw output into ParsedUnified. fieldChanges carry only
 * {field, proposed}; the caller stamps op/existing by diffing the live record.
 * Enum values are normalized to the underscored Prisma identifier here.
 */
export function parseUnified(raw: string): ParsedUnified {
  const o = sliceJSON(raw);
  const it = str(o.ingestType);
  return {
    ingestType: (INGEST_TYPES as readonly string[]).includes(it) ? (it as IngestType) : null,
    summary: str(o.summary),
    keyPoints: strArr(o.keyPoints),
    records: parseRecords(o.records),
    tasks: parseTasks(o.tasks),
  };
}
