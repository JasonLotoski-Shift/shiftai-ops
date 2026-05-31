import { Header } from "@/components/header";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { IngestView, type ProposalProp } from "@/components/ingest-view";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";

export default async function IngestPage() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;

  const [pending, partners, contacts, clients, projects] = await Promise.all([
    prisma.ingestProposal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    prisma.project.findMany({
      select: { id: true, name: true, client: { select: { company: true } } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const projectLabels: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, `${p.client.company} · ${p.name}`]),
  );

  const proposals: ProposalProp[] = pending.map((p) => ({
    id: p.id,
    source: p.source,
    title: p.title,
    meetingDate: p.meetingDate.toISOString(),
    createdBy: p.createdBy,
    matchedContactId: p.matchedContactId,
    matchedClientId: p.matchedClientId,
    matchedProjectId: p.matchedProjectId,
    projectLabel: p.matchedProjectId ? projectLabels[p.matchedProjectId] ?? null : null,
    proposal: p.proposal as unknown as ExtractedProposal,
  }));

  return (
    <>
      <Header eyebrow="Firm · Meeting ingest" title="Meeting ingest." />
      <IngestView
        proposals={proposals}
        partners={partners}
        contacts={contacts}
        clients={clients}
        currentPartnerId={partnerId}
      />
    </>
  );
}
