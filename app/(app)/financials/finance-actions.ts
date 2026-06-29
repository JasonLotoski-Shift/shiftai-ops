"use server";

// Firm AP/AR + Expenses mutations. Money OUT: vendor bills (AP) + team
// receipts / subscriptions. Money IN stays on Invoice (see invoices/[id]/actions).
//
// Every action: requireManagingPartner() (the whole section is MP-gated), then
// file any uploaded doc to Drive OUTSIDE the tx (best-effort — a Drive hiccup
// never blocks the row), then write the row + an Artifact (when a doc exists) +
// writeAudit + writeActivity in ONE transaction. Canonical recipe: CLAUDE.md.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor, type Actor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";
import { generate } from "@/lib/ai";
import { fileBillDoc, fileReceiptDoc, moveBillToPaid } from "@/lib/firm-finance-drive";
import {
  apBillFileName,
  expenseFileName,
  paidRename,
  craMileageRateCents,
  mileageAmountCad,
  convertToCad,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/finance";
import { formatCAD } from "@/lib/format";
import { loadLedgerEntries } from "@/app/(app)/financials/ledger-data";
import { LEDGER_TYPE_LABELS } from "@/lib/finance-ledger";
import type { ExpenseCategory, ExpenseKind, MileageUnit } from "@/lib/types";

export type FinanceFile = { base64: string; mimeType: string; fileName: string };

async function getActor(): Promise<{ actor: Actor; label: string; partnerId: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { actor: partnerActor(session.user.partnerId, label), label, partnerId: session.user.partnerId };
}

// ── small pure helpers ────────────────────────────────────────────────────

function withGst(amount: number, gstBps = 0): number {
  return amount + Math.round((amount * gstBps) / 10_000);
}

function yearOf(d?: string | Date | null): number {
  if (!d) return new Date().getFullYear();
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function dateOrNull(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extFor(mimeType: string, fileName?: string): string {
  const fromName = fileName && fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "bin";
}

// ── AP bills ───────────────────────────────────────────────────────────────

export type CreateBillInput = {
  vendor: string;
  number?: string | null;
  description?: string | null;
  amount: number; // subtotal in `currency` (converted to CAD on save)
  currency?: string | null; // e.g. "USD"; default CAD
  gstBps?: number;
  category?: ExpenseCategory | null;
  issuedAt?: string | null;
  dueAt?: string | null;
  notes?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  file?: FinanceFile | null;
};

export async function createBill(input: CreateBillInput) {
  await requireManagingPartner();
  const { actor, label } = await getActor();

  const vendor = input.vendor.trim();
  if (!vendor) throw new Error("Vendor is required");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a valid amount");

  // Convert to CAD (books' currency); keep the source figure + rate on the row.
  const fx = convertToCad(input.amount, input.currency);
  const amount = fx.cad;
  const total = withGst(amount, input.gstBps ?? 0);

  // File the doc to Drive first (best-effort — never blocks the row).
  let driveFileId: string | null = null;
  let driveUrl: string | null = null;
  let fileName: string | null = null;
  if (input.file) {
    fileName = apBillFileName({
      issuedAt: input.issuedAt,
      vendor,
      number: input.number,
      amount,
      ext: extFor(input.file.mimeType, input.file.fileName),
    });
    try {
      const bytes = Buffer.from(input.file.base64, "base64");
      const res = await fileBillDoc({ bytes, fileName, year: yearOf(input.issuedAt), mimeType: input.file.mimeType });
      driveFileId = res.fileId;
      driveUrl = res.webViewLink;
    } catch {
      fileName = null; // upload failed — store no doc pointer
    }
  }

  const bill = await prisma.$transaction(async (tx) => {
    const created = await tx.bill.create({
      data: {
        vendor,
        number: input.number?.trim() || null,
        description: input.description?.trim() || null,
        amount,
        currency: "CAD",
        origAmount: fx.origAmount,
        origCurrency: fx.origCurrency,
        fxRate: fx.fxRate,
        gstBps: input.gstBps ?? 0,
        total,
        category: input.category ?? null,
        issuedAt: dateOrNull(input.issuedAt),
        dueAt: dateOrNull(input.dueAt),
        status: "received",
        source: "manual",
        notes: input.notes?.trim() || null,
        clientId: input.clientId || null,
        projectId: input.projectId || null,
        driveFileId,
        driveUrl,
        fileName,
        createdBy: label,
      },
    });
    if (driveUrl) {
      await tx.artifact.create({
        data: {
          type: "invoice",
          title: `AP bill — ${vendor}${input.number ? ` · ${input.number}` : ""}`,
          driveUrl,
          fileName,
          createdBy: label,
          reviewStatus: "approved",
          clientId: input.clientId || null,
          projectId: input.projectId || null,
        },
      });
    }
    await writeAudit(tx, {
      actor,
      action: "create.bill",
      targetType: "Bill",
      targetId: created.id,
      changes: { vendor, amount, total, dueAt: input.dueAt ?? null, hasDoc: !!driveUrl },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: vendor,
      detail: `Logged AP bill · ${formatCAD(total)}`,
      link: "/financials",
    });
    return created;
  });

  revalidatePath("/financials");
  return { id: bill.id };
}

export async function markBillPaid(billId: string, paidDate?: string | null) {
  await requireManagingPartner();
  const { actor } = await getActor();

  const before = await prisma.bill.findUnique({
    where: { id: billId },
    select: { status: true, vendor: true, total: true, issuedAt: true, driveFileId: true, fileName: true },
  });
  if (!before) throw new Error("Bill not found");
  if (before.status !== "received" && before.status !== "approved") {
    throw new Error(`Can't mark paid from "${before.status}" (must be received or approved)`);
  }

  const paidAt = paidDate ? new Date(paidDate) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Enter a valid paid date");

  // Re-file the Drive doc into AP-Bills/Paid + rename (best-effort).
  let newName = before.fileName;
  if (before.driveFileId && before.fileName) {
    newName = paidRename(before.fileName, paidAt);
    try {
      await moveBillToPaid({ fileId: before.driveFileId, newName, year: yearOf(before.issuedAt) });
    } catch {
      newName = before.fileName; // move failed — keep the old name on the row
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.bill.update({ where: { id: billId }, data: { status: "paid", paidAt, fileName: newName } });
    await writeAudit(tx, {
      actor,
      action: "update.bill.paid",
      targetType: "Bill",
      targetId: billId,
      changes: { status: { before: before.status, after: "paid" }, paidAt: paidAt.toISOString(), renamedTo: newName },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: before.vendor,
      detail: `Bill paid · ${formatCAD(before.total)}`,
      link: "/financials",
    });
  });

  revalidatePath("/financials");
  return { status: "paid" as const, paidAt };
}

// ── Expenses ─────────────────────────────────────────────────────────────

export type CreateExpenseInput = {
  kind: ExpenseKind;
  category: ExpenseCategory;
  vendor?: string | null;
  description?: string | null;
  amount: number; // in `currency` — ignored for mileage_km (computed from km)
  currency?: string | null; // e.g. "USD"; default CAD (converted on save)
  gstBps?: number;
  spentAt: string;
  mileageUnit?: MileageUnit | null;
  mileageKm?: number | null;
  paidById?: string | null; // partner who fronted it
  paidByConsultantId?: string | null; // OR a non-partner employee/contractor
  recurring?: boolean;
  renewalDate?: string | null;
  clientId?: string | null;
  projectId?: string | null;
  file?: FinanceFile | null;
};

export async function createExpense(input: CreateExpenseInput) {
  await requireManagingPartner();
  const { actor, label, partnerId } = await getActor();

  const spentAt = new Date(input.spentAt);
  if (Number.isNaN(spentAt.getTime())) throw new Error("Enter a valid date");

  // Mileage (km) computes its own amount from the CRA rate; everything else
  // uses the entered amount. Round km to 1 decimal (Decimal(7,1) parity) so the
  // stored km and the stored amount stay reconcilable.
  let amount = Math.round(input.amount);
  let mileageRateCents: number | null = null;
  let mileageKm: number | null = null;
  let fxOrigAmount: number | null = null;
  let fxOrigCurrency: string | null = null;
  let fxRate: number | null = null;
  const isMileageKm = input.category === "fuel_mileage" && input.mileageUnit === "km";
  if (isMileageKm) {
    const km = Math.round((input.mileageKm ?? 0) * 10) / 10;
    if (km <= 0) throw new Error("Enter the kilometres driven");
    mileageKm = km;
    mileageRateCents = craMileageRateCents();
    amount = mileageAmountCad(km, mileageRateCents);
  } else {
    // Convert to CAD (mileage is already CAD); keep the source figure + rate.
    const fx = convertToCad(input.amount, input.currency);
    amount = fx.cad;
    fxOrigAmount = fx.origAmount;
    fxOrigCurrency = fx.origCurrency;
    fxRate = fx.fxRate;
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");

  const total = withGst(amount, input.gstBps ?? 0);

  // Who fronted a reimbursable expense — a partner OR a non-partner consultant
  // (exactly one). A partner defaults to the current user when neither is given.
  const paidByConsultantId = input.kind === "reimbursable" ? input.paidByConsultantId?.trim() || null : null;
  const paidById =
    input.kind === "reimbursable"
      ? paidByConsultantId
        ? null
        : input.paidById || partnerId
      : input.paidById || null;
  if (paidById && paidByConsultantId) throw new Error("Pick one payer, not both");
  const paidBy = paidById
    ? await prisma.partner.findUnique({ where: { id: paidById }, select: { name: true } })
    : null;
  if (paidById && !paidBy) throw new Error("Selected partner not found");
  const paidByCons = paidByConsultantId
    ? await prisma.consultant.findUnique({ where: { id: paidByConsultantId }, select: { name: true } })
    : null;
  if (paidByConsultantId && !paidByCons) throw new Error("Selected person not found");

  const needsPhoto = !input.file;

  let driveFileId: string | null = null;
  let driveUrl: string | null = null;
  let fileName: string | null = null;
  if (input.file) {
    fileName = expenseFileName({
      spentAt,
      category: input.category,
      vendor: input.vendor,
      amount,
      partner: paidByCons?.name ?? paidBy?.name ?? label,
      ext: extFor(input.file.mimeType, input.file.fileName),
    });
    try {
      const bytes = Buffer.from(input.file.base64, "base64");
      const res = await fileReceiptDoc({ bytes, fileName, year: yearOf(spentAt), category: input.category, mimeType: input.file.mimeType });
      driveFileId = res.fileId;
      driveUrl = res.webViewLink;
    } catch {
      fileName = null;
    }
  }

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        kind: input.kind,
        category: input.category,
        vendor: input.vendor?.trim() || null,
        description: input.description?.trim() || null,
        amount,
        currency: "CAD",
        origAmount: fxOrigAmount,
        origCurrency: fxOrigCurrency,
        fxRate,
        gstBps: input.gstBps ?? 0,
        total,
        spentAt,
        status: needsPhoto ? "draft" : "submitted",
        mileageUnit: input.category === "fuel_mileage" ? input.mileageUnit ?? null : null,
        mileageKm,
        mileageRateCents,
        paidById,
        paidByConsultantId,
        recurring: input.kind === "subscription" ? input.recurring ?? true : false,
        renewalDate: input.kind === "subscription" ? dateOrNull(input.renewalDate) : null,
        clientId: input.clientId || null,
        projectId: input.projectId || null,
        needsPhoto,
        driveFileId,
        driveUrl,
        fileName,
        createdBy: label,
      },
    });
    if (driveUrl) {
      await tx.artifact.create({
        data: {
          type: "other",
          title: `Receipt — ${input.vendor?.trim() || "expense"} · ${formatCAD(total)}`,
          driveUrl,
          fileName,
          createdBy: label,
          reviewStatus: "approved",
          clientId: input.clientId || null,
          projectId: input.projectId || null,
        },
      });
    }
    await writeAudit(tx, {
      actor,
      action: "create.expense",
      targetType: "Expense",
      targetId: created.id,
      changes: { category: input.category, kind: input.kind, amount, total, needsPhoto },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: input.vendor?.trim() || "Expense",
      detail: needsPhoto ? `Logged expense · ${formatCAD(total)} · needs photo` : `Logged expense · ${formatCAD(total)}`,
      link: "/financials",
    });
    return created;
  });

  revalidatePath("/financials");
  return { id: expense.id, needsPhoto };
}

export async function markExpenseReimbursed(expenseId: string, date?: string | null) {
  await requireManagingPartner();
  const { actor } = await getActor();
  const before = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { status: true, vendor: true, total: true },
  });
  if (!before) throw new Error("Expense not found");
  if (before.status === "reimbursed" || before.status === "paid") {
    throw new Error(`Already settled ("${before.status}")`);
  }
  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error("Enter a valid date");

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({ where: { id: expenseId }, data: { status: "reimbursed", reimbursedAt: when } });
    await writeAudit(tx, {
      actor,
      action: "update.expense.reimbursed",
      targetType: "Expense",
      targetId: expenseId,
      changes: { status: { before: before.status, after: "reimbursed" }, reimbursedAt: when.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: before.vendor ?? "Expense",
      detail: `Expense reimbursed · ${formatCAD(before.total)}`,
      link: "/financials",
    });
  });
  revalidatePath("/financials");
  return { status: "reimbursed" as const };
}

export async function markExpensePaid(expenseId: string, date?: string | null) {
  await requireManagingPartner();
  const { actor } = await getActor();
  const before = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: { status: true, vendor: true, total: true },
  });
  if (!before) throw new Error("Expense not found");
  if (before.status === "paid" || before.status === "reimbursed") {
    throw new Error(`Already settled ("${before.status}")`);
  }
  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error("Enter a valid date");

  await prisma.$transaction(async (tx) => {
    await tx.expense.update({ where: { id: expenseId }, data: { status: "paid", reimbursedAt: when } });
    await writeAudit(tx, {
      actor,
      action: "update.expense.paid",
      targetType: "Expense",
      targetId: expenseId,
      changes: { status: { before: before.status, after: "paid" }, paidAt: when.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: before.vendor ?? "Expense",
      detail: `Expense paid · ${formatCAD(before.total)}`,
      link: "/financials",
    });
  });
  revalidatePath("/financials");
  return { status: "paid" as const };
}

// ── Receipt / invoice scan (Phase 2) ───────────────────────────────────────
// Claude vision reads a photo of a receipt/invoice and proposes the fields the
// upload modal prefills. Read-only (no DB write) — the partner confirms/corrects
// before createBill/createExpense persists. MP-gated like the rest of the section.

export type ScanResult = {
  docType: "receipt" | "invoice" | null;
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  amount: number | null; // whole CAD (grand total)
  tax: number | null;
  currency: string | null;
  category: ExpenseCategory | null;
  invoiceNumber: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low" | null;
};

const EMPTY_SCAN: ScanResult = {
  docType: null, vendor: null, date: null, amount: null, tax: null,
  currency: null, category: null, invoiceNumber: null, description: null, confidence: null,
};

const SCAN_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const VALID_CATEGORIES = new Set<string>(Object.keys(EXPENSE_CATEGORY_LABELS));

// Lenient JSON pull from the skill output (tolerates fences / stray prose).
function parseScan(raw: string): Record<string, unknown> {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const s = text.indexOf("{");
    const e = text.lastIndexOf("}");
    if (s !== -1 && e !== -1) text = text.slice(s, e + 1);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export async function scanReceipt(input: { base64: string; mediaType: string }): Promise<ScanResult> {
  await requireManagingPartner();
  // Claude vision takes images only; PDFs/other types skip the scan (manual entry).
  if (!SCAN_IMAGE_TYPES.has(input.mediaType)) return EMPTY_SCAN;

  let raw: string;
  try {
    raw = await generate({
      skill: "scan-receipt",
      intake: "Extract the fields from this receipt/invoice image as the specified JSON object.",
      images: [{ base64: input.base64, mediaType: input.mediaType }],
      maxTokens: 600,
    });
  } catch {
    return EMPTY_SCAN; // model/transport failure → fall back to manual entry
  }

  let o: Record<string, unknown>;
  try {
    o = parseScan(raw);
  } catch {
    return EMPTY_SCAN;
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v) || null;
    if (typeof v === "string") {
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) && n !== 0 ? Math.round(n) : null;
    }
    return null;
  };
  const cat = str(o.category);
  const date = str(o.date);
  const conf = o.confidence;
  return {
    docType: o.docType === "invoice" ? "invoice" : o.docType === "receipt" ? "receipt" : null,
    vendor: str(o.vendor),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    amount: num(o.amount),
    tax: num(o.tax),
    currency: str(o.currency),
    category: cat && VALID_CATEGORIES.has(cat) ? (cat as ExpenseCategory) : null,
    invoiceNumber: str(o.invoiceNumber),
    description: str(o.description),
    confidence: conf === "high" || conf === "medium" || conf === "low" ? conf : null,
  };
}

// ── Accountant CSV export ──────────────────────────────────────────────────
// The full general ledger (AR invoices + AP bills + expenses + contractor
// payouts) as CSV for the bookkeeper. Reads the SAME normalizer as the on-screen
// Ledger tab (loadLedgerEntries) so the export and the screen never drift.
// MP-gated; read-only. The client turns the string into a download.

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

export async function exportLedgerCsv(): Promise<{ filename: string; csv: string }> {
  await requireManagingPartner();
  const entries = (await loadLedgerEntries()) ?? [];
  const iso = (d?: string | null) => (d ? d.slice(0, 10) : "");
  const rows = [
    csvRow([
      "Type", "Direction", "Date", "Party", "Project", "Number", "Category",
      "Description", "Amount_CAD", "Orig_Currency", "Orig_Amount", "Status",
      "Paid_Date", "Has_Document", "Drive_URL",
    ]),
  ];
  for (const e of entries) {
    rows.push(
      csvRow([
        LEDGER_TYPE_LABELS[e.sourceType],
        e.direction === "in" ? "In" : "Out",
        iso(e.date),
        e.party.name,
        e.projectName ?? "",
        e.number ?? "",
        e.categoryLabel ?? "",
        e.description ?? "",
        e.amountCad,
        e.origCurrency ?? "",
        e.origAmount ?? "",
        e.statusLabel,
        iso(e.paidDate),
        e.hasDocument ? "yes" : "no",
        e.driveUrl ?? "",
      ]),
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return { filename: `shift-financials-${today}.csv`, csv: rows.join("\n") };
}
