import { Header } from "@/components/header";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { IngestView, type ProposalProp } from "@/components/ingest-view";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";

export default async function IngestPage() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;

  const [pending, partners, contacts, clients] = await Promise.all([
    prisma.ingestProposal.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
  ]);

  const proposals: ProposalProp[] = pending.map((p) => ({
    id: p.id,
    title: p.title,
    meetingDate: p.meetingDate.toISOString(),
    createdBy: p.createdBy,
    matchedContactId: p.matchedContactId,
    matchedClientId: p.matchedClientId,
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
