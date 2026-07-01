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
  // The call-retro block — rides every meeting lane, so a client (gold) call
  // carries one too. Empty/absent when the transcript held no coaching signal.
  // See docs/ingest-lane4-intro-and-call-review.md §6 (defined below).
  callReview?: CallReviewCandidate | null;
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
  // The kept + partner-edited call review, or null/absent to skip it. Writes one
  // CallReview row on the client_records (gold) lane, tied to the logged interaction.
  callReview?: CallReviewCandidate | null;
};

// ── Lane 4 (intro / channel-partner, PURPLE) + Call Review (every meeting lane) ──
// An intro/BD call: an external person, no client and no deal at capture. The
// proposal is contact-centric — a channel-partner Contact (create-new or matched),
// contact-scoped BD tasks (default-OFF), the by-exception firm-targeting candidate
// (the SAME Gate 1 / Gate 2 path Lane 3 uses), and a conservative callReview block
// that rides every meeting lane. Stored in IngestProposal.proposal as this shape.
// See docs/ingest-lane4-intro-and-call-review.md §2, §6.

// Purple lane color token. Applied per-card (globals.css owns the gold/green/blue
// vars; the intro card carries its own so the spine stayed lane-agnostic).
export const LANE_PURPLE = "#8a6fb0";

// The firm-targeting candidate an intro call emits (the ICP-constraint case). Same
// shape as the Lane-3 knowledgeCandidate (actions.ts KnowledgeCandidate) — a
// structural mirror kept here so lib/ingest/types.ts carries no server-only dep.
// `isImportant` is false by default; it flips true only against the 3-lane §9 bar.
// At approve a kept candidate becomes a DRAFT DecisionRecord (kind "decision") or
// KnowledgeItem (kind "learning"), stamped generatedFromSkill "ingest-meeting".
export type IntroTargetingCandidate = {
  isImportant: boolean;
  kind: "decision" | "learning";
  title: string;
  // decision (ADR) fields
  context?: string | null;
  optionsConsidered?: string | null;
  decision?: string | null;
  consequences?: string | null;
  // learning (KnowledgeItem) body
  summary?: string | null;
  // firm-economics / strategy → managing_partner, filtered from non-MP reads.
  sensitivity?: "firm_wide" | "managing_partner";
  // why it cleared the bar — shown at approve, not stored.
  rationale?: string | null;
};

// The call-retro candidate the meeting skills emit (intro + client calls). Arrays
// so each point is its own chip on the /call-reviews surface. Conservative: the
// skill populates only when the transcript carries real signal, leaves empty
// otherwise (no fabricated critique). Approving writes one CallReview row.
export type CallReviewCandidate = {
  whatWorked: string[];
  whatDidnt: string[];
  lessons: string[];
  coachingNotes?: string | null;
};

// The channel-partner contact an intro call proposes. `recordId` null = create a
// new contact on approve; an id = a matched existing contact. Never a client/deal.
export type IntroContactProposal = {
  recordId: string | null; // matched contact id, or null for inline-new
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
  // The relationship context that lands in Contact.channelNotes (reach, terms).
  channelNotes: string | null;
};

// A BD task scoped to the introducer contact (category "firm", label "BD"). No
// client/project (the intro pre-dates any deal). Default-OFF; the partner promotes.
export type IntroTaskProposal = {
  title: string;
  context: string;
  due: string | null; // ISO date or null
};

/** The full intro (Lane 4) proposal stored in IngestProposal.proposal. A sibling
 *  of UnifiedProposal for the purple lane — contact-centric, no records/deal. */
export type IntroProposal = {
  lane: "intro";
  ingestType: IngestType;
  summary: string;
  keyPoints: string[];
  contact: IntroContactProposal;
  tasks: IntroTaskProposal[];
  // By-exception firm-targeting candidate (null for most calls).
  knowledgeCandidate?: IntroTargetingCandidate | null;
  // The call-retro block (empty arrays when the transcript carries no signal).
  callReview?: CallReviewCandidate | null;
};

/** Narrow an unknown IngestProposal.proposal JSON to the intro (Lane 4) shape. */
export function isIntroProposal(p: unknown): p is IntroProposal {
  return !!p && typeof p === "object" && (p as { lane?: unknown }).lane === "intro";
}

// ── Intro approval payload (what the purple card sends back to approveIntro) ──
// Only the partner-approved + partner-edited items.

/** The approved channel-partner contact — partner-edited values survive the card. */
export type ApprovedIntroContact = {
  recordId: string | null; // matched id, or null to create
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
  isChannelPartner: boolean; // the channel-partner toggle (default on for this lane)
  channelNotes: string | null;
};

/** An approved BD task on the introducer contact. Owner optional (may be empty). */
export type ApprovedIntroTask = {
  title: string;
  context: string;
  due: string | null;
  ownerId: string | null; // resolved partner id, or null = unassigned
};

export type ApproveIntroSelections = {
  contact: ApprovedIntroContact;
  summary: string;
  tasks: ApprovedIntroTask[];
  // The kept + partner-edited targeting candidate, or null to discard / none.
  candidate: IntroTargetingCandidate | null;
  // The kept + partner-edited call review, or null to skip it.
  callReview: CallReviewCandidate | null;
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
  suggestedProjectId: string | null; // sole active project of the matched client, else null
  taskOverlaps: CrossRefTaskOverlap[];
  milestoneOverlaps: CrossRefMilestoneOverlap[]; // always [] for v1
};
