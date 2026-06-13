// Industries — single source of truth for the firm's vertical taxonomy.
//
// Two tiers:
//   Tier-1 = the `Industry` enum (a vertical). Ordered primary-beachhead-first
//            so pickers and filters lead with where the firm actually sells.
//   Tier-2 = `subIndustry`, a controlled-vocabulary STRING (not an enum) stored
//            on the existing subIndustry field. One value per record.
//
// Everything that needs the vertical list, its labels, the beachhead ranking,
// or the Tier-2 vocabulary reads from here. lib/data/seed.ts re-exports
// industryLabels from this module for back-compat with older imports.

import type { Industry } from "@/lib/types";

// ── Tier-1 verticals ──────────────────────────────────────────────────────
// Ordered: the ten primary beachheads first (in the firm's stated priority),
// then the three secondary verticals, then Other last.
export const INDUSTRY_VERTICALS: Industry[] = [
  "automotive",
  "motorsport",
  "engineering",
  "construction",
  "architecture",
  "heavy_equipment",
  "distribution",
  "logistics",
  "professional_services",
  "beverage",
  "real_estate",
  "manufacturing",
  "healthcare",
  "other",
];

export const industryLabels: Record<Industry, string> = {
  automotive: "Automotive",
  motorsport: "Motorsport",
  engineering: "Engineering",
  construction: "Construction",
  architecture: "Architecture",
  real_estate: "Real Estate & Property",
  manufacturing: "Manufacturing",
  heavy_equipment: "Heavy Equipment & Machinery",
  distribution: "Distribution & Wholesale",
  logistics: "Logistics & Transportation",
  professional_services: "Professional Services",
  healthcare: "Healthcare & Medical",
  beverage: "Wineries & Beverage",
  other: "Other",
};

// ── Beachhead ranking ─────────────────────────────────────────────────────
// Primary = where the firm leads; secondary = adjacent expansion. Other is
// neither (a catch-all) and sorts last via INDUSTRY_VERTICALS order.
export type VerticalTier = "primary" | "secondary";

export const verticalTier: Record<Industry, VerticalTier | null> = {
  automotive: "primary",
  motorsport: "primary",
  engineering: "primary",
  construction: "primary",
  architecture: "primary",
  heavy_equipment: "primary",
  distribution: "primary",
  logistics: "primary",
  professional_services: "primary",
  beverage: "primary",
  real_estate: "secondary",
  manufacturing: "secondary",
  healthcare: "secondary",
  other: null,
};

// ── Tier-2 sub-industries (controlled vocabulary) ─────────────────────────
// One list per vertical. `other` is intentionally free text — no constrained
// sub list. Values are the canonical strings stored on subIndustry; they are
// also their own labels (subIndustryLabels mirrors them for symmetry with
// industryLabels and a place to diverge later if needed).
export const subIndustriesByVertical: Record<Industry, string[]> = {
  automotive: [
    "OEM & Vehicle Mfg",
    "Parts & Suppliers (Tier 1/2)",
    "Dealership Groups",
    "EV & Mobility",
    "Aftermarket & Performance",
    "Fleet & Vehicle Services",
  ],
  motorsport: [
    "Racing Teams",
    "Performance Engineering",
    "Simulation & Telemetry",
    "Specialty & Custom Vehicle",
    "Track & Event Operations",
  ],
  engineering: [
    "Engineering Services (civil/structural/mech)",
    "Product Design & Development",
    "Robotics & Automation",
    "Aerospace & Defense",
    "Environmental & Surveying",
    "Industrial Equipment",
  ],
  construction: [
    "General Contracting",
    "Heavy Civil & Infrastructure",
    "Building Products & Materials",
    "Specialty Trades",
    "Construction Technology",
    "Capital-Project Mgmt",
  ],
  architecture: [
    "Architecture Firms",
    "Interior Design",
    "Urban Planning",
    "Landscape Architecture",
    "BIM & Design Tech",
  ],
  real_estate: [
    "Commercial RE",
    "Residential Development",
    "Property Management",
    "REITs & Investment",
    "Facilities Management",
  ],
  manufacturing: [
    "Industrial & Process Mfg",
    "Metals & Fabrication",
    "Plastics & Composites",
    "Electronics & Electrical",
    "Consumer Goods",
    "Technology Hardware",
  ],
  heavy_equipment: [
    "Equipment OEM",
    "Dealers",
    "Rental",
    "Agricultural Machinery",
    "Construction Machinery",
    "Parts & Service",
  ],
  distribution: [
    "Industrial Distribution",
    "Building-Products Distribution",
    "Auto-Parts Distribution",
    "Food & Beverage Distribution",
    "Petroleum & Fuel Distribution",
    "Wholesale Trade",
  ],
  logistics: [
    "Freight & Trucking",
    "3PL & Warehousing",
    "Fleet Operations",
    "Supply Chain",
    "Marine & Rail",
    "Last-Mile",
  ],
  professional_services: [
    "Legal Services",
    "Financial Services & Investment",
    "Insurance",
    "Accounting & Advisory",
    "Management Consulting",
    "Marketing & Creative",
  ],
  healthcare: [
    "Medical Practices & Clinics",
    "Dental Groups",
    "Veterinary",
    "Medical Devices",
    "Long-Term Care",
    "Pharma & Life Sciences",
    "Health Tech",
  ],
  beverage: [
    "Wineries",
    "Breweries & Distilleries",
    "Beverage Production",
    "Vineyards & Agriculture",
    "Hospitality & Tasting Rooms",
    "Food Production",
  ],
  other: [], // free text — no constrained sub list
};

// Sub-industry → label. The vocabulary doubles as its own display label, so
// this is a flat passthrough built from the lists above. A place to diverge
// (e.g. shorter chips) later without touching call sites.
export const subIndustryLabels: Record<string, string> = Object.fromEntries(
  Object.values(subIndustriesByVertical)
    .flat()
    .map((s) => [s, s]),
);

// ── Validators ────────────────────────────────────────────────────────────

/** True when `value` is a known Tier-1 vertical enum identifier. */
export function validateIndustry(value: unknown): value is Industry {
  return typeof value === "string" && (INDUSTRY_VERTICALS as string[]).includes(value);
}

/**
 * True when `value` is a valid Tier-2 sub-industry for the given vertical.
 * `other` has no constrained list, so any non-empty string is accepted there.
 * An empty / unset value is always valid (the field is optional).
 */
export function validateSubIndustry(vertical: unknown, value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string") return false;
  if (!validateIndustry(vertical)) return false;
  if (vertical === "other") return value.trim().length > 0;
  return subIndustriesByVertical[vertical].includes(value);
}
