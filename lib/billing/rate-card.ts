// The firm's standard rate card — the canonical tier definitions (Phase 1).
//
// These seed the RateTier table and act as the in-code fallback. Rates are in
// CENTS/hr. billRate = what the client is charged; payRate = take-home. The
// four tiers are the firm doctrine (firm-economics.md §2):
//
//   Managing Partner      $450 / $337.50   (25% margin)
//   Senior Consultant     $400 / $240      (40%)
//   Intermediate          $325 / $195      (40%)
//   Junior                $250 / $150      (40%)
//
// "Developer" is NOT a tier — a developer line is slotted at one of the four
// tiers' rates, so it's a role label, not a rate row.
//
// No pure helper here divides by 0.75 or multiplies by 1.333: the firm-pool /
// origination split lives INSIDE the bill rate already (see economics.ts).

export type TierKey = "mp" | "senior" | "intermediate" | "junior";

export type RateTierSeed = {
  key: TierKey;
  name: string;
  billRateCents: number;
  payRateCents: number;
  sortOrder: number;
};

export const RATE_CARD: RateTierSeed[] = [
  { key: "mp", name: "Managing Partner", billRateCents: 45000, payRateCents: 33750, sortOrder: 0 },
  { key: "senior", name: "Senior Consultant", billRateCents: 40000, payRateCents: 24000, sortOrder: 1 },
  { key: "intermediate", name: "Intermediate Consultant", billRateCents: 32500, payRateCents: 19500, sortOrder: 2 },
  { key: "junior", name: "Junior Consultant", billRateCents: 25000, payRateCents: 15000, sortOrder: 3 },
];

// Fallback billable rate when a line has no tier and no explicit rate — the
// Senior tier ($400/hr). Replaces the old $200 placeholder.
export const FALLBACK_BILL_RATE_CENTS = 40000;
