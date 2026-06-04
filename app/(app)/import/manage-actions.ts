"use server";

// Master-list + report management: fetch a scan report's rankings, delete
// contacts (multi-select), and delete a scan report. All scoped to the partner.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { writeAudit, partnerActor } from "@/lib/audit";
import type { ImportLeadType, ImportContactCompleteness, ImportContactPromotion } from "@/lib/types";

export type ScanReportRow = {
  contactId: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  domain: string | null;
  linkedin: string | null;
  completeness: ImportContactCompleteness;
  promotion: ImportContactPromotion;
  score: number;
  leadType: ImportLeadType;
  rationale: string | null;
};

/** A scan report's rows: that scan's ScanResults joined to the master contacts. */
export async function getScanReport(scanRunId: string): Promise<ScanReportRow[]> {
  const { partnerId } = await requirePartner();
  const run = await prisma.scanRun.findFirst({
    where: { id: scanRunId, partnerLeadId: partnerId },
    select: { id: true },
  });
  if (!run) return [];

  const results = await prisma.scanResult.findMany({
    where: { scanRunId, partnerLeadId: partnerId },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    include: {
      importedContact: {
        select: {
          id: true, name: true, title: true, company: true, email: true,
          domain: true, linkedin: true, completeness: true, promotion: true,
        },
      },
    },
  });

  return results.map((r) => ({
    contactId: r.importedContactId,
    name: r.importedContact.name,
    title: r.importedContact.title,
    company: r.importedContact.company,
    email: r.importedContact.email,
    domain: r.importedContact.domain,
    linkedin: r.importedContact.linkedin,
    completeness: r.importedContact.completeness,
    promotion: r.importedContact.promotion,
    score: r.score,
    leadType: r.leadType,
    rationale: r.rationale,
  }));
}

/** Delete imported contacts (multi-select). Cascades their ScanResults; a
 *  contact that was already promoted leaves its firm-wide lead intact. */
export async function deleteImportedContacts(ids: string[]): Promise<{ deleted: number }> {
  const { partnerId, label } = await requirePartner();
  if (!ids.length) return { deleted: 0 };
  const res = await prisma.importedContact.deleteMany({
    where: { id: { in: ids }, partnerLeadId: partnerId },
  });
  await writeAudit(prisma, {
    actor: partnerActor(partnerId, label),
    action: "delete.importedContacts",
    targetType: "ImportedContact",
    changes: { count: res.count },
  }).catch(() => {});
  revalidatePath("/import");
  return { deleted: res.count };
}

/** Delete a scan report (the run + its result rows; the master contacts stay). */
export async function deleteScanReport(scanRunId: string): Promise<{ ok: true }> {
  const { partnerId, label } = await requirePartner();
  const run = await prisma.scanRun.findFirst({
    where: { id: scanRunId, partnerLeadId: partnerId },
    select: { id: true, title: true },
  });
  if (!run) throw new Error("Report not found");
  await prisma.scanRun.delete({ where: { id: run.id } }); // cascades ScanResults
  await writeAudit(prisma, {
    actor: partnerActor(partnerId, label),
    action: "delete.scanReport",
    targetType: "ScanRun",
    targetId: scanRunId,
    changes: { title: run.title },
  }).catch(() => {});
  revalidatePath("/import");
  return { ok: true };
}
