// Phase 0 pre-rebuild financial snapshot — PURE assembly. No Prisma, no Drive,
// no auth, no clock: the caller passes the already-queried rows and the snapshot
// instant, this returns the full-fidelity JSON, one CSV per table, and a
// verification summary (table -> row count + dollar total) for sign-off.
//
// The frozen computed block reuses the EXACT production economics path
// (economicsTotals + allocateLaborRevenue / buyoutAllocation, ledgerTotals,
// firmCommissionTotals), so the frozen figures equal what the live Financials
// surfaces show today. Phase 4's parity gate asserts the rebuilt commission calc
// against these frozen values, so faithfulness here is the entire purpose: every
// number is computed by the same code the app already trusts.

import {
  economicsTotals,
  allocateLaborRevenue,
  buyoutAllocation,
  type LaborAllocation,
} from "@/lib/billing/economics";
import {
  firmCommissionTotals,
  partnerCommissionEarnings,
  partnerOriginationEarnings,
  effectiveAccrualStatus,
} from "@/lib/billing/commissions";
import { ledgerTotals, type LedgerEntry, type LedgerTotals } from "@/lib/finance-ledger";
import { FX_RATES } from "@/lib/finance";
import type { CommissionAccrualStatus } from "@/lib/generated/prisma/enums";

// ── Inputs ───────────────────────────────────────────────────────────────
// Numeric-ish columns arrive as Prisma Decimal (hours / pct / share) or plain
// Int. `Num` covers both; toNum() coerces exactly as the live pages do.
type Num = number | string | { toString(): string };

export type SnapshotProjectInput = {
  id: string;
  name: string;
  projectType: string | null;
  budgetFee: number;
  originationPct: Num;
  isFirstContract: boolean;
  client: { company: string } | null;
  economicsLines: { hours: Num; payRateCents: number; billRateCents: number; isExtra: boolean }[];
  directCosts: { amount: number }[];
  invoices: { amount: number; status: string }[];
  originations: { partnerId: string; sharePct: Num }[];
};

export type SnapshotBuildRow = { buildAmount: number; partnerId: string | null; externalName: string | null };
export type SnapshotAccrualRollupRow = {
  amount: number;
  status: CommissionAccrualStatus;
  periodStart: Date;
  partnerId: string | null;
  externalName: string | null;
};
export type SnapshotAccrualEffectiveRow = {
  id: string;
  commissionId: string;
  periodIndex: number;
  status: CommissionAccrualStatus;
  periodStart: Date;
  amount: number;
};

// Raw tables: each value is the table's rows dumped verbatim. Typed as unknown[]
// so any Prisma model array assigns without an index-signature fight; rows are
// narrowed to records internally for CSV + dollar-total extraction.
export type RawTables = Record<string, readonly unknown[]>;

export type SnapshotInput = {
  takenAt: Date;
  takenBy: string;
  raw: RawTables;
  projectsForCalc: SnapshotProjectInput[];
  buildRows: SnapshotBuildRow[];
  accrualRollupRows: SnapshotAccrualRollupRow[];
  accrualsEffective: SnapshotAccrualEffectiveRow[];
  ledgerEntries: LedgerEntry[] | null;
};

// ── Outputs ──────────────────────────────────────────────────────────────
export type SnapshotTableSummary = { table: string; key: string; rows: number; dollarTotal: number | null };
export type SnapshotSummary = {
  takenAt: string;
  takenBy: string;
  tables: SnapshotTableSummary[];
  firmWide: LedgerTotals | null;
  commission: ReturnType<typeof firmCommissionTotals>;
  fx: { rates: Record<string, number>; asOf: string; source: string };
};
export type SnapshotResult = {
  snapshotJson: Record<string, unknown>;
  json: string; // serialized snapshot.json content
  csvs: { name: string; content: string }[];
  summary: SnapshotSummary;
};

// ── Coercion + serialization helpers ───────────────────────────────────────
const toNum = (v: unknown): number => {
  const x = typeof v === "number" ? v : v == null ? 0 : Number(v as never);
  return Number.isFinite(x) ? x : 0;
};

// JSON-safe a single value: Date -> ISO, bigint -> string, Prisma Decimal
// (duck-typed by toFixed) -> string. Arrays / plain objects pass through.
function norm(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function") {
    return (v as { toString(): string }).toString();
  }
  return v;
}

// Replacer for the whole-snapshot JSON.stringify (Date is already handled by its
// own toJSON; this catches bigint + Decimal anywhere in the raw dump).
const jsonReplacer = (_k: string, v: unknown): unknown => {
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && v !== null && typeof (v as { toFixed?: unknown }).toFixed === "function") {
    return (v as { toString(): string }).toString();
  }
  return v;
};

function csvCell(v: unknown): string {
  const nv = norm(v);
  const s = nv == null ? "" : typeof nv === "object" ? JSON.stringify(nv) : String(nv);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Generic CSV over an array of records. Header = the union of keys in first-seen
// order, so a row with a null column still lines up under the right header.
function toCsv(rows: readonly unknown[]): string {
  if (rows.length === 0) return "";
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r && typeof r === "object") {
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
        }
      }
    }
  }
  const lines = [keys.map(csvCell).join(",")];
  for (const r of rows) {
    const rec = (r ?? {}) as Record<string, unknown>;
    lines.push(keys.map((k) => csvCell(rec[k])).join(","));
  }
  return lines.join("\n");
}

// Per-table dollar total: the table's natural money column. null where a table
// has no single amount (rate/share/pct-only); those report a row count alone.
const AMOUNT_OF: Record<string, ((r: Record<string, unknown>) => number) | null> = {
  invoices: (r) => toNum(r.total) || toNum(r.amount),
  bills: (r) => toNum(r.total) || toNum(r.amount),
  expenses: (r) => toNum(r.total) || toNum(r.amount),
  payouts: (r) => toNum(r.amount),
  installments: (r) => toNum(r.amount),
  economicsLines: (r) => Math.round((toNum(r.hours) * toNum(r.billRateCents)) / 100), // billable
  directCosts: (r) => toNum(r.amount),
  originations: null,
  dealSourceCommissions: null,
  projectSourceCommissions: (r) => toNum(r.buildAmount),
  ongoingCommissions: (r) => toNum(r.projectedAmount),
  accruals: (r) => toNum(r.amount),
  serviceContracts: (r) => toNum(r.monthlyFee), // sum of monthly fees (MRR), not contract value
  estimates: (r) => toNum(r.totalValue),
  estimateLines: (r) => Math.round((toNum(r.hours) * toNum(r.billRateCents)) / 100), // billable
  rateTiers: null,
  deals: (r) => toNum(r.valueEstimate),
};

const TABLE_LABELS: Record<string, string> = {
  invoices: "Invoices (AR)",
  bills: "Bills (AP)",
  expenses: "Expenses",
  payouts: "Consultant payouts",
  installments: "Billing installments",
  economicsLines: "Economics lines (billable)",
  directCosts: "Direct costs",
  originations: "Origination shares",
  dealSourceCommissions: "Deal-source commissions",
  projectSourceCommissions: "Project-source commissions (build)",
  ongoingCommissions: "Ongoing-contract commissions",
  accruals: "Commission accruals",
  serviceContracts: "Service contracts (MRR)",
  estimates: "Estimates",
  estimateLines: "Estimate lines (billable)",
  rateTiers: "Rate tiers (reference)",
  deals: "Deals (money projection)",
};

// ── The build ──────────────────────────────────────────────────────────────
export function buildSnapshot(input: SnapshotInput): SnapshotResult {
  const { takenAt, takenBy, raw, projectsForCalc, buildRows, accrualRollupRows, accrualsEffective, ledgerEntries } = input;

  // Per-project allocation — the frozen OLD economics, computed by the exact path
  // app/(app)/financials/page.tsx uses. firmReserve here is the value Phase 4's
  // parity gate compares against firmReserveBeforeSource.
  const perProject = projectsForCalc.map((p) => {
    const totals = economicsTotals(
      p.economicsLines.map((l) => ({
        hours: toNum(l.hours),
        payRateCents: l.payRateCents,
        billRateCents: l.billRateCents,
        isExtra: l.isExtra,
      })),
    );
    const directCosts = p.directCosts.reduce((s, c) => s + c.amount, 0);
    const isBuyout = p.projectType === "buyout";
    const alloc: LaborAllocation = isBuyout
      ? buyoutAllocation(p.budgetFee)
      : allocateLaborRevenue({
          laborBillable: totals.billableTotal,
          takeHome: totals.costTotal,
          directCosts,
          originationPct: toNum(p.originationPct) / 100,
          isFirstContract: p.isFirstContract,
        });
    const invoiced = p.invoices.filter((i) => i.status !== "draft").reduce((s, i) => s + i.amount, 0);
    const received = p.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    return {
      projectId: p.id,
      name: p.name,
      company: p.client?.company ?? null,
      projectType: p.projectType,
      isBuyout,
      budgetFee: p.budgetFee,
      laborBillable: alloc.laborBillable,
      takeHome: alloc.takeHome,
      directCosts: alloc.directCosts,
      origination: alloc.origination,
      firmPool: alloc.firmPool,
      laborBudget: alloc.laborBudget,
      laborSurplus: alloc.laborSurplus,
      firmReserve: alloc.firmReserve,
      clientPrice: alloc.clientPrice,
      isFirstContract: alloc.isFirstContract,
      originationPct: alloc.originationPct,
      marginPct: isBuyout ? (p.budgetFee > 0 ? 1 : 0) : totals.marginPct,
      invoiced,
      received,
    };
  });

  // Firm-wide deduped spine (the GL tab's source). Null only pre-migration.
  const firmWide: LedgerTotals | null = ledgerEntries ? ledgerTotals(ledgerEntries) : null;

  // Commission, frozen at takenAt (build slice + recurring bucketed by EFFECTIVE
  // accrual status, so the lazy projected->accrued flip is captured as-of now).
  const firmCommission = firmCommissionTotals(buildRows, accrualRollupRows, takenAt);
  const perPartnerCommission = [...partnerCommissionEarnings(buildRows, accrualRollupRows, takenAt).entries()].map(
    ([partnerId, v]) => ({ partnerId, ...v }),
  );
  const perPartnerOrigination = [
    ...partnerOriginationEarnings(
      projectsForCalc.map((p, i) => ({
        alloc: { origination: perProject[i].origination },
        originations: p.originations.map((o) => ({ partnerId: o.partnerId, sharePct: toNum(o.sharePct) })),
      })),
    ).entries(),
  ].map(([partnerId, origination]) => ({ partnerId, origination }));

  // Accrual paid-state, frozen both ways: the raw `status` column AND the
  // effective status as-of takenAt. The raw column lazily lags (a started-but-
  // unpaid period reads "projected"); freezing both de-risks the Phase 3 backfill.
  const accrualsEffectiveOut = accrualsEffective.map((a) => ({
    id: a.id,
    commissionId: a.commissionId,
    periodIndex: a.periodIndex,
    periodStart: a.periodStart.toISOString(),
    amount: a.amount,
    rawStatus: a.status,
    effectiveStatus: effectiveAccrualStatus(a.status, a.periodStart, takenAt),
  }));

  const computed = {
    perProject,
    firmWide,
    commission: { firm: firmCommission, perPartnerCommission, perPartnerOrigination },
    accrualsEffective: accrualsEffectiveOut,
    fx: { rates: FX_RATES, asOf: takenAt.toISOString(), source: "lib/finance.ts FX_RATES (hard-coded constant)" },
  };

  // Per-table summary (rows + dollar total).
  const tables: SnapshotTableSummary[] = Object.keys(raw).map((key) => {
    const rows = raw[key];
    const ex = AMOUNT_OF[key];
    const dollarTotal = ex ? rows.reduce((s: number, r) => s + ex(r as Record<string, unknown>), 0) : null;
    return { table: TABLE_LABELS[key] ?? key, key, rows: rows.length, dollarTotal };
  });

  const meta = {
    takenAt: takenAt.toISOString(),
    takenBy,
    projectCount: perProject.length,
    tables,
  };

  const snapshotJson = { meta, raw, computed };
  const json = JSON.stringify(snapshotJson, jsonReplacer, 2);

  const csvs = Object.keys(raw).map((key) => ({ name: `${key}.csv`, content: toCsv(raw[key]) }));
  csvs.push({ name: "computed-per-project.csv", content: toCsv(perProject as unknown[]) });

  const summary: SnapshotSummary = {
    takenAt: meta.takenAt,
    takenBy,
    tables,
    firmWide,
    commission: firmCommission,
    fx: computed.fx,
  };

  return { snapshotJson, json, csvs, summary };
}
