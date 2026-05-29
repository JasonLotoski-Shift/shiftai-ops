/**
 * Shift AI Ops — domain types
 * Keep these flat and explicit. Will mirror the production DB schema.
 */

export type Industry = "automotive" | "motorsport" | "engineering" | "construction" | "other";

export type Partner = {
  id: string;
  name: string;
  initials: string;
  role: string;
  email: string;
};

export type Contact = {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  phone?: string;
  partnerLeadId: string;
  industry: Industry;
  lastTouchAt: string; // ISO date
  source: string;
  notes?: string;

  // Relationship intelligence — built up over time, enriched by web search + AI.
  // Treated as append-only: enrichment merges, it never silently overwrites.
  persona?: string; // who they are in one or two lines (decision style, motivations)
  communicationStyle?: string; // how to talk to them (channel, cadence, tone)
  keyFacts?: string[]; // load-bearing facts (mandate, budget authority, constraints)
  background?: string; // career / company history paragraph
  hobbies?: string[]; // hobbies and interests — rapport surface
  networkAffiliations?: string[]; // boards, associations, alma mater, shared contacts
  enrichedAt?: string; // ISO date of last AI/web enrichment, if any
};

export type InteractionType =
  | "call"
  | "meeting"
  | "email-sent"
  | "email-received"
  | "other";

export type Interaction = {
  id: string;
  contactId: string;
  type: InteractionType;
  date: string; // ISO date
  summary: string;
  loggedBy: string; // partner name or "AGENT · CLAUDE"
  channel?: string; // optional: "Zoom", "On-site", "Phone"
};

export type DealStage = "lead" | "qualified" | "discovery" | "proposal" | "negotiation" | "signed";

export type Deal = {
  id: string;
  contactId: string;
  company: string;
  stage: DealStage;
  valueEstimate: number; // in CAD
  partnerLeadId: string;
  industry: Industry;
  closeTargetDate: string;
  createdAt: string;
  lastTouchAt: string;
  notes?: string;
};

export type EngagementStatus = "on-track" | "at-risk" | "blocked" | "closing" | "closed";

export type Client = {
  id: string;
  company: string;
  industry: Industry;
  revenue: string; // "$45M", "$120M" etc
  partnerLeadId: string;
  primaryContactId: string;
  driveFolderUrl: string;
  workspacePath: string;
  contractValue: number;
  contractSignedAt: string;
  status: EngagementStatus;
  notes?: string;

  // Company profile (sub-tab A) — auto-built from comms + web search, append-only.
  companySize?: string; // headcount band, e.g. "450–600"
  headquarters?: string;
  founded?: string; // year
  website?: string;
  ownership?: string; // "Private · family-owned", "PE-backed (Tarn Capital)"
  description?: string; // what the company does, in our words
  brandColors?: string[]; // hex strings — their brand, for deliverable matching
  logoMonogram?: string; // stand-in for a real logo asset in the prototype
  companyKeyFacts?: string[]; // operating facts that shape the engagement
  enrichedAt?: string; // ISO date of last profile enrichment

  // Engagement / billing (sub-tab B)
  paymentTerms?: string; // "Net 30", "50% up front"
  contractEndAt?: string;
  billingContactId?: string;
};

export type Project = {
  id: string;
  clientId: string;
  name: string;
  phase: "discovery" | "build" | "run";
  status: EngagementStatus;
  startDate: string;
  targetEndDate: string;
  budgetFee: number;
  partnerLeadId: string;
  consultantIds: string[];
  description: string;
};

export type Milestone = {
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  status: "pending" | "in-progress" | "complete" | "at-risk";
};

export type Invoice = {
  id: string;
  number: string;
  clientId: string;
  projectId: string;
  amount: number;
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  status: "draft" | "sent" | "paid" | "overdue";
};

export type Activity = {
  id: string;
  ts: string; // ISO datetime
  actor: string; // name or "AGENT · CLAUDE"
  type: "touch" | "status" | "doc" | "ai";
  target: string; // contact name, project name, etc
  detail: string;
  link?: string; // optional relative URL to click through to the record
};

/* Dashboard — view A (do) */

export type Task = {
  id: string;
  title: string;
  due: string; // ISO date
  priority: "high" | "medium" | "low";
  ownerId: string; // partner.id — the owner IS the assignee
  assignedById?: string; // partner.id who assigned it (null = self/firm task)
  relatedTo?: string; // contact / client / project name (legacy free-text)
  context?: string; // manual + suggested context; the payload agents read
  // Scope FKs — nullable; firm-wide tasks have neither.
  clientId?: string;
  projectId?: string;
  done: boolean;
};

/* Artifact — first-class deliverable tracking.
 * Every AI-generated or partner-uploaded file gets one of these. */

export type ArtifactType =
  | "proposal"
  | "deck"
  | "email"
  | "sow"
  | "invoice"
  | "report"
  | "other";

export type ArtifactReviewStatus = "draft" | "approved" | "sent" | "archived";

export type Artifact = {
  id: string;
  type: ArtifactType;
  title: string;
  driveUrl: string;
  fileName?: string;
  createdBy: string; // partner name or "AGENT · CLAUDE"
  generatedFromSkill?: string; // "scope", "html-brief", "draft-email", etc.
  reviewStatus: ArtifactReviewStatus;
  // Scope — exactly one expected at write time
  clientId?: string;
  projectId?: string;
  dealId?: string;
  createdAt: string;
};

/* Dashboard — view B (know) */

export type TeamUpdate = {
  id: string;
  ts: string; // ISO datetime
  author: string; // partner name or "AGENT · CLAUDE"
  cadence: "daily" | "weekly";
  body: string;
};

export type NewsItem = {
  id: string;
  ts: string; // ISO date
  source: string;
  industry: Industry;
  headline: string;
  why: string; // why it matters to the firm / a named account
};
