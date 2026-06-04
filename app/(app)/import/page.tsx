import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { ImportView, type ReportMeta } from "@/components/import-view";
import type { MasterRow } from "@/components/import-master-table";
import type { SegmentSeed } from "@/components/new-scan-modal";
import type { ScanCriteria } from "@/lib/types";

// Background scan (submit) runs inside after(); give it wall-clock budget.
export const maxDuration = 300;

// How many master rows we hydrate into the client table.
const TABLE_CAP = 1000;

export default async function ImportPage() {
  // Gate + scope: every query below is the signed-in partner's PRIVATE data.
  const { partnerId } = await requirePartner();

  const [batchCount, contacts, totalContacts, segments, scanRuns, activeScan] = await Promise.all([
    prisma.importBatch.count({ where: { partnerLeadId: partnerId } }),
    prisma.importedContact.findMany({
      where: { partnerLeadId: partnerId },
      orderBy: [{ scanScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: TABLE_CAP,
      select: {
        id: true, name: true, title: true, company: true, email: true,
        domain: true, completeness: true, promotion: true, scanStatus: true,
      },
    }),
    prisma.importedContact.count({ where: { partnerLeadId: partnerId } }),
    prisma.targetSegment.findMany({
      where: { active: true },
      orderBy: { priority: "desc" },
      select: {
        id: true, name: true, industries: true, employeeMin: true, employeeMax: true,
        revenueMin: true, revenueMax: true, geographies: true, buyingSignals: true,
      },
    }),
    prisma.scanRun.findMany({
      where: { partnerLeadId: partnerId },
      orderBy: { startedAt: "desc" },
      take: 30,
      select: { id: true, title: true, status: true, scoredCount: true, totalCount: true, criteria: true },
    }),
    prisma.scanRun.findFirst({
      where: { partnerLeadId: partnerId, status: { in: ["pending", "submitted", "scoring"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    }),
  ]);

  const masterRows: MasterRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title ?? null,
    company: c.company ?? null,
    email: c.email ?? null,
    domain: c.domain ?? null,
    completeness: c.completeness,
    promotion: c.promotion,
    scanned: c.scanStatus === "scored",
  }));

  const segmentSeeds: SegmentSeed[] = segments.map((s) => ({
    id: s.id,
    name: s.name,
    industries: s.industries,
    employeeMin: s.employeeMin,
    employeeMax: s.employeeMax,
    revenueMin: s.revenueMin,
    revenueMax: s.revenueMax,
    geographies: s.geographies,
    keywords: s.buyingSignals,
  }));

  const reports: ReportMeta[] = scanRuns.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    scoredCount: r.scoredCount,
    totalCount: r.totalCount,
    criteria: (r.criteria as unknown as ScanCriteria) ?? null,
  }));

  return (
    <>
      <Header eyebrow="People · Private import" title="Import contacts." />

      <div className="px-8 py-8 flex flex-col gap-8">
        <p className="text-[13px] text-bone-dim max-w-[680px] leading-relaxed">
          Upload a contact export (LinkedIn, Google Contacts, or any CSV). These contacts are{" "}
          <span className="text-bone">private to you</span>. Build your master list, then run scans
          with custom criteria — each scan becomes its own ranked report you can review, promote
          from, or delete.
        </p>

        <ImportView
          masterRows={masterRows}
          totalContacts={totalContacts}
          cap={TABLE_CAP}
          batchCount={batchCount}
          reports={reports}
          segments={segmentSeeds}
          activeScanRunId={activeScan?.id ?? null}
        />
      </div>
    </>
  );
}
