// Unified ingest — shared types (client + server importable; NO server-only deps).
//
// One proposal shape covers every record type. Each scalar change is an "op"
// (add | replace) with the EXISTING value captured server-side at extract time,
// so the review screen can show before→after and the partner approves each
// overwrite individually. The model only ever proposes values — the server
// diffs against the live record to set `op`/`existing` (never trust the model
// for current state). See lib/ingest/apply.ts for how approved changes persist.

export type IngestType = "interaction" | "meeting" | "email" | "document";

export const INGEST_TYPES: IngestType[] = ["interaction", "meeting", "email", "document"];

export type IngestTargetKind = "contact" | "client" | "project" | "deal";

/** A scalar field change. `op` + `existing` are server-stamped (the diff). */
export type FieldChange = {
  field: string;
  proposed: string;
  existing: string | null; // null = field was empty
  op: "add" | "replace";
};

/** A list-field addition — always append-only, never an overwrite. */
export type ListAddition = { field: string; value: string };

export type ProposedInteraction = {
  type: string; // InteractionType (hyphen or underscore — parser normalizes)
  summary: string;
  date: string | null; // ISO date or null
};

export type ProposedMilestone = {
  title: string;
  dueDate: string | null; // ISO date or null
  status: string; // MilestoneStatus (parser normalizes)
};

export type ProposedDeliverable = {
  type: string; // ArtifactType
  title: string;
};

/** One record's proposed changes, grouped for the review UI. */
export type RecordProposal = {
  kind: IngestTargetKind;
  recordId: string | null; // null = inline-new contact, resolved on approve
  label: string; // display only, e.g. "Heather Vance · Brightline"
  fieldChanges: FieldChange[];
  listAdditions: ListAddition[];
  interactions?: ProposedInteraction[]; // contact-scoped
  projectNotes?: string | null; // project — appended to description
  milestones?: ProposedMilestone[]; // project
  deliverables?: ProposedDeliverable[]; // project → Artifact
  stageSignal?: { suggestion: string; rationale: string } | null; // deal (suggestion only)
};

export type TaskProposal = {
  title: string;
  context: string;
  priority: string; // TaskPriority
  due: string | null; // ISO date or null
  ownerHint: string | null; // name the model parsed; UI maps to a partnerId
  clientId: string | null;
  projectId: string | null;
  reassignTaskId: string | null; // non-null => re-own an existing open task
};

/** The full unified proposal stored in IngestProposal.proposal (v2). */
export type UnifiedProposal = {
  schemaVersion: 2; // absent / 1 = legacy meeting/project shapes
  ingestType: IngestType;
  summary: string;
  keyPoints: string[];
  records: RecordProposal[];
  tasks: TaskProposal[];
};

/** Narrow an unknown IngestProposal.proposal JSON to the unified (v2) shape. */
export function isUnifiedProposal(p: unknown): p is UnifiedProposal {
  return !!p && typeof p === "object" && (p as { schemaVersion?: unknown }).schemaVersion === 2;
}

// ── Approval payload (what the review UI sends back to approveUnified) ──
// Only the partner-approved items. Mirrors the proposal shape minus the
// server-stamped diff fields the client doesn't need to echo.

export type ApprovedRecord = {
  kind: IngestTargetKind;
  recordId: string | null;
  fieldChanges: FieldChange[]; // only the approved ones
  listAdditions: ListAddition[];
  interactions?: ProposedInteraction[];
  projectNotes?: string | null;
  milestones?: ProposedMilestone[];
  deliverables?: ProposedDeliverable[];
  applyStage?: boolean; // deal — partner approved the stage move
  stageSuggestion?: string | null;
};

export type ApprovedTask = {
  title: string;
  context: string;
  priority: string;
  due: string | null;
  ownerId: string; // resolved partner id
  clientId: string | null;
  projectId: string | null;
  reassignTaskId: string | null;
};

export type ApproveUnifiedSelections = {
  records: ApprovedRecord[];
  tasks: ApprovedTask[];
};
