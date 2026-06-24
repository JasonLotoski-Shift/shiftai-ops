"use server";

// Billing-schedule + invoice mutations scoped to a project.
//
// Three feature groups live here:
//   1. BillingInstallment CRUD — the project's invoicing structure (the
//      planned schedule of "what we bill, and when").
//   2. createInvoiceFromProject — raise a draft Invoice from a planned
//      installment (preset) or a free-form override amount.
//   3. generateInvoice — turn a draft Invoice into a sent deliverable:
//      writes an Artifact (the formatted invoice doc) + flips draft → sent.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header):
// every write runs inside prisma.$transaction with writeAudit (+ optional
// writeActivity), then revalidatePath for affected routes.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { applyStandardScheduleTx } from "@/lib/billing/apply";
import { monthlyDueDate } from "@/lib/billing/schedule";
import { recomputePayoutsTx } from "@/lib/billing/payouts";
import { FALLBACK_BILL_RATE_CENTS } from "@/lib/billing/rate-card";
import { requireManagingPartner } from "@/lib/permissions";
import { commissionDollars } from "@/lib/billing/commission";
import type { InstallmentTrigger, CommissionBase } from "@/lib/generated/prisma/enums";

async function getActor() {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  return {
    actor: partnerActor(
      session.user.partnerId,
      session.user.name ?? session.user.email ?? "Unknown",
    ),
  };
}

const VALID_TRIGGERS: InstallmentTrigger[] = ["on_signing", "milestone", "date", "manual"];

function resolveTrigger(trigger?: string): InstallmentTrigger {
  return trigger && VALID_TRIGGERS.includes(trigger as InstallmentTrigger)
    ? (trigger as InstallmentTrigger)
    : "manual";
}

function validAmount(raw: number): number {
  const amount = Math.round(Number(raw));
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter a valid amount (≥ 0)");
  return amount;
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 3 — Billing-schedule CRUD
// ──────────────────────────────────────────────────────────────────────

export async function createInstallment(
  projectId: string,
  input: { label: string; amount: number; trigger?: string; dueDate?: string | null; isExtra?: boolean },
) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error("Project not found");

  const label = input.label?.trim();
  if (!label) throw new Error("Give the installment a label");
  const amount = validAmount(input.amount);
  const trigger = resolveTrigger(input.trigger);
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error("Enter a valid due date");

  // New rows append to the end of the schedule.
  const last = await prisma.billingInstallment.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.billingInstallment.create({
      data: { projectId, label, amount, trigger, dueDate, sortOrder, status: "planned", isExtra: input.isExtra ?? false },
    });
    await writeAudit(tx, {
      actor,
      action: "create.installment",
      targetType: "BillingInstallment",
      targetId: row.id,
      changes: { projectId, label, amount, trigger, sortOrder },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  return { id: created.id };
}

export async function updateInstallment(
  installmentId: string,
  input: { label?: string; amount?: number; trigger?: string; dueDate?: string | null; isExtra?: boolean },
) {
  const { actor } = await getActor();

  const before = await prisma.billingInstallment.findUnique({
    where: { id: installmentId },
    select: { id: true, projectId: true, label: true, amount: true, trigger: true, dueDate: true, status: true },
  });
  if (!before) throw new Error("Installment not found");
  if (before.status !== "planned") {
    throw new Error(`Can't edit an installment once it's ${before.status} — it's been invoiced`);
  }

  const data: { label?: string; amount?: number; trigger?: InstallmentTrigger; dueDate?: Date | null; isExtra?: boolean } = {};
  if (input.isExtra !== undefined) data.isExtra = input.isExtra;
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("Give the installment a label");
    data.label = label;
  }
  if (input.amount !== undefined) data.amount = validAmount(input.amount);
  if (input.trigger !== undefined) data.trigger = resolveTrigger(input.trigger);
  if (input.dueDate !== undefined) {
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error("Enter a valid due date");
    data.dueDate = dueDate;
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingInstallment.update({ where: { id: installmentId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.installment",
      targetType: "BillingInstallment",
      targetId: installmentId,
      changes: {
        label: data.label !== undefined ? { before: before.label, after: data.label } : undefined,
        amount: data.amount !== undefined ? { before: before.amount, after: data.amount } : undefined,
        trigger: data.trigger !== undefined ? { before: before.trigger, after: data.trigger } : undefined,
      },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  return { id: installmentId };
}

export async function deleteInstallment(installmentId: string) {
  const { actor } = await getActor();

  const before = await prisma.billingInstallment.findUnique({
    where: { id: installmentId },
    select: { id: true, projectId: true, label: true, amount: true, status: true, invoiceId: true },
  });
  if (!before) throw new Error("Installment not found");
  if (before.status !== "planned" || before.invoiceId) {
    throw new Error("Can't delete an installment that's already been invoiced");
  }

  await prisma.$transaction(async (tx) => {
    await tx.billingInstallment.delete({ where: { id: installmentId } });
    await writeAudit(tx, {
      actor,
      action: "delete.installment",
      targetType: "BillingInstallment",
      targetId: installmentId,
      changes: { label: before.label, amount: before.amount, projectId: before.projectId },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  return { id: installmentId };
}

// Persist a new ordering. `orderedIds` is the full list of installment ids
// for the project, in the order the partner dragged them into.
export async function reorderInstallments(projectId: string, orderedIds: string[]) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const rows = await prisma.billingInstallment.findMany({
    where: { projectId },
    select: { id: true },
  });
  const known = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== rows.length || orderedIds.some((id) => !known.has(id))) {
    throw new Error("Reorder list doesn't match this project's installments");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.billingInstallment.update({ where: { id: orderedIds[i] }, data: { sortOrder: i } });
    }
    await writeAudit(tx, {
      actor,
      action: "update.installment.order",
      targetType: "Project",
      targetId: projectId,
      changes: { order: orderedIds },
    });
  });

  revalidatePath(`/projects/${projectId}`);
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 4 — Generate the standard 50/25/25 client schedule
// ──────────────────────────────────────────────────────────────────────

// Produce (or regenerate) the firm's standard 50/25/25 billing schedule from
// the project's value + delivery window. With force=false it won't overwrite
// an existing schedule; with force=true it replaces only the planned rows and
// never touches invoiced/paid installments or extras.
export async function generateStandardSchedule(projectId: string, opts?: { force?: boolean }) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, budgetFee: true, startDate: true, targetEndDate: true, scheduleType: true, projectType: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.budgetFee <= 0) throw new Error("Set a project value before generating a schedule");

  const result = await prisma.$transaction(async (tx) => {
    const r = await applyStandardScheduleTx(tx, {
      projectId,
      value: project.budgetFee,
      startDate: project.startDate,
      targetEndDate: project.targetEndDate,
      scheduleType: project.scheduleType,
      projectType: project.projectType ?? undefined,
      force: opts?.force,
    });
    if (!r.skipped) {
      await writeAudit(tx, {
        actor,
        action: "generate.schedule",
        targetType: "Project",
        targetId: projectId,
        changes: { value: project.budgetFee, created: r.created, deleted: r.deleted, force: !!opts?.force },
      });
    }
    return r;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 4c — Add the next subscription month (Business model v2)
//
// Subscriptions bill MONTH-BY-MONTH and open-ended, so we never pre-generate a
// bounded schedule. The project opens with month 1; this appends the next month
// (amount = the monthly price held in budgetFee, due the 1st of that month).
// A partner adds the next month when they bill it. (A future scheduled agent
// can call this automatically — until then it's a one-click manual step.)
// ──────────────────────────────────────────────────────────────────────

export async function addSubscriptionMonth(projectId: string) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, budgetFee: true, startDate: true, projectType: true },
  });
  if (!project) throw new Error("Project not found");
  if (project.projectType !== "subscription") {
    throw new Error("Add-month is only for subscription engagements");
  }
  if (project.budgetFee <= 0) throw new Error("Set the monthly price (project value) before adding a month");

  // Derive the next month from the highest "Month N" already scheduled — robust
  // to a deleted month (no duplicate label / due-date collision) and to a project
  // that also carries non-month installments (those are ignored). Month K lives
  // at month-index K-1 (month 1 = index 0 = the 1st of the start month).
  const existing = await prisma.billingInstallment.findMany({
    where: { projectId, isExtra: false },
    select: { label: true, sortOrder: true },
  });
  const monthNums = existing
    .map((i) => /^Month (\d+)$/.exec(i.label)?.[1])
    .filter((n): n is string => Boolean(n))
    .map((n) => parseInt(n, 10));
  const index = (monthNums.length ? Math.max(...monthNums) : 0); // next month-index
  const dueDate = monthlyDueDate(project.startDate, index);
  const sortOrder = existing.reduce((m, i) => Math.max(m, i.sortOrder), -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.billingInstallment.create({
      data: {
        projectId,
        label: `Month ${index + 1}`,
        amount: project.budgetFee,
        trigger: "date",
        dueDate,
        sortOrder,
        status: "planned",
        isExtra: false,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.installment.subscriptionMonth",
      targetType: "BillingInstallment",
      targetId: row.id,
      changes: { projectId, label: `Month ${index + 1}`, amount: project.budgetFee, monthIndex: index },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  return { id: created.id, month: index + 1 };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 4b — Project economics lines (firm economics)
//
// Each line is a person/role on the project with hours + pay rate (cost) +
// billable rate. Adding a line for a roster consultant auto-applies firm
// defaults (their pay rate; the firm default billable rate) — that IS "apply
// firm economics". Overriding a rate flips fromFirmDefault → false. Reconcile
// math lives in lib/billing/economics.ts; this file only persists + audits.
// ──────────────────────────────────────────────────────────────────────

function validRateCents(raw: number | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const cents = Math.round(Number(raw));
  if (!Number.isFinite(cents) || cents < 0) throw new Error("Enter a valid rate (≥ 0)");
  return cents;
}

function validHours(raw: number): number {
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 0) throw new Error("Enter valid hours (≥ 0)");
  return Math.round(hours * 100) / 100; // 2dp
}

export async function createEconomicsLine(
  projectId: string,
  input: {
    consultantId?: string | null;
    rateTierId?: string | null;
    role?: string;
    hours: number;
    payRateCents?: number;
    billRateCents?: number;
    isExtra?: boolean;
  },
) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  // A line is tied to a roster consultant (preferred) OR a free-text role.
  let consultant: { id: string; role: string; defaultPayRateCents: number } | null = null;
  if (input.consultantId) {
    const found = await prisma.consultant.findUnique({
      where: { id: input.consultantId },
      select: { id: true, role: true, defaultPayRateCents: true },
    });
    if (!found) throw new Error("Consultant not found");
    consultant = found;
  }

  // A rate tier (the firm rate card) supplies the default pay + bill rates.
  let tier: { id: string; name: string; billRateCents: number; payRateCents: number } | null = null;
  if (input.rateTierId) {
    const found = await prisma.rateTier.findUnique({
      where: { id: input.rateTierId },
      select: { id: true, name: true, billRateCents: true, payRateCents: true },
    });
    if (!found) throw new Error("Rate tier not found");
    tier = found;
  }

  const role = (input.role?.trim() || tier?.name || consultant?.role || "").trim();
  if (!role) throw new Error("Give the line a role (pick a tier or consultant)");

  const hours = validHours(input.hours);
  // Firm defaults, in priority order: explicit input → rate tier → consultant
  // roster rate (pay) / Senior tier (bill). Supplying a rate explicitly is an
  // override; seeding purely from tier/roster is "apply firm economics".
  const payRateCents = validRateCents(
    input.payRateCents,
    tier?.payRateCents ?? consultant?.defaultPayRateCents ?? 0,
  );
  const billRateCents = validRateCents(
    input.billRateCents,
    tier?.billRateCents ?? FALLBACK_BILL_RATE_CENTS,
  );
  const fromFirmDefault = input.payRateCents === undefined && input.billRateCents === undefined;

  const last = await prisma.projectEconomicsLine.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.projectEconomicsLine.create({
      data: {
        projectId,
        consultantId: consultant?.id ?? null,
        rateTierId: tier?.id ?? null,
        role,
        hours,
        payRateCents,
        billRateCents,
        isExtra: input.isExtra ?? false,
        sortOrder,
        fromFirmDefault,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.economicsLine",
      targetType: "ProjectEconomicsLine",
      targetId: row.id,
      changes: { projectId, consultantId: consultant?.id ?? null, rateTierId: tier?.id ?? null, role, hours, payRateCents, billRateCents, isExtra: input.isExtra ?? false },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/invoices");
  return { id: created.id };
}

export async function updateEconomicsLine(
  lineId: string,
  input: {
    consultantId?: string | null;
    rateTierId?: string | null;
    role?: string;
    hours?: number;
    payRateCents?: number;
    billRateCents?: number;
    isExtra?: boolean;
  },
) {
  const { actor } = await getActor();

  const before = await prisma.projectEconomicsLine.findUnique({
    where: { id: lineId },
    select: { id: true, projectId: true, role: true, hours: true, payRateCents: true, billRateCents: true, isExtra: true, consultantId: true },
  });
  if (!before) throw new Error("Economics line not found");

  const data: {
    consultantId?: string | null;
    rateTierId?: string | null;
    role?: string;
    hours?: number;
    payRateCents?: number;
    billRateCents?: number;
    isExtra?: boolean;
    fromFirmDefault?: boolean;
  } = {};
  if (input.consultantId !== undefined) data.consultantId = input.consultantId || null;
  if (input.rateTierId !== undefined) data.rateTierId = input.rateTierId || null;
  if (input.role !== undefined) {
    const role = input.role.trim();
    if (!role) throw new Error("Role can't be empty");
    data.role = role;
  }
  if (input.hours !== undefined) data.hours = validHours(input.hours);
  if (input.payRateCents !== undefined) data.payRateCents = validRateCents(input.payRateCents, 0);
  if (input.billRateCents !== undefined) data.billRateCents = validRateCents(input.billRateCents, 0);
  if (input.isExtra !== undefined) data.isExtra = input.isExtra;
  // Any edit to a rate is a manual override of the firm default.
  if (input.payRateCents !== undefined || input.billRateCents !== undefined) data.fromFirmDefault = false;

  await prisma.$transaction(async (tx) => {
    await tx.projectEconomicsLine.update({ where: { id: lineId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.economicsLine",
      targetType: "ProjectEconomicsLine",
      targetId: lineId,
      changes: {
        role: data.role !== undefined ? { before: before.role, after: data.role } : undefined,
        hours: data.hours !== undefined ? { before: Number(before.hours), after: data.hours } : undefined,
        payRateCents: data.payRateCents !== undefined ? { before: before.payRateCents, after: data.payRateCents } : undefined,
        billRateCents: data.billRateCents !== undefined ? { before: before.billRateCents, after: data.billRateCents } : undefined,
        isExtra: data.isExtra !== undefined ? { before: before.isExtra, after: data.isExtra } : undefined,
      },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/invoices");
  return { id: lineId };
}

export async function deleteEconomicsLine(lineId: string) {
  const { actor } = await getActor();

  const before = await prisma.projectEconomicsLine.findUnique({
    where: { id: lineId },
    select: { id: true, projectId: true, role: true },
  });
  if (!before) throw new Error("Economics line not found");

  await prisma.$transaction(async (tx) => {
    await tx.projectEconomicsLine.delete({ where: { id: lineId } });
    await writeAudit(tx, {
      actor,
      action: "delete.economicsLine",
      targetType: "ProjectEconomicsLine",
      targetId: lineId,
      changes: { projectId: before.projectId, role: before.role },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/invoices");
  return { id: lineId };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 5 — Raise a draft Invoice from a project
// ──────────────────────────────────────────────────────────────────────

// Invoice numbers are SAI-<year>-NNN, zero-padded to 3, globally sequential.
// We derive the next number from the current max for the year so the format
// matches existing seed data (SAI-2026-009 → SAI-2026-010).
async function nextInvoiceNumber(
  tx: Pick<typeof prisma, "invoice">,
  year: number,
): Promise<string> {
  const prefix = `SAI-${year}-`;
  const latest = await tx.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const lastSeq = latest ? parseInt(latest.number.slice(prefix.length), 10) : 0;
  const next = (Number.isFinite(lastSeq) ? lastSeq : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function createInvoiceFromProject(
  projectId: string,
  input: { installmentId?: string; amount: number; dueInDays?: number },
) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, clientId: true, client: { select: { company: true } } },
  });
  if (!project) throw new Error("Project not found");

  const amount = validAmount(input.amount);
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");

  const dueInDays = Number.isFinite(Number(input.dueInDays)) ? Math.round(Number(input.dueInDays)) : 30;
  if (dueInDays < 0) throw new Error("Due-in-days can't be negative");

  // If an installment is named, it must belong to this project and still be planned.
  let installment: { id: string; status: string; label: string } | null = null;
  if (input.installmentId) {
    const found = await prisma.billingInstallment.findUnique({
      where: { id: input.installmentId },
      select: { id: true, status: true, label: true, projectId: true, invoiceId: true },
    });
    if (!found || found.projectId !== projectId) throw new Error("Installment not found on this project");
    if (found.status !== "planned" || found.invoiceId) {
      throw new Error("That installment has already been invoiced");
    }
    installment = { id: found.id, status: found.status, label: found.label };
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + dueInDays * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, now.getFullYear());

    const invoice = await tx.invoice.create({
      data: {
        number,
        amount,
        gstBps: 0, // firm not GST-registered yet; total == amount
        total: amount,
        issuedAt: now,
        dueAt,
        status: "draft",
        clientId: project.clientId,
        projectId: project.id,
      },
    });

    if (installment) {
      await tx.billingInstallment.update({
        where: { id: installment.id },
        data: { status: "invoiced", invoiceId: invoice.id },
      });
      // A stage is now in flight — (re)compute the consultant payouts owed.
      await recomputePayoutsTx(tx, project.id);
    }

    await writeAudit(tx, {
      actor,
      action: "create.invoice",
      targetType: "Invoice",
      targetId: invoice.id,
      changes: {
        number,
        amount,
        projectId: project.id,
        clientId: project.clientId,
        installmentId: installment?.id ?? null,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: project.client.company,
      detail: installment
        ? `Drafted invoice ${number} — ${installment.label}`
        : `Drafted invoice ${number}`,
      link: `/invoices/${invoice.id}`,
    });

    return { id: invoice.id, number };
  });

  revalidatePath("/invoices");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 9 — Generate the invoice deliverable (draft → sent)
// ──────────────────────────────────────────────────────────────────────

// Produces the formatted invoice document: writes an Artifact (type
// "invoice", reviewStatus "approved", scoped to the client + project) and
// flips the draft Invoice to "sent" — same semantics as markInvoiceSent.
export async function generateInvoice(invoiceId: string) {
  const { actor } = await getActor();

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      amount: true,
      status: true,
      clientId: true,
      projectId: true,
      client: { select: { company: true, driveFolderUrl: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "draft") {
    throw new Error(`Can only generate from a draft invoice (this one is "${invoice.status}")`);
  }

  const driveUrl = invoice.client.driveFolderUrl || "#";

  const result = await prisma.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({
      data: {
        type: "invoice",
        title: `Invoice ${invoice.number} — ${invoice.client.company}`,
        driveUrl,
        fileName: `${invoice.number}.pdf`,
        createdBy: actor.kind === "partner" ? actor.label : "AGENT · CLAUDE",
        generatedFromSkill: null,
        reviewStatus: "approved",
        clientId: invoice.clientId,
        projectId: invoice.projectId,
      },
    });

    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "sent", sentAt: new Date() },
    });

    await writeAudit(tx, {
      actor,
      action: "generate.invoice",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: {
        status: { before: "draft", after: "sent" },
        artifactId: artifact.id,
        number: invoice.number,
      },
    });

    await writeActivity(tx, {
      actor,
      type: "doc",
      target: invoice.client.company,
      detail: `Generated & sent invoice ${invoice.number}`,
      link: `/invoices/${invoiceId}`,
    });

    return { artifactId: artifact.id, number: invoice.number };
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  if (invoice.projectId) revalidatePath(`/projects/${invoice.projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/financials");
  return { status: "sent" as const, ...result };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 6 — Direct costs (Phase 1)
//
// Pass-through costs (travel, SaaS, third-party tools) billed AT COST. They add
// to the client price but carry no origination / firm-pool split / margin.
// ──────────────────────────────────────────────────────────────────────

export async function createDirectCost(
  projectId: string,
  input: { label: string; amount: number; notes?: string | null },
) {
  const { actor } = await getActor();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const label = input.label?.trim();
  if (!label) throw new Error("Give the direct cost a label");
  const amount = validAmount(input.amount);

  const last = await prisma.projectDirectCost.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.projectDirectCost.create({
      data: { projectId, label, amount, notes: input.notes?.trim() || null, sortOrder },
    });
    await writeAudit(tx, {
      actor,
      action: "create.directCost",
      targetType: "ProjectDirectCost",
      targetId: row.id,
      changes: { projectId, label, amount },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financials");
  return { id: created.id };
}

export async function updateDirectCost(
  costId: string,
  input: { label?: string; amount?: number; notes?: string | null },
) {
  const { actor } = await getActor();
  const before = await prisma.projectDirectCost.findUnique({
    where: { id: costId },
    select: { id: true, projectId: true, label: true, amount: true },
  });
  if (!before) throw new Error("Direct cost not found");

  const data: { label?: string; amount?: number; notes?: string | null } = {};
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error("Label can't be empty");
    data.label = label;
  }
  if (input.amount !== undefined) data.amount = validAmount(input.amount);
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.projectDirectCost.update({ where: { id: costId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.directCost",
      targetType: "ProjectDirectCost",
      targetId: costId,
      changes: {
        label: data.label !== undefined ? { before: before.label, after: data.label } : undefined,
        amount: data.amount !== undefined ? { before: before.amount, after: data.amount } : undefined,
      },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/financials");
  return { id: costId };
}

export async function deleteDirectCost(costId: string) {
  const { actor } = await getActor();
  const before = await prisma.projectDirectCost.findUnique({
    where: { id: costId },
    select: { id: true, projectId: true, label: true },
  });
  if (!before) throw new Error("Direct cost not found");

  await prisma.$transaction(async (tx) => {
    await tx.projectDirectCost.delete({ where: { id: costId } });
    await writeAudit(tx, {
      actor,
      action: "delete.directCost",
      targetType: "ProjectDirectCost",
      targetId: costId,
      changes: { projectId: before.projectId, label: before.label },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/financials");
  return { id: costId };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 7 — Origination / commission (Phase 2)
//
// Who sourced the contract and their share of the 10% origination slot. 1–2
// rows per project (shared), or none. Shares must sum to 100 when any exist.
// ──────────────────────────────────────────────────────────────────────

function validSharePct(raw: number): number {
  const pct = Math.round(Number(raw) * 100) / 100;
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Error("Share must be between 0 and 100");
  return pct;
}

// Guard: existing + this new/edited share can't exceed 100, and at most 2 rows.
async function assertOriginationShares(projectId: string, addPct: number, excludeId?: string) {
  const rows = await prisma.origination.findMany({
    where: { projectId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { sharePct: true },
  });
  if (!excludeId && rows.length >= 2) throw new Error("Origination supports at most two people");
  const existing = rows.reduce((s, r) => s + Number(r.sharePct), 0);
  if (existing + addPct > 100.0001) throw new Error(`Shares exceed 100% (${existing}% already attributed)`);
}

export async function addOrigination(
  projectId: string,
  input: { partnerId: string; sharePct: number; notes?: string | null },
) {
  const { actor } = await getActor();
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");
  const partner = await prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true, name: true } });
  if (!partner) throw new Error("Partner not found");

  const sharePct = validSharePct(input.sharePct);
  await assertOriginationShares(projectId, sharePct);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.origination.create({
      data: { projectId, partnerId: partner.id, sharePct, notes: input.notes?.trim() || null },
    });
    await writeAudit(tx, {
      actor,
      action: "create.origination",
      targetType: "Origination",
      targetId: row.id,
      changes: { projectId, partnerId: partner.id, sharePct },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financials");
  return { id: created.id };
}

export async function updateOrigination(
  originationId: string,
  input: { sharePct?: number; notes?: string | null },
) {
  const { actor } = await getActor();
  const before = await prisma.origination.findUnique({
    where: { id: originationId },
    select: { id: true, projectId: true, sharePct: true },
  });
  if (!before) throw new Error("Origination not found");

  const data: { sharePct?: number; notes?: string | null } = {};
  if (input.sharePct !== undefined) {
    const sharePct = validSharePct(input.sharePct);
    await assertOriginationShares(before.projectId, sharePct, originationId);
    data.sharePct = sharePct;
  }
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  await prisma.$transaction(async (tx) => {
    await tx.origination.update({ where: { id: originationId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.origination",
      targetType: "Origination",
      targetId: originationId,
      changes: { sharePct: data.sharePct !== undefined ? { before: Number(before.sharePct), after: data.sharePct } : undefined },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/financials");
  return { id: originationId };
}

export async function deleteOrigination(originationId: string) {
  const { actor } = await getActor();
  const before = await prisma.origination.findUnique({
    where: { id: originationId },
    select: { id: true, projectId: true },
  });
  if (!before) throw new Error("Origination not found");

  await prisma.$transaction(async (tx) => {
    await tx.origination.delete({ where: { id: originationId } });
    await writeAudit(tx, {
      actor,
      action: "delete.origination",
      targetType: "Origination",
      targetId: originationId,
      changes: { projectId: before.projectId },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/financials");
  return { id: originationId };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 8 — Project billing settings (Phase 2 + 4)
//
// originationPct (commission %), isFirstContract (eligibility snapshot), and
// scheduleType (how the standard schedule is generated). All on Project.
// ──────────────────────────────────────────────────────────────────────

const VALID_SCHEDULE_TYPES = ["fifty_twenty_five", "monthly_even", "custom"] as const;
type ScheduleTypeStr = (typeof VALID_SCHEDULE_TYPES)[number];

export async function setProjectBillingMeta(
  projectId: string,
  input: { originationPct?: number; isFirstContract?: boolean; scheduleType?: string },
) {
  const { actor } = await getActor();
  const before = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, originationPct: true, isFirstContract: true, scheduleType: true },
  });
  if (!before) throw new Error("Project not found");

  const data: { originationPct?: number; isFirstContract?: boolean; scheduleType?: ScheduleTypeStr } = {};
  if (input.originationPct !== undefined) {
    const pct = Math.round(Number(input.originationPct) * 100) / 100;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error("Commission % must be between 0 and 100");
    data.originationPct = pct;
  }
  if (input.isFirstContract !== undefined) data.isFirstContract = input.isFirstContract;
  if (input.scheduleType !== undefined) {
    if (!VALID_SCHEDULE_TYPES.includes(input.scheduleType as ScheduleTypeStr)) {
      throw new Error("Unknown schedule type");
    }
    data.scheduleType = input.scheduleType as ScheduleTypeStr;
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data });
    await writeAudit(tx, {
      actor,
      action: "update.project.billingMeta",
      targetType: "Project",
      targetId: projectId,
      changes: {
        originationPct: data.originationPct !== undefined ? { before: Number(before.originationPct), after: data.originationPct } : undefined,
        isFirstContract: data.isFirstContract !== undefined ? { before: before.isFirstContract, after: data.isFirstContract } : undefined,
        scheduleType: data.scheduleType !== undefined ? { before: before.scheduleType, after: data.scheduleType } : undefined,
      },
    });
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financials");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 9 (commission) — Deal-source commission, project fallback (2026-06-22)
//
// The project-level twin of the deal commission, for when a deal converted with
// none set (or to adjust the snapshot). Independent payees (partner OR external),
// each 1-10% of a base; the one-time build slice is computed against budgetFee.
// 6/12-month bases only matter if a ServiceContract exists. Firm money —
// managing-partner gated (the shared getActor is NOT gated, so guard here).
// ──────────────────────────────────────────────────────────────────────

const VALID_COMMISSION_BASES_PROJ: CommissionBase[] = ["deal_value", "total_6mo", "total_12mo"];

function validCommissionPctProj(raw: number): number {
  const pct = Math.round(Number(raw) * 100) / 100;
  if (!Number.isFinite(pct) || pct < 1 || pct > 10) throw new Error("Commission % must be between 1 and 10");
  return pct;
}

function validCommissionBaseProj(raw?: string): CommissionBase {
  if (raw && VALID_COMMISSION_BASES_PROJ.includes(raw as CommissionBase)) return raw as CommissionBase;
  throw new Error(`Invalid commission base: ${raw}`);
}

function assertPayeeProj(input: { partnerId?: string | null; externalName?: string | null }) {
  const hasPartner = !!input.partnerId;
  const hasExternal = !!input.externalName?.trim();
  if (hasPartner === hasExternal) throw new Error("Choose a partner or an external name, not both or neither");
}

export async function addProjectSourceCommission(
  projectId: string,
  input: { partnerId?: string; externalName?: string; pct: number; base: string; notes?: string },
) {
  const { actor } = await getActor();
  await requireManagingPartner();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, budgetFee: true, serviceContract: { select: { monthlyFee: true } } },
  });
  if (!project) throw new Error("Project not found");
  assertPayeeProj(input);
  const pct = validCommissionPctProj(input.pct);
  const base = validCommissionBaseProj(input.base);
  const count = await prisma.projectSourceCommission.count({ where: { projectId } });
  if (count >= 2) throw new Error("At most two commission payees per project");
  if (input.partnerId) {
    const p = await prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
    if (!p) throw new Error("Partner not found");
  }
  const monthlyFee = project.serviceContract?.monthlyFee ?? 0;
  const buildAmount = commissionDollars(pct, base, project.budgetFee, monthlyFee).build;

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.projectSourceCommission.create({
      data: {
        projectId,
        partnerId: input.partnerId ?? null,
        externalName: input.partnerId ? null : input.externalName?.trim() ?? null,
        pct,
        base,
        buildAmount,
        sourceDealCommissionId: null,
        notes: input.notes?.trim() || null,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.projectSourceCommission",
      targetType: "ProjectSourceCommission",
      targetId: row.id,
      changes: { projectId, partnerId: input.partnerId ?? null, externalName: input.externalName ?? null, pct, base, buildAmount },
    });
    return row;
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financials");
  return { id: created.id };
}

export async function deleteProjectSourceCommission(id: string) {
  const { actor } = await getActor();
  await requireManagingPartner();
  const before = await prisma.projectSourceCommission.findUnique({ where: { id }, select: { id: true, projectId: true } });
  if (!before) throw new Error("Commission not found");

  await prisma.$transaction(async (tx) => {
    await tx.projectSourceCommission.delete({ where: { id } });
    await writeAudit(tx, {
      actor,
      action: "delete.projectSourceCommission",
      targetType: "ProjectSourceCommission",
      targetId: id,
      changes: { projectId: before.projectId },
    });
  });

  revalidatePath(`/projects/${before.projectId}`);
  revalidatePath("/financials");
  return { id };
}

// ──────────────────────────────────────────────────────────────────────
// FEATURE 9b — Mark an invoice manually sent (Phase 4)
//
// For invoices sent outside the tool (e.g. Shane Nolan). Creates a SENT invoice
// with isManual=true and NO generated Artifact, links the installment, and
// recomputes payouts — same downstream effect as generateInvoice, minus the doc.
// ──────────────────────────────────────────────────────────────────────

export async function markInvoiceManual(
  projectId: string,
  input: { installmentId?: string; amount: number; issuedAt?: string | null; dueInDays?: number; gstBps?: number },
) {
  const { actor } = await getActor();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, clientId: true, client: { select: { company: true } } },
  });
  if (!project) throw new Error("Project not found");

  const amount = validAmount(input.amount);
  if (amount <= 0) throw new Error("Invoice amount must be greater than zero");
  const gstBps = Number.isFinite(Number(input.gstBps)) ? Math.max(0, Math.round(Number(input.gstBps))) : 0;
  const total = amount + Math.round((amount * gstBps) / 10000);

  const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
  if (Number.isNaN(issuedAt.getTime())) throw new Error("Enter a valid issued date");
  const dueInDays = Number.isFinite(Number(input.dueInDays)) ? Math.round(Number(input.dueInDays)) : 30;
  const dueAt = new Date(issuedAt.getTime() + dueInDays * 24 * 60 * 60 * 1000);

  let installment: { id: string; label: string } | null = null;
  if (input.installmentId) {
    const found = await prisma.billingInstallment.findUnique({
      where: { id: input.installmentId },
      select: { id: true, status: true, label: true, projectId: true, invoiceId: true },
    });
    if (!found || found.projectId !== projectId) throw new Error("Installment not found on this project");
    if (found.status !== "planned" || found.invoiceId) throw new Error("That installment has already been invoiced");
    installment = { id: found.id, label: found.label };
  }

  const result = await prisma.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, issuedAt.getFullYear());
    const invoice = await tx.invoice.create({
      data: {
        number,
        amount,
        gstBps,
        total,
        isManual: true,
        issuedAt,
        // A manually-logged invoice was sent outside the tool on its issued
        // date — record that as the sent date too.
        sentAt: issuedAt,
        dueAt,
        status: "sent",
        clientId: project.clientId,
        projectId: project.id,
      },
    });

    if (installment) {
      await tx.billingInstallment.update({
        where: { id: installment.id },
        data: { status: "invoiced", invoiceId: invoice.id },
      });
      await recomputePayoutsTx(tx, project.id);
    }

    await writeAudit(tx, {
      actor,
      action: "create.invoice.manual",
      targetType: "Invoice",
      targetId: invoice.id,
      changes: { number, amount, total, gstBps, isManual: true, installmentId: installment?.id ?? null },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: project.client.company,
      detail: installment ? `Logged manual invoice ${number} — ${installment.label}` : `Logged manual invoice ${number}`,
      link: `/invoices/${invoice.id}`,
    });

    return { id: invoice.id, number };
  });

  revalidatePath("/invoices");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/financials");
  revalidatePath("/dashboard");
  return result;
}
