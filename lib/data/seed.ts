/**
 * Fake data fixtures for the prototype.
 * Industries match Shift AI's beachhead verticals: automotive, motorsport, engineering, construction.
 * Company / contact names are fictional. Revenue brackets match the $25–200M+ ICP.
 */

import type {
  Activity,
  Artifact,
  Client,
  Contact,
  Deal,
  Interaction,
  Invoice,
  Milestone,
  NewsItem,
  Partner,
  Project,
  Task,
  TeamUpdate,
} from "@/lib/types";

/* ──────────────────────────────────────────────────────────────────────
   Partners — placeholder managing partners (fictional demo data; not the real roster)
   ────────────────────────────────────────────────────────────────────── */

export const partners: Partner[] = [
  { id: "p-1", name: "Jason Lotoski", initials: "JL", role: "Managing Partner · Build", email: "jason@shiftai.partners" },
  { id: "p-2", name: "Marcus Halloran", initials: "MH", role: "Managing Partner · Industry", email: "marcus@shiftai.partners" },
  { id: "p-3", name: "Devon Reyes", initials: "DR", role: "Managing Partner · Delivery", email: "devon@shiftai.partners" },
  { id: "p-4", name: "Sasha Whitfield", initials: "SW", role: "Managing Partner · Growth", email: "sasha@shiftai.partners" },
];

/* ──────────────────────────────────────────────────────────────────────
   Consultants — PLACEHOLDER pay roster (example rates; edit in-app).
   defaultPayRateCents = what we pay per hour, in cents ($150/hr = 15000).
   Not the real rate card — replace via the Consultants roster UI.
   ────────────────────────────────────────────────────────────────────── */

export const consultants = [
  { id: "co-1", name: "Jack Mercer", role: "Senior Engineer", defaultPayRateCents: 15000, email: "jack@example.com", partnerId: null },
  { id: "co-2", name: "Maya Okafor", role: "Solutions Designer", defaultPayRateCents: 12500, email: "maya@example.com", partnerId: null },
  { id: "co-3", name: "Priya Nair", role: "Data Engineer", defaultPayRateCents: 14000, email: "priya@example.com", partnerId: null },
];

/* ──────────────────────────────────────────────────────────────────────
   Contacts
   ────────────────────────────────────────────────────────────────────── */

export const contacts: Contact[] = [
  {
    id: "c-1", name: "Heather Bennett", title: "COO", company: "Cascade Heavy Civil", email: "h.bennett@cascadeheavy.com", phone: "+1 604 555 0142", partnerLeadId: "p-1", industry: "construction", subIndustry: "Heavy Civil & Infrastructure", lastTouchAt: "2026-05-08", source: "Intro from B. Mathieu",
    persona: "Operator-COO who came up through the field. Decides on proof, not pitch — wants to see the thing run before she signs. Holds the operating budget and the sign-off.",
    communicationStyle: "Direct, low-patience for jargon. Prefers a short call over a long email; bullet points over prose. Responds fastest early morning (before 8 AM PT).",
    keyFacts: [
      "Controls the operating budget; final sign-off on the MSA sits with her, not the CEO.",
      "Burned once by a 'digital transformation' consultancy in 2023 — allergic to deck-and-leave.",
      "Measures everything in dispatcher hours saved per week.",
    ],
    background: "20+ years in heavy civil, started as a project engineer at a road-building firm before moving into operations. Joined Cascade in 2019 to professionalize field operations ahead of a planned ownership transition.",
    hobbies: ["Trail running", "Restoring a '72 Bronco", "Coaches her daughter's U14 soccer"],
    networkAffiliations: ["BC Road Builders Association (board)", "WiC — Women in Construction", "SFU Beedie alumni"],
    notes: "Intro came through Bernard Mathieu — keep him looped on progress as a courtesy.",
    enrichedAt: "2026-05-08",
  },
  {
    id: "c-2", name: "Tomás Iglesias", title: "VP Operations", company: "Northshore Powertrain", email: "tiglesias@northshorepwr.com", phone: "+1 519 555 0203", partnerLeadId: "p-2", industry: "automotive", subIndustry: "Parts & Suppliers (Tier 1/2)", lastTouchAt: "2026-05-10", source: "Conference (SAE Detroit)",
    persona: "Technical VP, engineer by training. Curious about the build, wants to understand how the system works under the hood before he champions it internally.",
    communicationStyle: "Email-first, detailed. Appreciates a written rationale he can forward to his ops sponsor. Long-form is fine with him.",
    keyFacts: [
      "Champion, not the economic buyer — his ops sponsor (unnamed) holds the budget.",
      "Asked specifically for a phased pilot rather than a full build commitment.",
    ],
    background: "Mechanical engineer; spent a decade in powertrain manufacturing before moving into operations leadership at Northshore.",
    hobbies: ["Amateur sim-racing", "Espresso gear"],
    networkAffiliations: ["SAE International", "Met the firm at SAE Detroit 2026"],
    enrichedAt: "2026-05-10",
  },
  { id: "c-3", name: "Priya Mehta", title: "Managing Director", company: "Westline Engineering", email: "pmehta@westline.eng", partnerLeadId: "p-3", industry: "engineering", lastTouchAt: "2026-05-09", source: "Outbound" },
  { id: "c-4", name: "Connor Doyle", title: "Team Principal", company: "Apex Racing Group", email: "cdoyle@apexracing.gp", partnerLeadId: "p-4", industry: "motorsport", lastTouchAt: "2026-05-11", source: "Personal network" },
  { id: "c-5", name: "Renée Boucher", title: "President", company: "Granite Bay Auto Group", email: "rboucher@granitebay.auto", partnerLeadId: "p-2", industry: "automotive", lastTouchAt: "2026-04-02", source: "Referral · J. Tanaka" },
  { id: "c-6", name: "Idris Achebe", title: "CEO", company: "Iron Spur Construction", email: "iachebe@ironspur.build", partnerLeadId: "p-1", industry: "construction", lastTouchAt: "2026-05-05", source: "Inbound · website" },
  { id: "c-7", name: "Lena Voss", title: "CFO", company: "Halifax Marine Engineering", email: "lvoss@halifaxmarine.ca", partnerLeadId: "p-3", industry: "engineering", lastTouchAt: "2026-03-18", source: "Outbound" },
  { id: "c-8", name: "Wes Mahoney", title: "Director, Race Ops", company: "Crown Performance Engines", email: "wmahoney@crownpe.com", partnerLeadId: "p-4", industry: "motorsport", lastTouchAt: "2026-05-09", source: "Conference (PRI)" },
  { id: "c-9", name: "Amelia Ford", title: "VP Engineering", company: "Vanguard Steelworks", email: "aford@vanguardsteel.com", partnerLeadId: "p-1", industry: "construction", lastTouchAt: "2026-05-07", source: "Intro from M. Halloran" },
  { id: "c-10", name: "Hugo Tremblay", title: "GM", company: "Lakeshore Dealership Group", email: "htremblay@lakeshoreauto.ca", partnerLeadId: "p-2", industry: "automotive", lastTouchAt: "2026-05-11", source: "Referral · R. Boucher" },
  { id: "c-11", name: "Anita Park", title: "COO", company: "Meridian Civil Engineers", email: "apark@meridianeng.com", partnerLeadId: "p-3", industry: "engineering", lastTouchAt: "2026-05-04", source: "Outbound" },
  { id: "c-12", name: "Joel Sandström", title: "Owner", company: "Sandström Performance", email: "joel@sandstromperf.se", partnerLeadId: "p-4", industry: "motorsport", lastTouchAt: "2026-02-22", source: "Personal network" },
];

/* ──────────────────────────────────────────────────────────────────────
   Interactions — the communications log behind each contact.
   Newest first. Append-only history; nothing here is ever overwritten.
   ────────────────────────────────────────────────────────────────────── */

export const interactions: Interaction[] = [
  { id: "in-1", contactId: "c-1", type: "meeting", date: "2026-05-08", channel: "On-site", summary: "Walked the dispatch yard with Heather and two dispatchers. She wants a 2-week paid pilot on one crew before committing to the MSA. Reiterated: measure success in dispatcher hours saved.", loggedBy: "Jason Lotoski" },
  { id: "in-2", contactId: "c-1", type: "email-received", date: "2026-05-02", summary: "Sent legal's red-lines on the MSA. Flagged IP-ownership clause as the open item.", loggedBy: "Jason Lotoski" },
  { id: "in-3", contactId: "c-1", type: "call", date: "2026-04-21", channel: "Phone", summary: "30-min scoping call. Confirmed the spreadsheet+radio workflow is the pain. Bernard Mathieu intro'd us; she trusts his read.", loggedBy: "Jason Lotoski" },
  { id: "in-4", contactId: "c-1", type: "email-sent", date: "2026-04-14", summary: "Recap + one-pager after the intro. Kept it to three bullets per her preference.", loggedBy: "AGENT · CLAUDE" },

  { id: "in-5", contactId: "c-2", type: "email-sent", date: "2026-05-10", summary: "Sent SOW v2 with the phased-pilot structure he asked for. Awaiting his ops sponsor's read.", loggedBy: "Marcus Halloran" },
  { id: "in-6", contactId: "c-2", type: "meeting", date: "2026-04-28", channel: "Zoom", summary: "Technical deep-dive. Tomás wanted to understand the agent's work-order drafting logic before championing internally.", loggedBy: "Marcus Halloran" },
  { id: "in-7", contactId: "c-2", type: "other", date: "2026-04-02", channel: "Conference", summary: "Met at SAE Detroit. Exchanged cards, he flagged interest in ops automation.", loggedBy: "Marcus Halloran" },

  { id: "in-8", contactId: "c-4", type: "call", date: "2026-05-11", channel: "Phone", summary: "Connor wants a discovery scoped before the September race calendar locks. Timing is the constraint, not budget.", loggedBy: "Sasha Whitfield" },
  { id: "in-9", contactId: "c-6", type: "meeting", date: "2026-05-05", channel: "On-site", summary: "Field-ops dispatch walkthrough. Ready to scope the build.", loggedBy: "Jason Lotoski" },
];

/* ──────────────────────────────────────────────────────────────────────
   Deals (pipeline)
   ────────────────────────────────────────────────────────────────────── */

// stageEnteredAt spread to showcase the board's aging colors (today ≈ 2026-05-29):
// fresh/green < 14d (after ~05-15), warming/orange 14–27d (~05-02→05-15), stale/red 28d+.
export const deals: Deal[] = [
  { id: "d-1", contactId: "c-1", company: "Cascade Heavy Civil", stage: "negotiation", valueEstimate: 480000, partnerLeadId: "p-1", industry: "construction", subIndustry: "Heavy Civil & Infrastructure", closeTargetDate: "2026-05-22", createdAt: "2026-03-04", lastTouchAt: "2026-05-08", stageEnteredAt: "2026-05-08", notes: "MSA red-lines back from legal. Operating-sponsor sign-off pending." },
  { id: "d-2", contactId: "c-2", company: "Northshore Powertrain", stage: "proposal", valueEstimate: 320000, partnerLeadId: "p-2", industry: "automotive", subIndustry: "Parts & Suppliers (Tier 1/2)", closeTargetDate: "2026-06-15", createdAt: "2026-03-28", lastTouchAt: "2026-05-10", stageEnteredAt: "2026-05-18", notes: "SOW v2 out. They asked for a phased pilot." },
  { id: "d-3", contactId: "c-3", company: "Westline Engineering", stage: "discovery", valueEstimate: 280000, partnerLeadId: "p-3", industry: "engineering", closeTargetDate: "2026-07-01", createdAt: "2026-04-15", lastTouchAt: "2026-05-09", stageEnteredAt: "2026-05-20", notes: "On-site embed week 1 of June. Need to confirm two operator interviews." },
  { id: "d-4", contactId: "c-4", company: "Apex Racing Group", stage: "qualified", valueEstimate: 180000, partnerLeadId: "p-4", industry: "motorsport", closeTargetDate: "2026-06-30", createdAt: "2026-05-01", lastTouchAt: "2026-05-11", stageEnteredAt: "2026-05-22", notes: "Connor wants a discovery scoped before September race calendar locks." },
  { id: "d-5", contactId: "c-5", company: "Granite Bay Auto Group", stage: "lead", valueEstimate: 240000, partnerLeadId: "p-2", industry: "automotive", closeTargetDate: "2026-08-01", createdAt: "2026-02-18", lastTouchAt: "2026-04-02", stageEnteredAt: "2026-04-02", notes: "Cold for 5+ weeks. Re-engage." },
  { id: "d-6", contactId: "c-6", company: "Iron Spur Construction", stage: "proposal", valueEstimate: 360000, partnerLeadId: "p-1", industry: "construction", closeTargetDate: "2026-06-05", createdAt: "2026-04-10", lastTouchAt: "2026-05-05", stageEnteredAt: "2026-05-05", notes: "Field-ops dispatch system. Ready to scope build." },
  { id: "d-7", contactId: "c-7", company: "Halifax Marine Engineering", stage: "lead", valueEstimate: 220000, partnerLeadId: "p-3", industry: "engineering", closeTargetDate: "2026-09-01", createdAt: "2026-01-10", lastTouchAt: "2026-03-18", stageEnteredAt: "2026-03-18", notes: "Long cold. Lena moved roles internally — verify decision authority." },
  { id: "d-8", contactId: "c-8", company: "Crown Performance Engines", stage: "discovery", valueEstimate: 140000, partnerLeadId: "p-4", industry: "motorsport", closeTargetDate: "2026-07-15", createdAt: "2026-04-22", lastTouchAt: "2026-05-09", stageEnteredAt: "2026-05-17", notes: "Small but strategic — racing IP." },
  { id: "d-9", contactId: "c-9", company: "Vanguard Steelworks", stage: "qualified", valueEstimate: 410000, partnerLeadId: "p-1", industry: "construction", closeTargetDate: "2026-08-15", createdAt: "2026-04-29", lastTouchAt: "2026-05-07", stageEnteredAt: "2026-05-07" },
  { id: "d-10", contactId: "c-10", company: "Lakeshore Dealership Group", stage: "discovery", valueEstimate: 270000, partnerLeadId: "p-2", industry: "automotive", closeTargetDate: "2026-07-30", createdAt: "2026-04-25", lastTouchAt: "2026-05-11", stageEnteredAt: "2026-05-19" },
  { id: "d-11", contactId: "c-11", company: "Meridian Civil Engineers", stage: "qualified", valueEstimate: 195000, partnerLeadId: "p-3", industry: "engineering", closeTargetDate: "2026-08-20", createdAt: "2026-05-01", lastTouchAt: "2026-05-04", stageEnteredAt: "2026-05-04" },
];

/* ──────────────────────────────────────────────────────────────────────
   Clients (signed engagements)
   ────────────────────────────────────────────────────────────────────── */

export const clients: Client[] = [
  {
    id: "cl-1",
    company: "Brightline Industrial Group",
    industry: "engineering",
    subIndustry: "Industrial Equipment",
    revenue: "$85M",
    partnerLeadId: "p-3",
    primaryContactId: "c-1",
    driveFolderUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Brightline",
    workspacePath: "C:\\Users\\jason\\Desktop\\ShiftAI-Clients\\Brightline",
    contractValue: 540000,
    contractSignedAt: "2026-02-12",
    status: "on-track",
    notes: "Phase 2 (Build) underway. Dispatch + work-order system shipping in June.",
    companySize: "650–800",
    headquarters: "Burnaby, BC",
    founded: "1994",
    website: "brightlineindustrial.com",
    ownership: "Private · founder-led (succession underway)",
    description: "Industrial fabrication and field-services group serving heavy infrastructure and utilities across western Canada. Three divisions: fabrication, field services, maintenance.",
    brandColors: ["#1F3A5F", "#E0A526"],
    logoMonogram: "BIG",
    companyKeyFacts: [
      "Founder is 2–3 years from a planned exit; ops modernization is part of the succession story.",
      "Field services is the growth division and the beachhead for our build.",
    ],
    enrichedAt: "2026-05-06",
    paymentTerms: "Net 30 · 30% on signing",
    contractEndAt: "2026-07-31",
    billingContactId: "c-1",
  },
  {
    id: "cl-2",
    company: "Driveline Auto Holdings",
    industry: "automotive",
    subIndustry: "Dealership Groups",
    revenue: "$140M",
    partnerLeadId: "p-2",
    primaryContactId: "c-2",
    driveFolderUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Driveline",
    workspacePath: "C:\\Users\\jason\\Desktop\\ShiftAI-Clients\\Driveline",
    contractValue: 720000,
    contractSignedAt: "2025-11-04",
    status: "at-risk",
    notes: "Run phase. Integration with their DMS hitting friction — escalation flagged.",
    companySize: "1,100–1,400",
    headquarters: "London, ON",
    founded: "1986",
    website: "drivelineauto.com",
    ownership: "PE-backed (Tarn Capital, majority 2022)",
    description: "Multi-location automotive dealership group — 12 rooftops across Ontario. Sales, service, parts, and an in-house F&I arm.",
    brandColors: ["#0E2A47", "#C42127"],
    logoMonogram: "DAH",
    companyKeyFacts: [
      "PE owner wants a sellable 'sales operations layer' as part of the equity story.",
      "Legacy DMS (vendor-locked) is the integration bottleneck driving the at-risk flag.",
    ],
    enrichedAt: "2026-04-30",
    paymentTerms: "Net 30",
    contractEndAt: "2026-06-30",
    billingContactId: "c-2",
  },
  {
    id: "cl-3",
    company: "Helix Construction Partners",
    industry: "construction",
    revenue: "$210M",
    partnerLeadId: "p-1",
    primaryContactId: "c-6",
    driveFolderUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Helix",
    workspacePath: "C:\\Users\\jason\\Desktop\\ShiftAI-Clients\\Helix",
    contractValue: 460000,
    contractSignedAt: "2026-03-20",
    status: "on-track",
    notes: "Discovery wrapped. Build kickoff May 28.",
    companySize: "1,800–2,200",
    headquarters: "Calgary, AB",
    founded: "1971",
    website: "helixconstruction.ca",
    ownership: "Private · employee-owned (ESOP)",
    description: "Large commercial and civil construction partner across the prairies. Self-perform concrete and earthworks, with a sizeable subcontractor network.",
    brandColors: ["#16322B", "#D6562E"],
    logoMonogram: "HCP",
    companyKeyFacts: [
      "Employee-owned — buy-in matters; foremen are stakeholders, not just users.",
      "Safety-incident routing is the politically important part of the build.",
    ],
    enrichedAt: "2026-05-01",
    paymentTerms: "Net 45 · milestone-based",
    contractEndAt: "2026-09-15",
    billingContactId: "c-6",
  },
];

/* ──────────────────────────────────────────────────────────────────────
   Projects (per-client engagements)
   ────────────────────────────────────────────────────────────────────── */

export const projects: Project[] = [
  {
    id: "pr-1",
    clientId: "cl-1",
    name: "Brightline · Dispatch & Work-Order Platform",
    phase: "build",
    status: "on-track",
    startDate: "2026-02-19",
    targetEndDate: "2026-07-31",
    budgetFee: 540000,
    partnerLeadId: "p-3",
    consultantIds: ["p-1"],
    description: "Custom dispatch system replacing the spreadsheet + radio workflow. AI agent drafts work orders from incoming service requests; field-ops dashboard runs on tablets.",
  },
  {
    id: "pr-2",
    clientId: "cl-2",
    name: "Driveline · DMS-Integrated Sales Ops Layer",
    phase: "run",
    status: "at-risk",
    startDate: "2025-11-18",
    targetEndDate: "2026-06-30",
    budgetFee: 720000,
    partnerLeadId: "p-2",
    consultantIds: ["p-4"],
    description: "Connects 12 dealership locations into one sales operations layer. DMS integration causing rework; status flagged at-risk for two weeks running.",
  },
  {
    id: "pr-3",
    clientId: "cl-3",
    name: "Helix · Field-Ops Reporting + AI Site Brief",
    phase: "discovery",
    status: "on-track",
    startDate: "2026-03-25",
    targetEndDate: "2026-09-15",
    budgetFee: 460000,
    partnerLeadId: "p-1",
    consultantIds: ["p-3"],
    description: "Discovery phase complete. Building daily site briefs auto-generated from foreman field reports + safety incident routing.",
  },
  {
    id: "pr-4",
    clientId: "cl-1",
    name: "Brightline · Phase 1 · Discovery (closed)",
    phase: "discovery",
    status: "closed",
    startDate: "2026-01-08",
    targetEndDate: "2026-02-12",
    budgetFee: 95000,
    partnerLeadId: "p-3",
    consultantIds: ["p-1"],
    description: "Discovery engagement — closed Feb 12. Output: build plan for pr-1.",
  },
];

/* ──────────────────────────────────────────────────────────────────────
   Milestones
   ────────────────────────────────────────────────────────────────────── */

export const milestones: Milestone[] = [
  { id: "m-1", projectId: "pr-1", title: "Dispatcher dashboard alpha (operators using daily)", dueDate: "2026-05-30", status: "in-progress" },
  { id: "m-2", projectId: "pr-1", title: "Work-order AI drafter live in production", dueDate: "2026-06-20", status: "pending" },
  { id: "m-3", projectId: "pr-1", title: "Field tablet rollout — 40 trucks", dueDate: "2026-07-15", status: "pending" },
  { id: "m-4", projectId: "pr-1", title: "Run-phase transition + Operating Review #1", dueDate: "2026-07-31", status: "pending" },
  { id: "m-5", projectId: "pr-2", title: "DMS-integration v2 release", dueDate: "2026-05-28", status: "at-risk" },
  { id: "m-6", projectId: "pr-2", title: "Multi-location dealer onboarding (cohort B)", dueDate: "2026-06-15", status: "pending" },
  { id: "m-7", projectId: "pr-3", title: "Discovery report → operating sponsor", dueDate: "2026-04-30", status: "complete" },
  { id: "m-8", projectId: "pr-3", title: "Build plan approval", dueDate: "2026-05-23", status: "in-progress" },
];

/* ──────────────────────────────────────────────────────────────────────
   Invoices
   ────────────────────────────────────────────────────────────────────── */

export const invoices: Invoice[] = [
  { id: "i-1", number: "SAI-2026-008", clientId: "cl-1", projectId: "pr-1", amount: 90000, issuedAt: "2026-05-01", dueAt: "2026-05-31", status: "sent" },
  { id: "i-2", number: "SAI-2026-007", clientId: "cl-2", projectId: "pr-2", amount: 60000, issuedAt: "2026-04-15", dueAt: "2026-05-15", status: "overdue" },
  { id: "i-3", number: "SAI-2026-006", clientId: "cl-3", projectId: "pr-3", amount: 76000, issuedAt: "2026-04-30", dueAt: "2026-05-30", status: "sent" },
  { id: "i-4", number: "SAI-2026-005", clientId: "cl-1", projectId: "pr-1", amount: 90000, issuedAt: "2026-04-01", dueAt: "2026-05-01", status: "paid", paidAt: "2026-04-22" },
  { id: "i-5", number: "SAI-2026-004", clientId: "cl-2", projectId: "pr-2", amount: 60000, issuedAt: "2026-03-15", dueAt: "2026-04-15", status: "paid", paidAt: "2026-04-11" },
  { id: "i-6", number: "SAI-2026-003", clientId: "cl-1", projectId: "pr-4", amount: 47500, issuedAt: "2026-02-15", dueAt: "2026-03-15", status: "paid", paidAt: "2026-03-08" },
  { id: "i-7", number: "SAI-2026-009", clientId: "cl-3", projectId: "pr-3", amount: 38000, issuedAt: "2026-05-10", dueAt: "2026-06-10", status: "draft" },
];

/* ──────────────────────────────────────────────────────────────────────
   Activity feed
   ────────────────────────────────────────────────────────────────────── */

export const activities: Activity[] = [
  { id: "a-1", ts: "2026-05-11T15:42", actor: "AGENT · CLAUDE", type: "ai", target: "Driveline weekly brief", detail: "Drafted weekly brief — awaiting partner review" },
  { id: "a-3", ts: "2026-05-11T11:02", actor: "Marcus Halloran", type: "status", target: "Driveline · DMS-Integrated Sales Ops", detail: "Status flagged AT-RISK (week 2)" },
  { id: "a-4", ts: "2026-05-11T09:34", actor: "Sasha Whitfield", type: "touch", target: "Apex Racing Group", detail: "Discovery call — scoping pilot for September" },
  { id: "a-5", ts: "2026-05-10T17:11", actor: "Devon Reyes", type: "doc", target: "Helix · Discovery report", detail: "Sent discovery report to operating sponsor" },
  { id: "a-6", ts: "2026-05-10T16:00", actor: "AGENT · CLAUDE", type: "ai", target: "Pipeline hygiene", detail: "Flagged 3 stale leads (30+ days) for re-engagement" },
  { id: "a-8", ts: "2026-05-09T10:12", actor: "Marcus Halloran", type: "touch", target: "Northshore Powertrain", detail: "Sent SOW v2 — phased pilot" },
];

/* ──────────────────────────────────────────────────────────────────────
   Tasks — dashboard view A (the "do" list)
   ────────────────────────────────────────────────────────────────────── */

export const tasks: Task[] = [
  { id: "t-1", title: "Send Cascade the 2-week pilot SOW (Heather wants it before MSA)", due: "2026-05-19", priority: "high", ownerId: "p-1", relatedTo: "Cascade Heavy Civil", done: false },
  { id: "t-2", title: "Chase Driveline DMS vendor on integration access", due: "2026-05-19", priority: "high", ownerId: "p-2", relatedTo: "Driveline Auto Holdings", clientId: "cl-2", projectId: "pr-2", done: false },
  { id: "t-3", title: "Re-engage Granite Bay (cold 47d)", due: "2026-05-20", priority: "medium", ownerId: "p-2", relatedTo: "Granite Bay Auto Group", done: false },
  { id: "t-4", title: "Review Claude's Driveline weekly brief before partner mtg", due: "2026-05-19", priority: "medium", ownerId: "p-1", relatedTo: "Driveline Auto Holdings", clientId: "cl-2", projectId: "pr-2", done: false },
  { id: "t-5", title: "Confirm two operator interviews for Westline discovery", due: "2026-05-22", priority: "medium", ownerId: "p-3", relatedTo: "Westline Engineering", done: false },
  { id: "t-6", title: "Scope Apex discovery before Sept race calendar locks", due: "2026-05-26", priority: "low", ownerId: "p-4", relatedTo: "Apex Racing Group", done: false },
  { id: "t-7", title: "Approve Helix build plan (milestone due 23rd)", due: "2026-05-23", priority: "high", ownerId: "p-1", relatedTo: "Helix Construction Partners", clientId: "cl-3", projectId: "pr-3", done: true },
];

/* ──────────────────────────────────────────────────────────────────────
   Artifacts — every AI-generated or partner-uploaded deliverable.
   Demo fixtures: mix of types, partner + agent creators, statuses.
   ────────────────────────────────────────────────────────────────────── */

export const artifacts: Artifact[] = [
  {
    id: "ar-1",
    type: "sow",
    title: "Brightline · Phase 1 Discovery SOW",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Brightline/00-Engagement/Phase1-Discovery-SOW.pdf",
    fileName: "Phase1-Discovery-SOW.pdf",
    createdBy: "Devon Reyes",
    reviewStatus: "approved",
    clientId: "cl-1",
    projectId: "pr-4",
    createdAt: "2026-01-09T15:22:00Z",
  },
  {
    id: "ar-2",
    type: "deck",
    title: "Brightline · Phase 2 Build Plan",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Brightline/30-Deliverables/Phase2-Build-Plan.pdf",
    fileName: "Phase2-Build-Plan.pdf",
    createdBy: "Devon Reyes",
    reviewStatus: "sent",
    clientId: "cl-1",
    projectId: "pr-1",
    createdAt: "2026-02-18T09:40:00Z",
  },
  {
    id: "ar-3",
    type: "report",
    title: "Brightline · Weekly status brief — week 12",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Brightline/30-Deliverables/weekly-w12.md",
    fileName: "weekly-w12.md",
    createdBy: "AGENT · CLAUDE",
    generatedFromSkill: "weekly-brief",
    reviewStatus: "draft",
    clientId: "cl-1",
    projectId: "pr-1",
    createdAt: "2026-05-19T08:15:00Z",
  },
  {
    id: "ar-4",
    type: "report",
    title: "Driveline · DMS Integration Risk Memo",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Driveline/30-Deliverables/dms-risk-memo.pdf",
    fileName: "dms-risk-memo.pdf",
    createdBy: "Marcus Halloran",
    reviewStatus: "sent",
    clientId: "cl-2",
    projectId: "pr-2",
    createdAt: "2026-05-12T17:05:00Z",
  },
  {
    id: "ar-5",
    type: "email",
    title: "Driveline CTO · re-engage on vendor escalation",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Driveline/40-Comms/cto-reengage-draft.md",
    fileName: "cto-reengage-draft.md",
    createdBy: "AGENT · CLAUDE",
    generatedFromSkill: "draft-email",
    reviewStatus: "draft",
    clientId: "cl-2",
    projectId: "pr-2",
    createdAt: "2026-05-18T11:30:00Z",
  },
  {
    id: "ar-6",
    type: "deck",
    title: "Helix · Discovery Findings",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Helix/30-Deliverables/discovery-findings.pdf",
    fileName: "discovery-findings.pdf",
    createdBy: "Jason Lotoski",
    reviewStatus: "approved",
    clientId: "cl-3",
    projectId: "pr-3",
    createdAt: "2026-04-22T14:12:00Z",
  },
  {
    id: "ar-7",
    type: "report",
    title: "Helix · AI Site Brief — Foreman 042 pilot output",
    driveUrl: "https://drive.google.com/.../Shift%20AI/03-Clients/Helix/30-Deliverables/site-brief-f042.md",
    fileName: "site-brief-f042.md",
    createdBy: "AGENT · CLAUDE",
    generatedFromSkill: "site-brief",
    reviewStatus: "draft",
    clientId: "cl-3",
    projectId: "pr-3",
    createdAt: "2026-05-17T07:48:00Z",
  },
];

/* ──────────────────────────────────────────────────────────────────────
   Team updates + industry news — dashboard view B (the "know" feed)
   ────────────────────────────────────────────────────────────────────── */

export const teamUpdates: TeamUpdate[] = [
  { id: "tu-1", ts: "2026-05-19T08:30", author: "AGENT · CLAUDE", cadence: "weekly", body: "Weekly firm brief: 3 active builds, Driveline at-risk for week 3 (DMS access still blocked). Pipeline added Meridian (qualified). 2 invoices clear net-30 this week." },
  { id: "tu-2", ts: "2026-05-19T08:05", author: "Devon Reyes", cadence: "daily", body: "Helix build plan ready for partner approval — foreman buy-in interviews done, safety-routing flow signed off by their EHS lead." },
  { id: "tu-3", ts: "2026-05-18T17:40", author: "Marcus Halloran", cadence: "daily", body: "Driveline: escalation call set with their CTO Wed. If DMS access isn't unblocked we re-baseline the run-phase timeline." },
  { id: "tu-4", ts: "2026-05-18T09:15", author: "Jason Lotoski", cadence: "daily", body: "Cascade pilot is the priority this week — Heather will sign the MSA off the back of a working 2-week pilot, not a deck." },
];

export const news: NewsItem[] = [
  { id: "n-1", ts: "2026-05-18", source: "Automotive News", industry: "automotive", headline: "Major DMS vendor announces open-API tier under regulatory pressure", why: "Directly relevant to the Driveline integration bottleneck — worth raising on Wed's escalation call." },
  { id: "n-2", ts: "2026-05-16", source: "ENR", industry: "construction", headline: "Western Canada infrastructure spend projected up 14% in 2027", why: "Tailwind for Cascade and Helix; useful framing for expansion conversations." },
  { id: "n-3", ts: "2026-05-15", source: "Racecar Engineering", industry: "motorsport", headline: "Series tightens data-logging homologation rules for 2027", why: "Touches Apex and Crown — their racing-IP timelines may shift; flag in discovery scoping." },
];

/* ──────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

export function partnerById(id: string) {
  return partners.find((p) => p.id === id);
}
export function contactById(id: string) {
  return contacts.find((c) => c.id === id);
}
export function clientById(id: string) {
  return clients.find((cl) => cl.id === id);
}
export function projectById(id: string) {
  return projects.find((p) => p.id === id);
}
export function dealById(id: string) {
  return deals.find((d) => d.id === id);
}
export function interactionsByContact(id: string) {
  return interactions
    .filter((i) => i.contactId === id)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

// Keys mirror Prisma's enum identifiers (underscored). The DB stores
// the hyphenated form via @map, but the client returns identifiers.
export const interactionLabels: Record<string, string> = {
  call: "Call",
  meeting: "Meeting",
  email_sent: "Email sent",
  email_received: "Email received",
  other: "Other",
};

export const stageOrder: Deal["stage"][] = ["lead", "qualified", "discovery", "discussion", "proposal", "negotiation", "signed"];

export const stageLabels: Record<Deal["stage"], string> = {
  lead: "Lead",
  qualified: "Qualified",
  discovery: "Discovery Call",
  discussion: "Discussion Call",
  proposal: "Proposal",
  negotiation: "Negotiation",
  signed: "Signed",
};

// Lead-source bucket → human label (capture dropdowns + detail display).
export const leadSourceLabels: Record<string, string> = {
  intro: "Intro",
  outbound: "Outbound",
  referral: "Referral",
  event: "Event",
  inbound: "Inbound",
  ai_found: "AI Found",
  imported: "Imported",
  other: "Other",
};

// industryLabels is the firm's canonical vertical-label map — now owned by
// @/lib/industries (the single source of truth). Re-exported here for
// back-compat with pages/components still importing it from seed.ts; migrate
// new code to import from @/lib/industries directly.
export { industryLabels } from "@/lib/industries";

// Pure formatters now live in @/lib/format. Re-exported here for back-compat
// with pages still importing from seed.ts; migrate new code to @/lib/format directly.
export { formatCAD, formatDate, daysSince } from "@/lib/format";
