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

type SeedSegment = {
  id: string;
  name: string;
  priority: number;
  description: string;
  industries: string[];
  employeeMin: number;
  employeeMax: number;
  buyerPersonas: string[];
  buyingSignals: string[];
  disqualifiers: string[];
  anchorCompanies: string[];
};

// Shared across all four (editable in the UI).
const REVENUE_MIN = 25_000_000;
const REVENUE_MAX = 200_000_000;
const GEOGRAPHIES = ["Ontario", "Canada"];

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
    buyerPersonas: [
      "VP Operations",
      "COO",
      "Director of Manufacturing",
      "VP Digital / IT",
      "Head of Supply Chain",
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
    anchorCompanies: ["Magna International", "Linamar", "Martinrea International", "Multimatic"],
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
    buyerPersonas: [
      "Team Principal",
      "Technical Director",
      "Head of Performance",
      "Head of Race Engineering",
      "Commercial Director",
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
    anchorCompanies: ["Multimatic Motorsports", "Pratt Miller", "Dallara", "Reynard"],
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
    buyerPersonas: [
      "VP Engineering",
      "CTO",
      "Director of Product Development",
      "Head of R&D",
      "Operations Director",
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
    anchorCompanies: ["ATS Corporation", "Hatch", "Stantec", "Celestica"],
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
    buyerPersonas: [
      "COO",
      "VP Operations",
      "Director of Project Controls",
      "VP Technology",
      "CFO",
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
    anchorCompanies: ["EllisDon", "PCL Construction", "Aecon", "Bird Construction"],
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
      buyerPersonas: s.buyerPersonas,
      buyingSignals: s.buyingSignals,
      disqualifiers: s.disqualifiers,
      searchSpec: undefined,
      anchorCompanies: s.anchorCompanies,
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
