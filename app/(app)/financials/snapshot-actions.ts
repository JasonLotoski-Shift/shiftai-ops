"use server";

// Phase 0 of the Financials rebuild — run-full-snapshot. ONE MP-gated action that
// freezes the current financial truth before anything is rebuilt. It reads every
// money table RAW (before any dedup), recomputes today's economics through the
// exact production path, files a full-fidelity JSON + per-table CSVs to a dated
// Drive folder under the financials root, and writes one Artifact + one AuditLog
// (+ a figure-free Activity) in a single transaction. Schema-free by design: the
// Artifact carries it (type "report", generatedFromSkill "run-full-snapshot"), so
// Phase 0 needs no migration. Returns a table -> row-count + dollar-total summary
// for Jason to verify. Nothing in the rebuild proceeds until that is confirmed.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit, writeActivity, partnerActor, type Actor } from "@/lib/audit";
import { requireManagingPartner } from "@/lib/permissions";
import { drive, uploadFile } from "@/lib/drive";
import { ensureFinancialsRootFolder } from "@/lib/firm-finance-drive";
import { loadLedgerEntries } from "@/app/(app)/financials/ledger-data";
import { buildSnapshot, type SnapshotSummary } from "@/lib/financials/snapshot";

async function getActor(): Promise<{ actor: Actor; label: string }> {
  const session = await auth();
  if (!session?.user?.partnerId) throw new Error("Not authenticated");
  const label = session.user.name ?? session.user.email ?? "Unknown";
  return { actor: partnerActor(session.user.partnerId, label), label };
}

// Find-or-create a folder by name under `parentId`, returning its id (idempotent
// so re-running never spawns a second "_Snapshots").
async function ensureSubfolderId(parentId: string, name: string): Promise<string> {
  const list = await drive.files.list({
    q: `name = '${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = list.data.files?.[0]?.id;
  if (existing) return existing;
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Snapshot folder creation returned no ID");
  return res.data.id;
}

// Create a fresh dated folder and return its id + browser link (the Artifact's
// driveUrl points here, so the partner opens the whole snapshot in one click).
async function createDatedFolder(parentId: string, name: string): Promise<{ id: string; webViewLink: string }> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  if (!res.data.id || !res.data.webViewLink) throw new Error("Snapshot dated folder creation returned no link");
  return { id: res.data.id, webViewLink: res.data.webViewLink };
}

// 2026-06-29_143210 — sortable, colon-free (Drive-safe), unique to the second.
function folderStamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "");
}

export type RunSnapshotResult = {
  ok: true;
  folderUrl: string;
  snapshotJsonUrl: string;
  artifactId: string;
  summary: SnapshotSummary;
};

export async function runFullSnapshot(): Promise<RunSnapshotResult> {
  await requireManagingPartner();
  const { actor, label } = await getActor();
  const takenAt = new Date();

  // 1. Read every money table RAW (full rows, no dedup), the per-project calc
  //    projection, the accrual partner-attribution join, and the deduped ledger.
  const [
    invoices,
    bills,
    expenses,
    payouts,
    installments,
    economicsLines,
    directCosts,
    originations,
    dealSourceCommissions,
    projectSourceCommissions,
    ongoingCommissions,
    rawAccruals,
    serviceContracts,
    estimates,
    estimateLines,
    rateTiers,
    deals,
    projectsForCalc,
    accrualJoin,
  ] = await Promise.all([
    prisma.invoice.findMany(),
    prisma.bill.findMany(),
    prisma.expense.findMany(),
    prisma.consultantPayout.findMany(),
    prisma.billingInstallment.findMany(),
    prisma.projectEconomicsLine.findMany(),
    prisma.projectDirectCost.findMany(),
    prisma.origination.findMany(),
    prisma.dealSourceCommission.findMany(),
    prisma.projectSourceCommission.findMany(),
    prisma.ongoingContractCommission.findMany(),
    prisma.ongoingContractCommissionAccrual.findMany(),
    prisma.serviceContract.findMany(),
    prisma.estimate.findMany(),
    prisma.estimateLine.findMany(),
    prisma.rateTier.findMany(),
    prisma.deal.findMany({
      select: { id: true, company: true, name: true, stage: true, valueEstimate: true, budget: true, partnerLeadId: true, createdAt: true },
    }),
    prisma.project.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        projectType: true,
        budgetFee: true,
        originationPct: true,
        isFirstContract: true,
        client: { select: { company: true } },
        economicsLines: { select: { hours: true, payRateCents: true, billRateCents: true, isExtra: true } },
        directCosts: { select: { amount: true } },
        invoices: { select: { amount: true, status: true } },
        originations: { select: { partnerId: true, sharePct: true } },
      },
    }),
    prisma.ongoingContractCommissionAccrual.findMany({
      select: { amount: true, status: true, periodStart: true, commission: { select: { partnerId: true, externalName: true } } },
    }),
  ]);
  const ledgerEntries = await loadLedgerEntries();

  // 2. Pure assembly — JSON + per-table CSVs + the frozen computed block + summary.
  const { json, csvs, summary } = buildSnapshot({
    takenAt,
    takenBy: label,
    raw: {
      invoices,
      bills,
      expenses,
      payouts,
      installments,
      economicsLines,
      directCosts,
      originations,
      dealSourceCommissions,
      projectSourceCommissions,
      ongoingCommissions,
      accruals: rawAccruals,
      serviceContracts,
      estimates,
      estimateLines,
      rateTiers,
      deals,
    },
    projectsForCalc,
    buildRows: projectSourceCommissions.map((r) => ({ buildAmount: r.buildAmount, partnerId: r.partnerId, externalName: r.externalName })),
    accrualRollupRows: accrualJoin.map((a) => ({
      amount: a.amount,
      status: a.status,
      periodStart: a.periodStart,
      partnerId: a.commission.partnerId,
      externalName: a.commission.externalName,
    })),
    accrualsEffective: rawAccruals.map((a) => ({
      id: a.id,
      commissionId: a.commissionId,
      periodIndex: a.periodIndex,
      status: a.status,
      periodStart: a.periodStart,
      amount: a.amount,
    })),
    ledgerEntries,
  });

  // 3. File to Drive: 00-Firm-Financials/_Snapshots/<stamp>/ . The snapshot files
  //    ARE the deliverable, so a Drive failure aborts (no dangling Artifact row).
  const root = await ensureFinancialsRootFolder();
  const snapsParent = await ensureSubfolderId(root, "_Snapshots");
  const stamp = folderStamp(takenAt);
  const folder = await createDatedFolder(snapsParent, stamp);
  const jsonFile = await uploadFile(json, "snapshot.json", folder.id, "application/json");
  for (const c of csvs) {
    await uploadFile(c.content.length ? c.content : "(no rows)", c.name, folder.id, "text/csv");
  }

  // 4. Persist: Artifact + AuditLog (+ figure-free Activity) in one transaction.
  const artifact = await prisma.$transaction(async (tx) => {
    const a = await tx.artifact.create({
      data: {
        type: "report",
        title: `Financial snapshot · ${stamp}`,
        driveUrl: folder.webViewLink,
        fileName: "snapshot.json",
        createdBy: label,
        generatedFromSkill: "run-full-snapshot",
        reviewStatus: "approved",
      },
    });
    await writeAudit(tx, {
      actor,
      action: "create.financial_snapshot",
      targetType: "Artifact",
      targetId: a.id,
      changes: { stamp, folderUrl: folder.webViewLink, snapshotJsonUrl: jsonFile.webViewLink, ...summary },
    });
    await writeActivity(tx, {
      actor,
      type: "doc",
      target: "Financials",
      detail: "Saved a pre-rebuild financial snapshot",
      link: "/financials",
    });
    return a;
  });

  revalidatePath("/financials");
  return { ok: true, folderUrl: folder.webViewLink, snapshotJsonUrl: jsonFile.webViewLink, artifactId: artifact.id, summary };
}
