// Pure finance helpers (firm AP/AR + Expenses). Client-safe: labels, the CRA
// mileage rate, Drive file-naming protocol, and aging buckets. NO Prisma / Drive
// / fs imports so both server actions and client components can use it.
//
// The Drive folder tree + upload/move live in lib/firm-finance-drive.ts (server).

import type {
  BillStatus,
  BillSource,
  ExpenseKind,
  ExpenseStatus,
  ExpenseCategory,
} from "@/lib/types";

// ── Display labels ───────────────────────────────────────────────────────

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  travel_accommodation: "Travel · Accommodation",
  travel_flights: "Travel · Flights",
  travel_meals: "Travel · Meals",
  bd_events: "Business Development · Events",
  bd_meals: "Business Development · Meals",
  bd_other: "Business Development · Other",
  fuel_mileage: "Fuel / Mileage",
  subscription_software: "Subscription · Software",
  subscription_phone: "Subscription · Phone",
  subscription_office: "Subscription · Office",
  subscription_other: "Subscription · Other",
  office_supplies: "Office Supplies",
  professional_fees: "Professional Fees",
  other: "Other",
};

// Categories in display order, grouped — for the upload-modal picker.
export const EXPENSE_CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] =
  (Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((value) => ({
    value,
    label: EXPENSE_CATEGORY_LABELS[value],
  }));

export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  received: "Received",
  approved: "Approved",
  paid: "Paid",
  void: "Void",
};

export const BILL_SOURCE_LABELS: Record<BillSource, string> = {
  manual: "Entered manually",
  gmail_ingest: "From email",
};

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  reimbursable: "Reimbursable",
  firm_paid: "Firm-paid",
  subscription: "Subscription",
};

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  reimbursed: "Reimbursed",
  paid: "Paid",
};

// ── Foreign exchange (rough) ───────────────────────────────────────────────
// The firm books in CAD. Foreign invoices (mostly USD SaaS) convert at a ROUGH
// fixed rate at file time; the original amount + rate are stored on the row
// (origAmount/origCurrency/fxRate) so amount/total stay CAD without losing the
// source. Swap FX_RATES for a live feed later; until then bump these by hand.
export const FX_RATES: Record<string, number> = { USD: 1.37 };

export type Converted = {
  cad: number; // whole CAD
  origAmount: number | null; // original figure (whole units of origCurrency)
  origCurrency: string | null; // e.g. "USD"; null when already CAD
  fxRate: number | null; // rate applied (origCurrency → CAD); null when CAD / unknown
};

/** Convert a foreign amount to whole CAD. CAD passes through with no FX metadata.
 *  An unknown currency is stored as-is (no guess) but its currency is recorded so
 *  the figure is visibly unconverted. */
export function convertToCad(amount: number, currency?: string | null): Converted {
  const cur = (currency ?? "CAD").trim().toUpperCase();
  if (!cur || cur === "CAD") return { cad: Math.round(amount), origAmount: null, origCurrency: null, fxRate: null };
  const rate = FX_RATES[cur];
  if (!rate) return { cad: Math.round(amount), origAmount: Math.round(amount), origCurrency: cur, fxRate: null };
  return { cad: Math.round(amount * rate), origAmount: Math.round(amount), origCurrency: cur, fxRate: rate };
}

/** Short source-currency tag for display, e.g. "USD 112". Empty when no conversion. */
export function fxNote(origAmount?: number | null, origCurrency?: string | null): string {
  return origCurrency && origAmount != null ? `${origCurrency} ${origAmount}` : "";
}

// ── Drive folder routing ─────────────────────────────────────────────────
// Each expense category files under one of the five Expenses subfolders.

export const EXPENSE_FOLDERS = [
  "Travel",
  "Meals",
  "Business-Development",
  "Subscriptions",
  "Other",
] as const;
export type ExpenseFolder = (typeof EXPENSE_FOLDERS)[number];

export const CATEGORY_TO_FOLDER: Record<ExpenseCategory, ExpenseFolder> = {
  travel_accommodation: "Travel",
  travel_flights: "Travel",
  travel_meals: "Meals",
  bd_events: "Business-Development",
  bd_meals: "Meals",
  bd_other: "Business-Development",
  fuel_mileage: "Travel",
  subscription_software: "Subscriptions",
  subscription_phone: "Subscriptions",
  subscription_office: "Subscriptions",
  subscription_other: "Subscriptions",
  office_supplies: "Other",
  professional_fees: "Other",
  other: "Other",
};

// ── CRA mileage (2026) ───────────────────────────────────────────────────
// 73¢/km for the first 5,000 business km in the year, 67¢/km after. We snapshot
// the rate on the Expense at entry; tiering by cumulative km is a Phase-3 refine.

export const CRA_MILEAGE_2026 = {
  firstTierCentsPerKm: 73,
  afterTierCentsPerKm: 67,
  tierThresholdKm: 5000,
};

export function craMileageRateCents(cumulativeKm = 0): number {
  return cumulativeKm >= CRA_MILEAGE_2026.tierThresholdKm
    ? CRA_MILEAGE_2026.afterTierCentsPerKm
    : CRA_MILEAGE_2026.firstTierCentsPerKm;
}

/** Mileage reimbursement in whole CAD (the app's money unit) for `km` at `rateCents`/km. */
export function mileageAmountCad(km: number, rateCents: number): number {
  return Math.round((km * rateCents) / 100);
}

// ── File-naming protocol ─────────────────────────────────────────────────
// ISO-date-first → lexicographic sort == chronological. `_` separates fields,
// `-` joins multi-word names. Amount carries an explicit CAD suffix.

/** YYYY-MM-DD from a Date or ISO string. */
export function isoDateName(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/** Filename-safe slug: alphanumerics + single hyphens, capped length. */
export function nameSlug(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "x"
  );
}

/** Unpaid AP bill — e.g. `2026-06-15_AP_Stripe_INV-0045_1250CAD.pdf`. */
export function apBillFileName(input: {
  issuedAt?: string | Date | null;
  vendor: string;
  number?: string | null;
  amount: number;
  ext?: string;
}): string {
  const date = isoDateName(input.issuedAt ?? new Date());
  const parts = ["AP", nameSlug(input.vendor)];
  if (input.number) parts.push(nameSlug(input.number));
  parts.push(`${input.amount}CAD`);
  return `${date}_${parts.join("_")}.${input.ext ?? "pdf"}`;
}

/** Expense receipt — e.g. `2026-06-15_EXP_Travel-Flights_Air-Canada_425CAD_Jason.jpg`. */
export function expenseFileName(input: {
  spentAt: string | Date;
  category: ExpenseCategory;
  vendor?: string | null;
  amount: number;
  partner?: string | null;
  ext?: string;
}): string {
  const date = isoDateName(input.spentAt);
  const parts = ["EXP", nameSlug(EXPENSE_CATEGORY_LABELS[input.category])];
  if (input.vendor) parts.push(nameSlug(input.vendor));
  parts.push(`${input.amount}CAD`);
  if (input.partner) parts.push(nameSlug(input.partner));
  return `${date}_${parts.join("_")}.${input.ext ?? "jpg"}`;
}

/** Append `_PAID-<date>` before the extension. Idempotent. */
export function paidRename(currentName: string, paidAt: string | Date): string {
  if (currentName.includes("_PAID-")) return currentName;
  const date = isoDateName(paidAt);
  const dot = currentName.lastIndexOf(".");
  if (dot === -1) return `${currentName}_PAID-${date}`;
  return `${currentName.slice(0, dot)}_PAID-${date}${currentName.slice(dot)}`;
}

// ── Aging buckets ────────────────────────────────────────────────────────

export type AgingBucket = "current" | "d30" | "d60" | "d90";

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  d30: "1–30d",
  d60: "31–60d",
  d90: "60d+",
};

export function agingBucket(
  dueAt?: string | Date | null,
  now: Date = new Date(),
): AgingBucket {
  if (!dueAt) return "current";
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  return "d90";
}
