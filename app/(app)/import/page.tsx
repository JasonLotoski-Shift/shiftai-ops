import { Header } from "@/components/header";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { ImportUpload } from "@/components/import-upload";
import { ImportedContactsTable, type ImportedRow } from "@/components/imported-contacts-table";

// Background scan (Phase 3) submits inside after(); give it wall-clock budget.
export const maxDuration = 300;

// How many rows we hydrate into the client table. The full set still lives in
// the DB (and the scan reads it server-side); this only caps what we ship to
// the browser for the filterable view.
const TABLE_CAP = 1000;

export default async function ImportPage() {
  // Gate + scope: every query below is the signed-in partner's PRIVATE data.
  const { partnerId } = await requirePartner();

  const [batches, contacts, totalContacts, segments, activeScan] = await Promise.all([
    prisma.importBatch.findMany({
      where: { partnerLeadId: partnerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.importedContact.findMany({
      where: { partnerLeadId: partnerId },
      orderBy: [{ scanScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: TABLE_CAP,
    }),
    prisma.importedContact.count({ where: { partnerLeadId: partnerId } }),
    prisma.targetSegment.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { priority: "desc" },
    }),
    prisma.scanRun.findFirst({
      where: { partnerLeadId: partnerId, status: { in: ["pending", "submitted", "scoring"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    }),
  ]);

  const segmentNames: Record<string, string> = Object.fromEntries(
    segments.map((s) => [s.id, s.name]),
  );

  const rows: ImportedRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title ?? null,
    company: c.company ?? null,
    email: c.email ?? null,
    domain: c.domain ?? null,
    linkedin: c.linkedin ?? null,
    completeness: c.completeness,
    scanStatus: c.scanStatus,
    scanScore: c.scanScore ?? null,
    leadType: c.leadType ?? null,
    matchedSegmentId: c.matchedSegmentId ?? null,
    scanRationale: c.scanRationale ?? null,
    promotion: c.promotion,
    promotedProspectLeadId: c.promotedProspectLeadId ?? null,
  }));

  const pendingScanCount = contacts.filter(
    (c) => c.completeness === "complete" && c.scanStatus === "pending",
  ).length;

  return (
    <>
      <Header eyebrow="People · Private import" title="Import contacts." />

      <div className="px-8 py-8 flex flex-col gap-8">
        <p className="text-[13px] text-bone-dim max-w-[680px] leading-relaxed">
          Upload a contact export (LinkedIn connections, Google Contacts, or any CSV). These
          contacts are <span className="text-bone">private to you</span> — no other partner sees
          them. Once imported, run a scan to rank them for fit, then push the strong ones into the
          firm pipeline.
        </p>

        <ImportUpload />

        <ImportedContactsTable
          rows={rows}
          totalContacts={totalContacts}
          cap={TABLE_CAP}
          batchCount={batches.length}
          segmentNames={segmentNames}
          hasSegments={segments.length > 0}
          activeScanRunId={activeScan?.id ?? null}
          pendingScanCount={pendingScanCount}
        />
      </div>
    </>
  );
}
