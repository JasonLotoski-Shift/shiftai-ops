// Audit read helpers — surface the AuditLog as a per-record "change thread".
// AuditLog already records every mutation with before/after diffs; these
// queries gather the billing-relevant rows for a project or a single invoice.
// First read-side use of the audit ledger in the app (it was write-only).

import { prisma } from "@/lib/prisma";

export type AuditEntry = {
  id: string;
  ts: string; // ISO
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  changes: unknown;
};

function toEntries(rows: Awaited<ReturnType<typeof prisma.auditLog.findMany>>): AuditEntry[] {
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts.toISOString(),
    actorLabel: r.actorLabel,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    changes: r.changes,
  }));
}

// Every billing-relevant change on a project: project-level billing actions
// (fee, schedule, payouts, scope-pricing approval) + its installments,
// economics lines, payouts, and invoices.
export async function getProjectBillingThread(projectId: string): Promise<AuditEntry[]> {
  const [installments, lines, payouts, invoices] = await Promise.all([
    prisma.billingInstallment.findMany({ where: { projectId }, select: { id: true } }),
    prisma.projectEconomicsLine.findMany({ where: { projectId }, select: { id: true } }),
    prisma.consultantPayout.findMany({ where: { projectId }, select: { id: true } }),
    prisma.invoice.findMany({ where: { projectId }, select: { id: true } }),
  ]);

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: "Project", targetId: projectId },
        { targetType: "BillingInstallment", targetId: { in: installments.map((i) => i.id) } },
        { targetType: "ProjectEconomicsLine", targetId: { in: lines.map((i) => i.id) } },
        { targetType: "ConsultantPayout", targetId: { in: payouts.map((i) => i.id) } },
        { targetType: "Invoice", targetId: { in: invoices.map((i) => i.id) } },
      ],
    },
    orderBy: { ts: "desc" },
    take: 100,
  });

  return toEntries(rows);
}

// A single invoice's change thread: the invoice's own rows + its installment.
export async function getInvoiceThread(invoiceId: string): Promise<AuditEntry[]> {
  const installment = await prisma.billingInstallment.findUnique({
    where: { invoiceId },
    select: { id: true },
  });

  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: "Invoice", targetId: invoiceId },
        ...(installment ? [{ targetType: "BillingInstallment", targetId: installment.id }] : []),
      ],
    },
    orderBy: { ts: "desc" },
    take: 100,
  });

  return toEntries(rows);
}
