/**
 * Shift AI Ops — domain types
 * Keep these flat and explicit. Will mirror the production DB schema.
 */

export type Industry =
  | "automotive"
  | "motorsport"
  | "engineering"
  | "construction"
  | "architecture"
  | "real_estate"
  | "manufacturing"
  | "heavy_equipment"
  | "distribution"
  | "logistics"
  | "professional_services"
  | "healthcare"
  | "beverage"
  | "other";

export type Partner = {
  id: string;
  name: string;
  initials: string;
  role: string;
  email: string;
};

// Feature Requests & Fixes — the in-tool feedback board. areaTab/areaSubTab
// are keys/labels from lib/feature-area-taxonomy.ts (not enums).
export type FeatureRequestType = "bug" | "feature" | "improvement" | "broken";
export type FeatureRequestStatus = "open" | "in_progress" | "done" | "declined";

export type FeatureRequest = {
  id: string;
  title: string;
  description: string;
  type: FeatureRequestType;
  status: FeatureRequestStatus;
  areaTab: string;
  areaSubTab?: string;
  createdById: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
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
  subIndustry?: string; // finer than Industry — controlled-vocabulary string
  lastTouchAt: string; // ISO date
  source: string; // free-text "where exactly" note
  sourceCategory?: LeadSource; // structured bucket — color-codes lead cards
  domain?: string; // normalized bare domain — pipeline dedup
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

  // Reach & personal (D40) — all optional
  linkedinUrl?: string;
  location?: string; // city/region
  timezone?: string;
  mobilePhone?: string;
  preferredChannel?: PreferredChannel;
  relationshipStrength?: RelationshipStrength; // partner judgment — manual only
  importantDates?: string[]; // free text, e.g. "Birthday — March 12"
};

/* A contact's company hats (employment / roles). The isPrimary row mirrors the
 * scalar Contact.company/title; the rest are extra affiliations (e.g. CEO of two
 * companies). Distinct from ContactLink (the buying tie to a Deal/Client). */
export type ContactAffiliation = {
  id: string;
  contactId: string;
  company: string;
  title?: string; // role at this company — "CEO", "VP Ops"
  isPrimary: boolean;
  sortOrder: number;
};

/* Contact ↔ Deal/Client link (D40). Two independent dimensions:
 * `relationship` = how the person connects to the company;
 * `role` = their pull in the buying decision (mainly for works_there).
 * Exactly one of dealId/clientId is set. */

export type RelationshipType = "works_there" | "introduced_us" | "advisor" | "other";
export type StakeholderRole =
  | "decision_maker"
  | "champion"
  | "influencer"
  | "budget_holder"
  | "technical"
  | "gatekeeper"
  | "blocker"
  | "other";
export type PreferredChannel = "email" | "call" | "text" | "linkedin";
export type RelationshipStrength = "cold" | "warm" | "strong";

export type ContactLink = {
  id: string;
  contactId: string;
  dealId?: string;
  clientId?: string;
  relationship: RelationshipType;
  role?: StakeholderRole;
  roleLabel?: string; // free text — "VP Ops", "met at SEMA"
  isPrimary: boolean;
  notes?: string;
  addedBy: string; // partner name or "AGENT · CLAUDE"
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

export type LeadSource = "intro" | "outbound" | "referral" | "event" | "inbound" | "ai_found" | "imported" | "other";

export type DealStage = "lead" | "qualified" | "discovery" | "discussion" | "proposal" | "negotiation" | "signed";

export type Deal = {
  id: string;
  contactId: string;
  name?: string; // custom deal name; heading falls back to company when unset
  company: string;
  stage: DealStage;
  valueEstimate: number; // in CAD
  partnerLeadId: string;
  industry: Industry;
  closeTargetDate: string;
  createdAt: string;
  lastTouchAt: string;
  stageEnteredAt: string; // when it entered the current stage — drives board aging colors
  coldOutreachAt?: string; // ISO date — set when the deal entered via a sent cold email (D36)
  outreachRepliedAt?: string; // ISO date — set when the prospect was marked as replied (lead → qualified)
  notes?: string;

  // Company profile (D40) — gathered at deal stage, copied to the Client on convert
  website?: string;
  domain?: string; // normalized bare host
  linkedinUrl?: string;
  instagramUrl?: string;
  revenueEstimate?: number; // whole CAD
  employeeCount?: number;
  companySize?: string;
  headquarters?: string;
  founded?: string;
  ownership?: string;
  description?: string;
  subIndustry?: string;
  currentSystems?: string[];
  painPoints?: string[];
  companyKeyFacts?: string[];
  enrichedAt?: string; // ISO date

  // Sales intelligence (D40)
  nextStep?: string;
  competitor?: string;
  probability?: number; // 0–100 — partner judgment, manual only
  budget?: string; // as stated/floated — soft until contracted
  lostReason?: string;
  lostAt?: string; // ISO date
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

  // Presence & firmographics (D40)
  linkedinUrl?: string;
  instagramUrl?: string;
  domain?: string; // normalized bare host
  revenueEstimate?: number; // whole CAD — filterable, alongside free-text `revenue`
  employeeCount?: number;
  subIndustry?: string;
  locations?: string; // sites/regions, free text

  // Shift-specific signal (D40)
  currentSystems?: string[];
  painPoints?: string[];
  keyServices?: string[];
  competitors?: string[];

  // Engagement / billing (sub-tab B)
  statusNote?: string; // partner's health note — manual only
  renewalDate?: string; // ISO date
  paymentTerms?: string; // "Net 30", "50% up front"
  contractEndAt?: string;
  billingContactId?: string;
};

export type Project = {
  id: string;
  clientId: string;
  name: string;
  phase: "discovery" | "build" | "run";
  projectType?: ProjectType; // shown in the UI in place of phase
  status: EngagementStatus;
  startDate: string;
  targetEndDate: string;
  budgetFee: number;
  partnerLeadId: string;
  consultantIds: string[];
  description: string;
  // Billing meta (Phase 2 + 4) — DB-defaulted, optional in the fixture subset.
  scheduleType?: ScheduleType;
  originationPct?: number; // % of labour revenue (default 10)
  isFirstContract?: boolean;

  // Scope & outcomes (D40)
  clientLeadId?: string; // client-side contact who owns this project
  objectives?: string;
  successMetrics?: string[];
  systemsBuilt?: string[];
  risks?: string[];
  statusNote?: string;
};

export type ProjectType = "discovery-report" | "pilot-project" | "subscription" | "full-build" | "buyout";
export type ScheduleType = "fifty-twenty-five" | "monthly-even" | "custom";
export type EstimateStatus = "draft" | "sent" | "accepted" | "superseded";

/* Rate card — the firm's standard tiers (Phase 1). Rates in CENTS. */
export type RateTier = {
  id: string;
  key: "mp" | "senior" | "intermediate" | "junior";
  name: string;
  billRateCents: number;
  payRateCents: number;
  sortOrder: number;
  active: boolean;
};

/* Direct cost — pass-through, billed at cost (Phase 1). amount in whole CAD. */
export type ProjectDirectCost = {
  id: string;
  projectId: string;
  label: string;
  amount: number;
  notes?: string;
  sortOrder: number;
};

/* Origination — who sourced the contract + their share of the commission
 * pool (Phase 2). sharePct rows for a project sum to 100. */
export type Origination = {
  id: string;
  projectId: string;
  partnerId: string;
  sharePct: number;
  notes?: string;
};

/* Estimate — pre-proposal scoping on a Deal (Phase 5). */
export type Estimate = {
  id: string;
  dealId: string;
  version: number;
  status: EstimateStatus;
  totalValue: number;
  notes?: string;
};

export type EstimateLine = {
  id: string;
  estimateId: string;
  role: string;
  hours: number;
  payRateCents: number;
  billRateCents: number;
  isExtra: boolean;
  sortOrder: number;
  rateTierId?: string;
};
export type WorkCategory = "firm" | "project" | "pipeline" | "other";
export type TaskStatus = "todo" | "in-progress" | "in-review" | "done";

export type Milestone = {
  id: string;
  // Universal parent — any scope FK may be null (firm-level milestone).
  projectId?: string;
  clientId?: string;
  ownerId?: string; // assigned partner
  title: string;
  dueDate?: string; // optional — undated milestones don't show on the timeline
  status: "pending" | "in-progress" | "complete" | "at-risk";
  category?: WorkCategory; // DB-defaulted; optional in the fixture subset
  categoryLabel?: string;
};

export type Invoice = {
  id: string;
  number: string;
  clientId: string;
  projectId: string;
  amount: number; // subtotal, whole CAD
  gstBps?: number; // GST rate in basis points (0 until the firm registers)
  total?: number; // amount + GST
  isManual?: boolean; // logged as sent outside the tool, no generated doc
  issuedAt: string;
  dueAt: string;
  paidAt?: string;
  sentAt?: string; // when it was marked sent (back-datable); null while draft
  status: "draft" | "sent" | "paid" | "overdue";
};

/* AP / AR + Expenses (firm financials). Money OUT — two ledgers (Money IN stays
 * on Invoice). Brand-new enums carry NO @map, so these unions mirror the schema
 * identifiers verbatim. Amounts are whole CAD ints; dates are ISO strings on the
 * UI side (the server maps Prisma Date/Decimal → string/number before passing). */

export type BillStatus = "received" | "approved" | "paid" | "void";
export type BillSource = "manual" | "gmail_ingest";
export type ExpenseKind = "reimbursable" | "firm_paid" | "subscription";
export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "reimbursed"
  | "paid";
export type MileageUnit = "km" | "receipt";
export type ExpenseCategory =
  | "travel_accommodation"
  | "travel_flights"
  | "travel_meals"
  | "bd_events"
  | "bd_meals"
  | "bd_other"
  | "fuel_mileage"
  | "subscription_software"
  | "subscription_phone"
  | "subscription_office"
  | "subscription_other"
  | "office_supplies"
  | "professional_fees"
  | "other";

// Bill — a vendor invoice we owe (AP). Manual or ingested from email.
export type Bill = {
  id: string;
  vendor: string;
  number?: string | null;
  description?: string | null;
  amount: number; // subtotal, whole CAD
  gstBps?: number;
  total?: number;
  currency?: string;
  category?: ExpenseCategory | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  paidAt?: string | null;
  status: BillStatus;
  source: BillSource;
  notes?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  driveUrl?: string | null;
  fileName?: string | null;
  createdBy: string;
};

// Expense — a team receipt or a recurring subscription.
export type Expense = {
  id: string;
  kind: ExpenseKind;
  category: ExpenseCategory;
  vendor?: string | null;
  description?: string | null;
  amount: number; // whole CAD
  gstBps?: number;
  total?: number;
  currency?: string;
  spentAt: string;
  status: ExpenseStatus;
  mileageUnit?: MileageUnit | null;
  mileageKm?: number | null;
  mileageRateCents?: number | null;
  paidById?: string | null;
  paidByName?: string | null; // denormalized for display (server maps it)
  reimbursedAt?: string | null;
  recurring?: boolean;
  renewalDate?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  needsPhoto?: boolean;
  driveUrl?: string | null;
  fileName?: string | null;
  createdBy: string;
};

/* Billing schedule — the project's invoicing structure.
 * Each installment is one planned slice of the fee; "Send invoice" reads
 * these as presets and links the produced Invoice back here. */

export type InstallmentTrigger = "on-signing" | "milestone" | "date" | "manual";
export type InstallmentStatus = "planned" | "invoiced" | "paid";

export type BillingInstallment = {
  id: string;
  projectId: string;
  label: string;
  amount: number;
  trigger: InstallmentTrigger;
  dueDate?: string; // ISO date
  sortOrder: number;
  status: InstallmentStatus;
  invoiceId?: string; // set once billed
  isExtra?: boolean; // out-of-scope billing line
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
  due: string | null; // ISO date, or null = no due date
  priority: "high" | "medium" | "low";
  ownerId: string; // partner.id — the owner IS the assignee
  assignedById?: string; // partner.id who assigned it (null = self/firm task)
  reviewerId?: string; // partner.id asked to review this task's output (optional)
  relatedTo?: string; // contact / client / project name (legacy free-text)
  context?: string; // manual + suggested context; the payload agents read
  // Scope FKs — nullable; firm-wide tasks have neither.
  clientId?: string;
  projectId?: string;
  dealId?: string; // deal this task hangs off, if any
  contactId?: string; // contact this task hangs off, if any
  artifactId?: string; // deliverable this task hangs off, if any
  milestoneId?: string; // milestone (epic) this task is a sub-task of, if any
  status?: TaskStatus; // board column (DB-defaulted; optional in the fixture subset)
  category?: WorkCategory; // card colour/tag (DB-defaulted)
  categoryLabel?: string;
  archivedAt?: string; // ISO date — set when moved to the board's Archive column
  done: boolean; // kept in sync with status === "done"
};

/* Artifact — first-class deliverable tracking.
 * Every AI-generated or partner-uploaded file gets one of these. */

export type ArtifactType =
  | "proposal"
  | "deck"
  | "email"
  | "sow"
  | "contract"
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

/* ActionDraft — the editable step-1 output of a Quick Action, saved before it's
 * run into a finished deliverable. `content` is the editable payload (shape
 * varies by skill); scope FKs are nullable (one expected at write time). */

export type ActionDraft = {
  id: string;
  skill: string; // the generatedFromSkill value
  content: Record<string, unknown>; // editable step-1 output (Prisma Json)
  status: string; // "draft" by default
  createdBy: string; // partner name or "AGENT · CLAUDE"
  // Scope — exactly one expected at write time
  clientId?: string;
  dealId?: string;
  contactId?: string;
  projectId?: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
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

/* Lead Agent — Phase A: Targeting */

export type TargetSegment = {
  id: string;
  name: string;
  description: string;
  active: boolean;
  priority: number;
  industries: string[]; // free-form tags, NOT the Industry enum
  revenueMin?: number; // whole CAD
  revenueMax?: number; // whole CAD
  employeeMin?: number;
  employeeMax?: number;
  geographies: string[];
  buyingSignals: string[];
  disqualifiers: string[];
  searchSpec?: Record<string, unknown> | null; // Prisma Json? — structured search criteria
  personas: { department: string; seniority: string }[]; // Prisma Json?
  anchors: { name: string; domain?: string }[]; // Prisma Json?
  priorityLocation: string | null; // the starred geography (must be one of geographies)
  revealAtDiscovery?: "primary" | "all"; // Apollo email-reveal policy at discovery
  lastOptimizedAt?: string | null; // ISO date — last Segment Optimizer run (D39)
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
};

/* Lead Agent — Phase B: AI Found Leads (the review surface) */

export type ProspectLeadStatus = "pending" | "contacted" | "added" | "ghost";
export type LeadRunStatus = "running" | "done" | "error";

/* A candidate buyer surfaced on a ProspectLead. */
export type ProspectPerson = {
  name: string;
  title: string;
  email?: string | null;
  linkedin?: string;
  source?: string; // which connector found this person
  apolloPersonId?: string; // Apollo person id (used for the 1-credit reveal)
  emailRevealed?: boolean; // true once the work email has been revealed
  // For imported leads: is this person the buyer (decision_maker) or a bridge
  // (connector who can intro us to one)? Steers the enrichment SEARCH.
  roleType?: "decision_maker" | "connector";
};

export type ProspectLeadOrigin = "discovery" | "imported";

export type ProspectLead = {
  id: string;
  companyName: string;
  domain: string; // normalized bare domain (unique)
  website?: string;
  industryTags: string[];
  revenueEstimate?: number; // whole CAD
  employeeEstimate?: number;
  headquarters?: string;
  // Company picture (mirrors the deal profile; filled by enrich)
  linkedinUrl?: string;
  instagramUrl?: string;
  companySize?: string;
  founded?: string;
  ownership?: string;
  description?: string;
  subIndustry?: string;
  currentSystems?: string[];
  painPoints?: string[];
  companyKeyFacts?: string[];
  // Positioning — how we'd sell to them
  fitSummary?: string;
  likelyNeeds?: string[];
  salesAngle?: string;
  enrichedAt?: string; // ISO date
  segmentId?: string;
  segmentName?: string; // denormalized for the card surface
  score: number; // 1–10
  rationale: string;
  disqualified: boolean;
  status: ProspectLeadStatus;
  people: ProspectPerson[]; // typed array (Prisma Json)
  foundBy: string[]; // e.g. ["firecrawl","apollo"]
  sources?: Record<string, unknown> | null; // raw per-source payloads (Prisma Json?)
  createdBy: string; // "AGENT · CLAUDE"
  generatedFromSkill?: string;
  origin?: ProspectLeadOrigin; // "discovery" (default) | "imported"
  promotedBy?: string; // for imported leads: the partner who promoted it
  convertedContactId?: string;
  convertedDealId?: string;
  reviewedBy?: string;
  reviewedAt?: string; // ISO date
  // Claim/assign — the partner working this lead (loose strings, no FK).
  claimedById?: string;
  claimedBy?: string;
  claimedAt?: string; // ISO date
  // Cold-outreach draft (Phase B.1) — lives on the lead (no Artifact scope).
  outreachSubject?: string;
  outreachDraft?: string;
  outreachPersonIndex?: number;
  outreachSentAt?: string; // ISO date — set when marked sent (status → contacted)
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
};

export type LeadRun = {
  id: string;
  segmentId?: string;
  status: LeadRunStatus;
  evaluatedCount: number;
  foundCount: number;
  ghostCount: number;
  createdBy: string;
  startedAt: string; // ISO date
  finishedAt?: string; // ISO date
};

/* Import Contacts — PRIVATE per-partner staging (CSV import → scan → promote).
 * Brand-new enums: plain underscored values, no hyphen mapping. */

export type ImportContactCompleteness = "complete" | "needs_identification";
export type ImportLeadType = "decision_maker" | "connector" | "none";
export type ImportScanStatus = "pending" | "scored" | "skipped" | "error";
export type ScanRunStatus = "pending" | "submitted" | "scoring" | "done" | "error";
export type ImportContactPromotion = "none" | "promoted";

/* The header→field mapping a CSV upload resolved to. Values are the source
 * CSV column names (or undefined when the file has no such column). name is a
 * single column when present; firstName/lastName cover split-name exports
 * (LinkedIn) where the full name is composed from two columns. */
export type ImportColumnMapping = {
  name?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  companyDomain?: string;
};

export type ImportBatch = {
  id: string;
  partnerLeadId: string;
  filename: string;
  source: "linkedin" | "google" | "other";
  columnMapping?: ImportColumnMapping | null;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  needsIdCount: number;
  createdBy: string;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
};

export type ImportedContact = {
  id: string;
  partnerLeadId: string;
  batchId: string;
  name: string;
  title?: string;
  company?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  domain?: string; // normalized bare domain — may be "" / undefined
  raw: Record<string, unknown>; // original CSV row (Prisma Json)
  completeness: ImportContactCompleteness;
  dedupeKey: string;
  scanStatus: ImportScanStatus;
  scanScore?: number; // 1–10
  leadType?: ImportLeadType;
  matchedSegmentId?: string;
  scanRationale?: string;
  scannedAt?: string; // ISO date
  promotion: ImportContactPromotion;
  promotedProspectLeadId?: string;
  promotedAt?: string; // ISO date
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
};

/* The scan settings a report rated against — seeded from a Target Segment, then
 * editable per scan, and snapshotted on the ScanRun. */
export type ScanCriteria = {
  industries: string[];
  employeeMin?: number;
  employeeMax?: number;
  revenueMin?: number; // whole CAD
  revenueMax?: number; // whole CAD
  geographies: string[];
  keywords: string[]; // company-type / signal keywords
  seededFromSegmentId?: string;
  seededFromName?: string;
};

export type ScanRun = {
  id: string;
  partnerLeadId: string;
  batchId?: string;
  title: string;
  status: ScanRunStatus;
  criteria?: ScanCriteria | null;
  batchApiId?: string; // Anthropic Message Batches id (bulk async path)
  contactIds: string[]; // imported-contact ids in request order (result mapping)
  totalCount: number;
  scoredCount: number;
  skippedCount: number;
  errorCount: number;
  segmentScope: string[]; // legacy — superseded by `criteria`
  createdBy: string;
  startedAt: string; // ISO date
  finishedAt?: string; // ISO date
};

/* One scan's ranking of one contact — the per-scan "result column". */
export type ScanResult = {
  id: string;
  scanRunId: string;
  importedContactId: string;
  partnerLeadId: string;
  score: number; // 1–10
  leadType: ImportLeadType;
  rationale?: string;
  createdAt: string; // ISO date
};

/* ── Financials rebuild (010) — unified commission v2 + cash / integrity types ──
   UI-facing mirrors of the new Prisma models. The four old commission tables stay
   authoritative through Phase 4; these describe the new shape the rebuild reads. */
export type CommissionKind = "origination" | "source";
export type CommissionBasis = "labor_revenue" | "build_value";
export type CommissionStream = "build" | "recurring";
// PayoutStatus / PayoutMethod are the same enums ConsultantPayout uses.
export type PayoutStatus = "owed" | "paid" | "confirmed";
export type PayoutMethod = "etransfer" | "wire" | "cheque" | "other";

export type CommissionLine = {
  id: string;
  kind: CommissionKind;
  basis: CommissionBasis;
  buildPct: number; // percent
  recurringPct?: number | null;
  coveredMonths?: number | null;
  onSchedule: boolean;
  sortOrder: number;
  projectId?: string | null;
  dealId?: string | null;
  partnerId?: string | null;
  externalName?: string | null;
  backfillSourceId?: string | null;
  backfillSourceTable?: string | null;
  notes?: string | null;
};

export type CommissionPayout = {
  id: string;
  amount: number; // whole CAD
  status: PayoutStatus;
  method?: PayoutMethod | null;
  stream: CommissionStream;
  commissionLineId: string;
  installmentId?: string | null;
  periodIndex?: number | null;
  periodStart?: string | null; // ISO
  settledByBillId?: string | null;
  invoiceWaivedReason?: string | null;
  paidAt?: string | null; // ISO
  confirmedAt?: string | null; // ISO
  clientPaidFirst?: boolean | null;
};

export type FxRate = { id: string; currency: string; rate: number; asOf: string; source?: string | null };
export type OpeningBalance = { id: string; amount: number; asOf: string; label?: string | null; note?: string | null; active: boolean; enteredBy: string };
export type BankReconciliation = { id: string; statementDate: string; statementBalance: number; computedBalance?: number | null; delta?: number | null; note?: string | null; reconciledBy: string };
export type InvoicePayment = { id: string; invoiceId: string; amount: number; receivedAt: string; method?: string | null; note?: string | null; createdBy: string };
