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
import { fileBillDoc, fileReceiptDoc, moveBillToPaid } from "@/lib/firm-finance-drive";
import {
  apBillFileName,
  expenseFileName,
  paidRename,
  craMileageRateCents,
  mileageAmountCad,
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
