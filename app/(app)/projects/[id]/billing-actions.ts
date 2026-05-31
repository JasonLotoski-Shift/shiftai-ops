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
import type { InstallmentTrigger } from "@/lib/generated/prisma/enums";

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
  input: { label: string; amount: number; trigger?: string; dueDate?: string | null },
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
      data: { projectId, label, amount, trigger, dueDate, sortOrder, status: "planned" },
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
  input: { label?: string; amount?: number; trigger?: string; dueDate?: string | null },
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

  const data: { label?: string; amount?: number; trigger?: InstallmentTrigger; dueDate?: Date | null } = {};
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
      data: { status: "sent" },
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
  return { status: "sent" as const, ...result };
}
