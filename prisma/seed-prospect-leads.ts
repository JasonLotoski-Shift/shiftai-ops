// Seed fictional AI Found Leads (Lead Agent — Phase B).
//
// Idempotent: upsert by stable id (pl-N / lr-N), so re-running never
// duplicates. domain is UNIQUE — every row's domain is distinct. segmentId
// values reference the Phase A seeded segments (seg-automotive etc.).
//
// Run with: npx tsx --env-file=.env prisma/seed-prospect-leads.ts

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Person = { name: string; title: string; email?: string; linkedin?: string; source?: string };
type ProspectLeadStatus = "pending" | "contacted" | "added" | "ghost";

type SeedLead = {
  id: string;
  companyName: string;
  domain: string;
  segmentId: string;
  industryTags: string[];
  revenueEstimate: number;
  employeeEstimate: number;
  headquarters: string;
  score: number;
  rationale: string;
  disqualified: boolean;
  status: ProspectLeadStatus;
  foundBy: string[];
  people: Person[];
  outreachSubject?: string;
  outreachDraft?: string;
  outreachPersonIndex?: number;
  outreachSentAt?: Date;
  convertedContactId?: string;
  convertedDealId?: string;
};

const li = (name: string) => `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
const em = (first: string, last: string, domain: string) => `${first[0].toLowerCase()}.${last.toLowerCase()}@${domain}`;

const LEADS: SeedLead[] = [
  {
    id: "pl-1",
    companyName: "Apex Drivetrain Systems",
    domain: "apexdrivetrain.com",
    segmentId: "seg-automotive",
    industryTags: ["Auto Parts & Suppliers", "Tier 1 Suppliers", "Powertrain"],
    revenueEstimate: 142_000_000,
    employeeEstimate: 780,
    headquarters: "Windsor, Ontario, Canada",
    score: 9,
    rationale:
      "Tier-1 powertrain supplier in the Windsor corridor actively modernizing its plant-floor data — recent hires in operations analytics and a public OEE initiative align tightly with the Automotive segment's buying signals. Revenue and headcount sit squarely in band.",
    disqualified: false,
    status: "pending",
    foundBy: ["firecrawl", "apollo"],
    people: [
      { name: "Daniel Royce", title: "VP Operations", email: em("Daniel", "Royce", "apexdrivetrain.com"), linkedin: li("Daniel Royce"), source: "apollo" },
      { name: "Priya Anand", title: "Director, Manufacturing Systems", email: em("Priya", "Anand", "apexdrivetrain.com"), linkedin: li("Priya Anand"), source: "firecrawl" },
      { name: "Marcus Bell", title: "Chief Operating Officer", email: em("Marcus", "Bell", "apexdrivetrain.com"), linkedin: li("Marcus Bell"), source: "apollo" },
    ],
  },
  {
    id: "pl-2",
    companyName: "Northgate Auto Group",
    domain: "northgateauto.ca",
    segmentId: "seg-automotive",
    industryTags: ["Dealership Groups", "Retail Automotive"],
    revenueEstimate: 88_000_000,
    employeeEstimate: 340,
    headquarters: "Mississauga, Ontario, Canada",
    score: 7,
    rationale:
      "Mid-market dealership group with eight rooftops consolidating onto a single DMS — a clear data-unification trigger. Slightly outside the core manufacturing focus but a strong operations-modernization fit with budget authority concentrated in a small executive team.",
    disqualified: false,
    // pl-2: a normal pending lead with a saved (unsent) cold-email draft.
    status: "pending",
    foundBy: ["apollo"],
    people: [
      { name: "Sara Whitfield", title: "Chief Operating Officer", email: em("Sara", "Whitfield", "northgateauto.ca"), linkedin: li("Sara Whitfield"), source: "apollo" },
      { name: "Tom Devlin", title: "Group Controller", email: em("Tom", "Devlin", "northgateauto.ca"), linkedin: li("Tom Devlin"), source: "apollo" },
    ],
    outreachPersonIndex: 0,
    outreachSubject: "consolidating eight rooftops onto one DMS",
    outreachDraft:
      "Sara — saw Northgate is pulling its eight rooftops onto a single DMS. That kind of consolidation is usually where the operational data finally becomes usable — and where it quietly breaks if the reporting layer doesn't keep up.\n\nWe're a small senior firm that helps mid-market operators turn that kind of system change into something their leadership team can actually run the business on. No pitch — just thought it was worth comparing notes given where you are.\n\nWorth a short call in the next couple of weeks?\n\nJason",
  },
  {
    id: "pl-3",
    companyName: "Velocity Race Engineering",
    domain: "velocityrace.com",
    segmentId: "seg-motorsport",
    industryTags: ["Motorsport", "Race Engineering", "Composites"],
    revenueEstimate: 54_000_000,
    employeeEstimate: 210,
    headquarters: "Bowmanville, Ontario, Canada",
    score: 10,
    rationale:
      "Premier race-engineering shop with a documented push into simulation and telemetry analytics — a textbook match for the Motorsport segment. Named anchor-adjacent, expanding its data team, and the leadership has publicly framed analytics as a competitive edge.",
    disqualified: false,
    status: "pending",
    foundBy: ["firecrawl", "apollo"],
    people: [
      { name: "Elena Marsh", title: "Head of Performance Engineering", email: em("Elena", "Marsh", "velocityrace.com"), linkedin: li("Elena Marsh"), source: "firecrawl" },
      { name: "Reid Calloway", title: "Technical Director", email: em("Reid", "Calloway", "velocityrace.com"), linkedin: li("Reid Calloway"), source: "apollo" },
      { name: "Nina Petrov", title: "Data & Telemetry Lead", email: em("Nina", "Petrov", "velocityrace.com"), linkedin: li("Nina Petrov"), source: "apollo" },
      { name: "Owen Tate", title: "Managing Director", email: em("Owen", "Tate", "velocityrace.com"), linkedin: li("Owen Tate"), source: "firecrawl" },
    ],
  },
  {
    id: "pl-4",
    companyName: "Tarmac Motorsports Collective",
    domain: "tarmaccollective.com",
    segmentId: "seg-motorsport",
    industryTags: ["Motorsport", "Track Operations", "Events"],
    revenueEstimate: 31_000_000,
    employeeEstimate: 120,
    headquarters: "Calgary, Alberta, Canada",
    score: 6,
    rationale:
      "Track-operations and event group with growing data needs around timing and attendance. Fits the segment thematically but the buying signal is softer — no clear analytics mandate yet, and HQ is outside the priority Ontario geography.",
    disqualified: false,
    status: "pending",
    foundBy: ["firecrawl"],
    people: [
      { name: "Grant Holloway", title: "Operations Director", email: em("Grant", "Holloway", "tarmaccollective.com"), linkedin: li("Grant Holloway"), source: "firecrawl" },
      { name: "Mara Quinn", title: "Events & Partnerships Lead", email: em("Mara", "Quinn", "tarmaccollective.com"), linkedin: li("Mara Quinn"), source: "firecrawl" },
    ],
  },
  {
    id: "pl-5",
    companyName: "Meridian Engineering Works",
    domain: "meridianworks.com",
    segmentId: "seg-engineering",
    industryTags: ["Engineering Services", "Industrial Automation", "Custom Machinery"],
    revenueEstimate: 96_000_000,
    employeeEstimate: 520,
    headquarters: "Kitchener, Ontario, Canada",
    score: 8,
    rationale:
      "Custom-machinery and automation firm scaling its project-delivery function. Recent leadership commentary on bid-to-build data visibility maps directly to the Engineering segment's signals, and the firm is in the revenue sweet spot with a clear ops decision-maker.",
    disqualified: false,
    status: "pending",
    foundBy: ["firecrawl", "apollo"],
    people: [
      { name: "Hugh Bannister", title: "VP Engineering", email: em("Hugh", "Bannister", "meridianworks.com"), linkedin: li("Hugh Bannister"), source: "apollo" },
      { name: "Claire Osei", title: "Director of Project Delivery", email: em("Claire", "Osei", "meridianworks.com"), linkedin: li("Claire Osei"), source: "firecrawl" },
      { name: "Victor Lin", title: "Chief Executive Officer", email: em("Victor", "Lin", "meridianworks.com"), linkedin: li("Victor Lin"), source: "apollo" },
    ],
  },
  {
    id: "pl-6",
    companyName: "Cascade Process Systems",
    domain: "cascadeprocess.ca",
    segmentId: "seg-engineering",
    industryTags: ["Process Engineering", "Industrial"],
    revenueEstimate: 67_000_000,
    employeeEstimate: 290,
    headquarters: "Hamilton, Ontario, Canada",
    score: 7,
    rationale:
      "Process-engineering firm serving food and chemical plants, with a stated goal to standardize project reporting. Solid segment fit and good geography; the buying signal is present but earlier-stage than the top-tier leads.",
    disqualified: false,
    status: "pending",
    foundBy: ["apollo"],
    people: [
      { name: "Iris Hollands", title: "Director of Operations", email: em("Iris", "Hollands", "cascadeprocess.ca"), linkedin: li("Iris Hollands"), source: "apollo" },
      { name: "Pavel Drozd", title: "Engineering Manager", email: em("Pavel", "Drozd", "cascadeprocess.ca"), linkedin: li("Pavel Drozd"), source: "apollo" },
    ],
  },
  {
    id: "pl-7",
    companyName: "Bedrock Construction Partners",
    domain: "bedrockpartners.ca",
    segmentId: "seg-construction",
    industryTags: ["Commercial Construction", "General Contracting"],
    revenueEstimate: 134_000_000,
    employeeEstimate: 610,
    headquarters: "Vaughan, Ontario, Canada",
    score: 8,
    rationale:
      "Commercial GC with a fast-growing project portfolio and public commitments to digitizing field reporting and cost tracking. Strong Construction-segment signal, ideal geography, and an operations leader who owns the tooling decision.",
    disqualified: false,
    status: "pending",
    foundBy: ["firecrawl"],
    people: [
      { name: "Renata Cole", title: "VP Operations", email: em("Renata", "Cole", "bedrockpartners.ca"), linkedin: li("Renata Cole"), source: "firecrawl" },
      { name: "Sam Okafor", title: "Director of Field Operations", email: em("Sam", "Okafor", "bedrockpartners.ca"), linkedin: li("Sam Okafor"), source: "firecrawl" },
      { name: "Lydia Frost", title: "Chief Operating Officer", email: em("Lydia", "Frost", "bedrockpartners.ca"), linkedin: li("Lydia Frost"), source: "firecrawl" },
    ],
  },
  {
    id: "pl-8",
    companyName: "Hollow Creek Builders",
    domain: "hollowcreekbuilders.com",
    segmentId: "seg-construction",
    industryTags: ["Residential Construction", "Homebuilding"],
    revenueEstimate: 14_000_000,
    employeeEstimate: 65,
    headquarters: "Barrie, Ontario, Canada",
    score: 4,
    rationale:
      "Residential homebuilder below the segment's revenue floor (~$25M) with limited operations complexity. Filed out: too small to carry a data-modernization engagement and no clear buying signal.",
    disqualified: true,
    status: "ghost",
    foundBy: ["firecrawl"],
    people: [
      { name: "Dale Mercer", title: "Owner", email: em("Dale", "Mercer", "hollowcreekbuilders.com"), source: "firecrawl" },
      { name: "Joan Reyes", title: "Office Manager", email: em("Joan", "Reyes", "hollowcreekbuilders.com"), source: "firecrawl" },
    ],
  },
  {
    id: "pl-9",
    companyName: "Cardinal Fleet Services",
    domain: "cardinalfleet.ca",
    segmentId: "seg-automotive",
    industryTags: ["Fleet Services", "Vehicle Maintenance"],
    revenueEstimate: 41_000_000,
    employeeEstimate: 180,
    headquarters: "London, Ontario, Canada",
    score: 5,
    rationale:
      "Fleet-maintenance operator in band on size, but the discovery pass found no active modernization signal and the buyer committee looks fragmented. Filtered out on weak buying signal — worth revisiting if a trigger appears.",
    disqualified: false,
    status: "ghost",
    foundBy: ["apollo"],
    people: [
      { name: "Brent Salois", title: "General Manager", email: em("Brent", "Salois", "cardinalfleet.ca"), linkedin: li("Brent Salois"), source: "apollo" },
      { name: "Kim Tran", title: "Service Operations Lead", email: em("Kim", "Tran", "cardinalfleet.ca"), linkedin: li("Kim Tran"), source: "apollo" },
    ],
  },
];

type SeedRun = {
  id: string;
  segmentId: string;
  status: "running" | "done" | "error";
  evaluatedCount: number;
  finishedAt: Date | null;
};

const now = Date.now();
const RUNS: SeedRun[] = [
  { id: "lr-1", segmentId: "seg-automotive", status: "done", evaluatedCount: 84, finishedAt: new Date(now - 2 * 86_400_000) },
  { id: "lr-2", segmentId: "seg-motorsport", status: "done", evaluatedCount: 47, finishedAt: new Date(now - 1 * 86_400_000) },
  { id: "lr-3", segmentId: "seg-engineering", status: "done", evaluatedCount: 112, finishedAt: new Date(now - 1 * 86_400_000) },
  { id: "lr-4", segmentId: "seg-construction", status: "running", evaluatedCount: 38, finishedAt: null },
];

async function main() {
  for (const l of LEADS) {
    const data = {
      companyName: l.companyName,
      domain: l.domain,
      website: `https://${l.domain}`,
      industryTags: l.industryTags,
      revenueEstimate: l.revenueEstimate,
      employeeEstimate: l.employeeEstimate,
      headquarters: l.headquarters,
      segmentId: l.segmentId,
      score: l.score,
      rationale: l.rationale,
      disqualified: l.disqualified,
      status: l.status,
      people: l.people,
      foundBy: l.foundBy,
      createdBy: "AGENT · CLAUDE",
      generatedFromSkill: "find-leads",
      outreachSubject: l.outreachSubject ?? null,
      outreachDraft: l.outreachDraft ?? null,
      outreachPersonIndex: l.outreachPersonIndex ?? null,
      outreachSentAt: l.outreachSentAt ?? null,
      convertedContactId: l.convertedContactId ?? null,
      convertedDealId: l.convertedDealId ?? null,
      reviewedBy: l.status === "added" ? "Jason Lotoski" : null,
      reviewedAt: l.status === "added" ? (l.outreachSentAt ?? new Date()) : null,
    };
    await prisma.prospectLead.upsert({
      where: { id: l.id },
      update: data,
      create: { id: l.id, ...data },
    });
  }


  for (const r of RUNS) {
    const pending = LEADS.filter((l) => l.segmentId === r.segmentId && l.status === "pending").length;
    const ghost = LEADS.filter((l) => l.segmentId === r.segmentId && l.status === "ghost").length;
    const data = {
      segmentId: r.segmentId,
      status: r.status,
      evaluatedCount: r.evaluatedCount,
      foundCount: pending,
      ghostCount: ghost,
      createdBy: "AGENT · CLAUDE",
      finishedAt: r.finishedAt,
    };
    await prisma.leadRun.upsert({
      where: { id: r.id },
      update: data,
      create: { id: r.id, ...data },
    });
  }

  console.log(`Seeded ${LEADS.length} prospect leads and ${RUNS.length} lead runs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
