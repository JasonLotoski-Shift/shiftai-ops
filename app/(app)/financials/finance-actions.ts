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
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/finance";
import { formatCAD } from "@/lib/format";
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
  amount: number; // subtotal, whole CAD
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

  const total = withGst(input.amount, input.gstBps ?? 0);

  // File the doc to Drive first (best-effort — never blocks the row).
  let driveFileId: string | null = null;
  let driveUrl: string | null = null;
  let fileName: string | null = null;
  if (input.file) {
    fileName = apBillFileName({
      issuedAt: input.issuedAt,
      vendor,
      number: input.number,
      amount: input.amount,
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
        amount: input.amount,
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
      changes: { vendor, amount: input.amount, total, dueAt: input.dueAt ?? null, hasDoc: !!driveUrl },
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
  amount: number; // whole CAD — ignored for mileage_km (computed from km)
  gstBps?: number;
  spentAt: string;
  mileageUnit?: MileageUnit | null;
  mileageKm?: number | null;
  paidById?: string | null;
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
  const isMileageKm = input.category === "fuel_mileage" && input.mileageUnit === "km";
  if (isMileageKm) {
    const km = Math.round((input.mileageKm ?? 0) * 10) / 10;
    if (km <= 0) throw new Error("Enter the kilometres driven");
    mileageKm = km;
    mileageRateCents = craMileageRateCents();
    amount = mileageAmountCad(km, mileageRateCents);
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");

  const total = withGst(amount, input.gstBps ?? 0);

  // Who fronted a reimbursable expense (defaults to the current partner).
  const paidById = input.kind === "reimbursable" ? input.paidById || partnerId : input.paidById || null;
  const paidBy = paidById
    ? await prisma.partner.findUnique({ where: { id: paidById }, select: { name: true } })
    : null;
  if (paidById && !paidBy) throw new Error("Selected partner not found");

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
      partner: paidBy?.name ?? label,
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
        gstBps: input.gstBps ?? 0,
        total,
        spentAt,
        status: needsPhoto ? "draft" : "submitted",
        mileageUnit: input.category === "fuel_mileage" ? input.mileageUnit ?? null : null,
        mileageKm,
        mileageRateCents,
        paidById,
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

// ── Accountant CSV export (Phase 3) ────────────────────────────────────────
// One unified money ledger (AR invoices + AP bills + expenses) as CSV for the
// bookkeeper. MP-gated; read-only. The client turns the string into a download.

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(",");

export async function exportLedgerCsv(): Promise<{ filename: string; csv: string }> {
  await requireManagingPartner();
  const [invoices, bills, expenses] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: { issuedAt: "desc" },
      select: { number: true, amount: true, total: true, issuedAt: true, paidAt: true, status: true, client: { select: { company: true } } },
    }),
    prisma.bill.findMany({
      orderBy: { createdAt: "desc" },
      select: { vendor: true, number: true, amount: true, total: true, issuedAt: true, createdAt: true, paidAt: true, status: true, category: true, description: true, driveUrl: true },
    }),
    prisma.expense.findMany({
      orderBy: { spentAt: "desc" },
      select: { vendor: true, category: true, amount: true, total: true, spentAt: true, reimbursedAt: true, status: true, description: true, driveUrl: true, paidBy: { select: { name: true } } },
    }),
  ]);

  const iso = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const catLabel = (c: ExpenseCategory | null) => (c ? EXPENSE_CATEGORY_LABELS[c] : "");
  const rows = [csvRow(["Type", "Date", "Party", "Number", "Category", "Description", "Amount_CAD", "Status", "Paid_Date", "Drive_URL"])];
  for (const i of invoices) {
    rows.push(csvRow(["AR", iso(i.issuedAt), i.client.company, i.number, "", "", i.total || i.amount, i.status, iso(i.paidAt), ""]));
  }
  for (const b of bills) {
    rows.push(csvRow(["AP", iso(b.issuedAt ?? b.createdAt), b.vendor, b.number ?? "", catLabel(b.category), b.description ?? "", b.total || b.amount, b.status, iso(b.paidAt), b.driveUrl ?? ""]));
  }
  for (const e of expenses) {
    rows.push(csvRow(["Expense", iso(e.spentAt), e.vendor ?? e.paidBy?.name ?? "", "", catLabel(e.category), e.description ?? "", e.total || e.amount, e.status, iso(e.reimbursedAt), e.driveUrl ?? ""]));
  }

  return { filename: `shift-financials-${iso(new Date())}.csv`, csv: rows.join("\n") };
}
