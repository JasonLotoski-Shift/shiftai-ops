"use server";

// Invoice-status mutations. Two named actions so each has its own audit
// verb + its own valid-from-state guard. Add more (markOverdue, revert
// drafts, etc.) when partner workflows ask for them.
//
// Canonical mutation recipe (see app/(app)/dashboard/actions.ts header).

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { folderIdFromUrl, uploadPdf } from "@/lib/drive";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { formatDate } from "@/lib/format";
import type { InvoiceTemplateData } from "@/lib/invoice-template";

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

// Mark a draft sent. `sentDate` (YYYY-MM-DD) is optional — pass it to back-date
// the send (an invoice emailed last week, logged today); omit for "now". The
// date is stored on Invoice.sentAt so the ledger reflects the real send date.
export async function markInvoiceSent(invoiceId: string, sentDate?: string | null) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, number: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "draft") {
    throw new Error(`Can't send invoice from status "${before.status}" (must be draft)`);
  }

  const sentAt = sentDate ? new Date(sentDate) : new Date();
  if (Number.isNaN(sentAt.getTime())) throw new Error("Enter a valid sent date");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "sent", sentAt },
    });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.sent",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: { status: { before: "draft", after: "sent" }, sentAt: sentAt.toISOString() },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: `Invoice ${before.number}`,
      detail: "Marked sent",
      link: `/invoices/${invoiceId}`,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "sent" as const };
}

// Mark a sent/overdue invoice paid. `paidDate` (YYYY-MM-DD) is optional —
// pass it to record the real payment date (a cheque that cleared Tuesday,
// logged Friday); omit for "now".
export async function markInvoicePaid(invoiceId: string, paidDate?: string | null) {
  const { actor } = await getActor();

  const before = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true, paidAt: true, number: true },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status !== "sent" && before.status !== "overdue") {
    throw new Error(`Can't mark paid from status "${before.status}" (must be sent or overdue)`);
  }

  const paidAt = paidDate ? new Date(paidDate) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Enter a valid paid date");

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt },
    });
    await writeAudit(tx, {
      actor,
      action: "update.invoice.paid",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: {
        status: { before: before.status, after: "paid" },
        paidAt: paidAt.toISOString(),
      },
    });
    await writeActivity(tx, {
      actor,
      type: "status",
      target: `Invoice ${before.number}`,
      detail: "Marked paid",
      link: `/invoices/${invoiceId}`,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return { status: "paid" as const, paidAt };
}

// Resolve a client's Drive folder ID, falling back to the Shared Drive root when
// the stored URL is a placeholder (mirrors the client-actions resolver).
function clientFolderId(driveFolderUrl: string): string {
  try {
    return folderIdFromUrl(driveFolderUrl);
  } catch {
    const shared = process.env.DRIVE_SHARED_DRIVE_FOLDER_ID;
    if (!shared) throw new Error("DRIVE_SHARED_DRIVE_FOLDER_ID is not configured");
    return shared;
  }
}

// Render the invoice as a real PDF and file it to the client's Drive folder.
// Deterministic: the values come straight from the Invoice record into the fixed
// template (no LLM, no recompute). Works for any status; re-runnable. Returns the
// Drive link so the caller can open it.
export async function generateInvoicePdf(invoiceId: string) {
  const { actor } = await getActor();
  const partnerLabel = actor.kind === "partner" ? actor.label : "AGENT · CLAUDE";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      amount: true,
      total: true,
      status: true,
      issuedAt: true,
      dueAt: true,
      clientId: true,
      projectId: true,
      client: {
        select: {
          company: true,
          notes: true,
          driveFolderUrl: true,
          billingContact: { select: { name: true, title: true, email: true } },
          primaryContact: { select: { name: true, title: true, email: true } },
        },
      },
      project: { select: { name: true } },
    },
  });
  if (!invoice) throw new Error("Invoice not found");

  const contact = invoice.client.billingContact ?? invoice.client.primaryContact;
  const projectShort = invoice.project.name.split("·")[1]?.trim() ?? invoice.project.name;
  const status = (invoice.status.charAt(0).toUpperCase() +
    invoice.status.slice(1)) as InvoiceTemplateData["status"];

  const data: InvoiceTemplateData = {
    number: invoice.number,
    issuedAt: formatDate(invoice.issuedAt),
    dueAt: formatDate(invoice.dueAt),
    status,
    billTo: {
      company: invoice.client.company,
      contactName: contact?.name,
      contactTitle: contact?.title,
      email: contact?.email,
      address: invoice.client.notes ? invoice.client.notes.split(".")[0] : undefined,
    },
    lineDescription: `Professional services — ${projectShort}`,
    amountCad: invoice.amount,
    totalCad: invoice.total || invoice.amount,
  };

  // Render + upload outside the transaction (don't hold a DB tx during I/O).
  const pdf = await renderInvoicePdf(data);
  const fileName = `${invoice.number}.pdf`;
  const { fileId, webViewLink } = await uploadPdf(
    pdf,
    fileName,
    clientFolderId(invoice.client.driveFolderUrl),
  );

  await prisma.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({
      data: {
        type: "invoice",
        title: `Invoice ${invoice.number} — ${invoice.client.company}`,
        driveUrl: webViewLink,
        fileName,
        createdBy: partnerLabel,
        generatedFromSkill: null,
        reviewStatus: "approved",
        clientId: invoice.clientId,
        projectId: invoice.projectId,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "generate.invoice.pdf",
      targetType: "Invoice",
      targetId: invoiceId,
      changes: { number: invoice.number, artifactId: artifact.id, driveFileId: fileId },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: invoice.client.company,
      detail: `Generated invoice PDF ${invoice.number}`,
      link: `/invoices/${invoiceId}`,
    });
  });

  revalidatePath(`/invoices/${invoiceId}`);
  return { driveUrl: webViewLink };
}
