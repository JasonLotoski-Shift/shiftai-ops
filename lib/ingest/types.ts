// Unified ingest — shared types (client + server importable; NO server-only deps).
//
// One proposal shape covers every record type. Each scalar change is an "op"
// (add | replace) with the EXISTING value captured server-side at extract time,
// so the review screen can show before→after and the partner approves each
// overwrite individually. The model only ever proposes values — the server
// diffs against the live record to set `op`/`existing` (never trust the model
// for current state). See lib/ingest/apply.ts for how approved changes persist.

import type { RelationshipType, StakeholderRole } from "@/lib/types";

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

// ── People & links (D40 relationship model) ──
// Two independent dimensions: `relationship` = how the person connects to the
// company; `role` = their pull in the buying decision (meaningful mainly for
// works_there). Values are plain underscored (brand-new enums, no @map).

export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  "works_there",
  "introduced_us",
  "advisor",
  "other",
] as const;

export const STAKEHOLDER_ROLES: readonly StakeholderRole[] = [
  "decision_maker",
  "champion",
  "influencer",
  "budget_holder",
  "technical",
  "gatekeeper",
  "blocker",
  "other",
] as const;

/** A person named in the source who isn't on file yet. Email-validated and
 *  firm-internal-excluded at parse; deduped against existing contacts on
 *  approve (link to the match instead of creating). */
export type ProposedContact = {
  name: string;
  email: string;
  title: string | null;
  company: string | null;
  suggestedRelationship: RelationshipType;
  suggestedRole: StakeholderRole | null;
};

/** A Contact ↔ Deal/Client link proposal — the buying committee + intro paths.
 *  `contactEmail` is an existing contact's email OR a proposedContacts email;
 *  `targetId` must be a record id from the context block (validated at extract). */
export type ContactLinkProposal = {
  contactEmail: string;
  targetKind: "deal" | "client";
  targetId: string;
  relationship: RelationshipType;
  role: StakeholderRole | null;
  isPrimary: boolean;
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
  milestoneId: string | null; // attach to an existing milestone (epic) by id, else null
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
  // Optional (so pending proposals from before the D40 upgrade still parse).
  proposedContacts?: ProposedContact[];
  contactLinks?: ContactLinkProposal[];
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
  milestoneId: string | null;
  reassignTaskId: string | null;
};

/** An approved new person — relationship/role are the partner-edited values
 *  (they survive the review screen, not the model's suggestions). */
export type ApprovedProposedContact = {
  name: string;
  email: string;
  title: string | null;
  company: string | null;
  relationship: RelationshipType;
  role: StakeholderRole | null;
};

/** An approved Contact ↔ Deal/Client link — partner-edited values. */
export type ApprovedContactLink = {
  contactEmail: string;
  targetKind: "deal" | "client";
  targetId: string;
  relationship: RelationshipType;
  role: StakeholderRole | null;
  isPrimary: boolean;
};

export type ApproveUnifiedSelections = {
  records: ApprovedRecord[];
  tasks: ApprovedTask[];
  // Only the approved people/links (optional — absent on pre-D40 proposals).
  proposedContacts?: ApprovedProposedContact[];
  contactLinks?: ApprovedContactLink[];
  // Partner-selected pipeline deal to log the summary against (its primary
  // contact). Optional — null/absent means no deal link. Interactions are
  // contact-scoped, so the deal's primary contact carries the logged summary.
  dealId?: string | null;
};

// ── Cross-reference — the "check this against existing records & tasks" assist ──
// Computed on demand when a partner clicks "Cross-reference records & tasks" on a
// pending proposal (v1 ProposalCard or v2 UnifiedProposalCard). It re-resolves
// which record an item belongs to — for proposals that arrived UNMATCHED from
// Gmail/Fireflies — and flags proposed tasks/milestones that already exist as
// OPEN work, so approval doesn't create a duplicate. Advisory only: the
// approval-time dedup in approve(Proposal|Unified) stays the backstop. Shared
// client+server (no server-only deps here).

export type CrossRefSuggestedMatch = { kind: IngestTargetKind; id: string; label: string };

/** A proposed task that duplicates an open task. `index` points into the v1
 *  ExtractedProposal.actionItems OR the v2 UnifiedProposal.tasks array. */
export type CrossRefTaskOverlap = {
  index: number;
  title: string;
  existingTaskId: string;
  existingTitle: string;
  // How sure we are it's the same task: "exact" = same normalized title (the
  // approval backstop would skip it); "fuzzy" = near-identical, flagged for the
  // partner to confirm. Optional so pre-existing cross-ref results still parse.
  confidence?: "exact" | "fuzzy";
};

/** A proposed milestone (v2 project records) that duplicates a live milestone. */
export type CrossRefMilestoneOverlap = {
  recordIndex: number; // index into UnifiedProposal.records
  milestoneIndex: number; // index into that record's milestones[]
  title: string;
  existingMilestoneId: string;
  existingTitle: string;
};

export type CrossReferenceResult = {
  schemaVersion: 1 | 2; // which proposal shape was cross-referenced
  alreadyMatched: boolean; // the proposal already had a focus / attached record
  ambiguous: boolean; // >1 candidate client — partner must choose the focus
  suggestedMatches: CrossRefSuggestedMatch[]; // ordered: clients, then deals, then contacts
  // First match of each kind — convenience for the v1 attach selectors.
  suggestedContactId: string | null;
  suggestedClientId: string | null;
  suggestedDealId: string | null;
  taskOverlaps: CrossRefTaskOverlap[];
  milestoneOverlaps: CrossRefMilestoneOverlap[]; // always [] for v1
};
