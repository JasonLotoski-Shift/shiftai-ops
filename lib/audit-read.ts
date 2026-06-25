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
export async function getProjectBillingThread(
  projectId: string,
  ids: { installmentIds: string[]; lineIds: string[]; payoutIds: string[]; invoiceIds: string[] },
): Promise<AuditEntry[]> {
  // The project page already loaded these child rows — pass their ids in rather
  // than re-querying them here (was 4 extra round trips before the auditLog
  // read; now just the one).
  const rows = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: "Project", targetId: projectId },
        { targetType: "BillingInstallment", targetId: { in: ids.installmentIds } },
        { targetType: "ProjectEconomicsLine", targetId: { in: ids.lineIds } },
        { targetType: "ConsultantPayout", targetId: { in: ids.payoutIds } },
        { targetType: "Invoice", targetId: { in: ids.invoiceIds } },
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
