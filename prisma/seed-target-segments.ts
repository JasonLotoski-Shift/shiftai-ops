// Seed the 4 starter target segments (Lead Agent — Phase A: Targeting).
//
// Idempotent: upsert by stable id (seg-<vertical>), so re-running is safe and
// never duplicates. ALL values are fully editable later via the Targeting UI.
// Revenue is whole CAD integers. industries are FREE-FORM tags (not the
// Industry enum). searchSpec is left null for Phase A.
//
// Run with: npx tsx --env-file=.env prisma/seed-target-segments.ts

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type Persona = { department: string; seniority: string };
type Anchor = { name: string; domain?: string };

type SeedSegment = {
  id: string;
  name: string;
  priority: number;
  description: string;
  industries: string[];
  employeeMin: number;
  employeeMax: number;
  personas: Persona[];
  buyingSignals: string[];
  disqualifiers: string[];
  anchors: Anchor[];
};

// Shared across all four (editable in the UI).
const REVENUE_MIN = 25_000_000;
const REVENUE_MAX = 200_000_000;
// Canada-wide targeting — the firm serves clients across Canada, and the target
// industries (automotive, motorsport, etc.) are concentrated in Ontario/Quebec,
// not BC. No single-province priority so out-of-province leads aren't penalised.
const PRIORITY_LOCATION: string | null = null;
const GEOGRAPHIES = ["Canada"];

const SEGMENTS: SeedSegment[] = [
  {
    id: "seg-automotive",
    name: "Automotive",
    priority: 40,
    description:
      "Mid-market automotive manufacturers, suppliers, and dealership groups modernizing operations and data.",
    industries: [
      "Automotive Manufacturing",
      "Auto Parts & Suppliers",
      "Tier 1 & Tier 2 Suppliers",
      "Dealership Groups",
      "EV & Mobility",
    ],
    employeeMin: 100,
    employeeMax: 2000,
    personas: [
      { department: "Operations", seniority: "VP" },
      { department: "Executive", seniority: "C-Suite" },
      { department: "Operations", seniority: "Director" },
      { department: "IT", seniority: "VP" },
      { department: "Procurement", seniority: "Head" },
    ],
    buyingSignals: [
      "New ERP or MES rollout",
      "EV transition investment",
      "Plant expansion or reshoring",
      "Recent PE investment",
      "Hiring digital transformation lead",
      "Supply chain disruption initiative",
    ],
    disqualifiers: [
      "Under $25M revenue",
      "Pure retail dealership with no ops mandate",
      "Already mid-flight with a Big-4 consultancy",
      "OEM giant (>$200M / enterprise procurement)",
    ],
    anchors: [
      { name: "Magna International", domain: "magna.com" },
      { name: "Linamar", domain: "linamar.com" },
      { name: "Martinrea International", domain: "martinrea.com" },
      { name: "Multimatic", domain: "multimatic.com" },
    ],
  },
  {
    id: "seg-motorsport",
    name: "Motorsport",
    priority: 30,
    description:
      "Racing teams, performance engineering shops, and motorsport suppliers seeking data, simulation, and operational edge.",
    industries: [
      "Motorsport",
      "Racing Teams",
      "Performance Engineering",
      "Simulation & Telemetry",
      "Specialty Vehicle",
    ],
    employeeMin: 50,
    employeeMax: 1000,
    personas: [
      { department: "Executive", seniority: "C-Suite" },
      { department: "Engineering", seniority: "Director" },
      { department: "Engineering", seniority: "Head" },
      { department: "Operations", seniority: "Head" },
      { department: "Sales", seniority: "Director" },
    ],
    buyingSignals: [
      "New series entry or expansion",
      "Major sponsor signing",
      "Simulation / data infrastructure build",
      "Cost-cap compliance pressure",
      "New technical partnership",
    ],
    disqualifiers: [
      "Hobbyist / amateur teams",
      "Under $25M revenue",
      "No in-house engineering function",
    ],
    anchors: [
      { name: "Multimatic Motorsports", domain: "multimatic.com" },
      { name: "Pratt Miller", domain: "prattmiller.com" },
      { name: "Dallara", domain: "dallara.it" },
      { name: "Reynard", domain: "reynard.com" },
    ],
  },
  {
    id: "seg-engineering",
    name: "Engineering",
    priority: 20,
    description:
      "Mid-market engineering, design, and industrial product firms looking to digitize workflows and scale delivery.",
    industries: [
      "Engineering Services",
      "Product Design",
      "Industrial Equipment",
      "Robotics & Automation",
      "Aerospace & Defense",
    ],
    employeeMin: 75,
    employeeMax: 1500,
    personas: [
      { department: "Engineering", seniority: "VP" },
      { department: "Engineering", seniority: "C-Suite" },
      { department: "Product", seniority: "Director" },
      { department: "Engineering", seniority: "Head" },
      { department: "Operations", seniority: "Director" },
    ],
    buyingSignals: [
      "PLM / CAD modernization",
      "New product line launch",
      "Scaling engineering headcount",
      "Automation or robotics investment",
      "Recent acquisition or merger",
    ],
    disqualifiers: [
      "Under $25M revenue",
      "Solo / boutique consultancy (<75 staff)",
      "Government-only contractor with closed procurement",
    ],
    anchors: [
      { name: "ATS Corporation", domain: "atsautomation.com" },
      { name: "Hatch", domain: "hatch.com" },
      { name: "Stantec", domain: "stantec.com" },
      { name: "Celestica", domain: "celestica.com" },
    ],
  },
  {
    id: "seg-construction",
    name: "Construction",
    priority: 10,
    description:
      "Mid-market construction, infrastructure, and building-products firms modernizing project delivery and back-office data.",
    industries: ["Construction", "Infrastructure", "Building Products", "Heavy Civil", "Construction Tech"],
    employeeMin: 100,
    employeeMax: 3000,
    personas: [
      { department: "Executive", seniority: "C-Suite" },
      { department: "Operations", seniority: "VP" },
      { department: "Operations", seniority: "Director" },
      { department: "IT", seniority: "VP" },
      { department: "Finance", seniority: "C-Suite" },
    ],
    buyingSignals: [
      "New project management / ERP system",
      "Major project win or backlog growth",
      "Labor productivity initiative",
      "PE or family-succession transition",
      "Prefab / modular investment",
    ],
    disqualifiers: [
      "Under $25M revenue",
      "Residential trades / small GC",
      "Single-project special-purpose entity",
    ],
    anchors: [
      { name: "EllisDon", domain: "ellisdon.com" },
      { name: "PCL Construction", domain: "pcl.com" },
      { name: "Aecon", domain: "aecon.com" },
      { name: "Bird Construction", domain: "bird.ca" },
    ],
  },
];

async function main() {
  for (const s of SEGMENTS) {
    const data = {
      name: s.name,
      description: s.description,
      active: true,
      priority: s.priority,
      industries: s.industries,
      revenueMin: REVENUE_MIN,
      revenueMax: REVENUE_MAX,
      employeeMin: s.employeeMin,
      employeeMax: s.employeeMax,
      geographies: GEOGRAPHIES,
      priorityLocation: PRIORITY_LOCATION,
      buyingSignals: s.buyingSignals,
      disqualifiers: s.disqualifiers,
      searchSpec: undefined,
      personas: s.personas,
      anchors: s.anchors,
    };
    await prisma.targetSegment.upsert({
      where: { id: s.id },
      update: data,
      create: { id: s.id, ...data },
    });
    console.log(`  upserted ${s.id} — ${s.name}`);
  }

  const count = await prisma.targetSegment.count();
  console.log(`Done. ${SEGMENTS.length} starter segments upserted; ${count} total in DB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
