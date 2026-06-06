import { Header } from "@/components/header";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { IngestView, type ProposalProp } from "@/components/ingest-view";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";
import { isUnifiedProposal, type IngestTargetKind, type UnifiedProposal } from "@/lib/ingest/types";

const TARGET_KINDS: IngestTargetKind[] = ["contact", "client", "project", "deal"];

export default async function IngestPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const session = await auth();
  const partnerId = session?.user?.partnerId;

  const { focus } = await searchParams;

  // Parse ?focus=<kind>:<id> into a typed pre-selection for the composer.
  let initialFocus: { kind: IngestTargetKind; id: string } | null = null;
  if (focus) {
    const [kind, id] = focus.split(":");
    if (id && (TARGET_KINDS as string[]).includes(kind)) {
      initialFocus = { kind: kind as IngestTargetKind, id };
    }
  }

  const [pending, partners, contacts, clients, projects, deals] = await Promise.all([
    prisma.ingestProposal.findMany({
      // Scope-pricing proposals are reviewed on their project page, not here.
      // NOTE: a `NOT`/`not` filter on a NULLABLE field excludes NULL rows in
      // Prisma — so null-ingestType proposals (Fireflies + pasted meetings)
      // must be OR'd in explicitly, or they silently never show on Ingest.
      where: {
        status: "pending",
        OR: [{ ingestType: null }, { ingestType: { not: "scope-pricing" } }],
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    prisma.project.findMany({
      select: { id: true, name: true, client: { select: { company: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.findMany({ select: { id: true, company: true, stage: true }, orderBy: { lastTouchAt: "desc" } }),
  ]);

  const projectLabels: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, `${p.client.company} · ${p.name}`]),
  );

  const proposals: ProposalProp[] = pending.map((p) => {
    const raw = p.proposal as unknown;
    const unified = isUnifiedProposal(raw);
    return {
      id: p.id,
      source: p.source,
      title: p.title,
      meetingDate: p.meetingDate.toISOString(),
      createdBy: p.createdBy,
      matchedContactId: p.matchedContactId,
      matchedClientId: p.matchedClientId,
      matchedProjectId: p.matchedProjectId,
      matchedDealId: p.matchedDealId ?? null,
      projectLabel: p.matchedProjectId ? projectLabels[p.matchedProjectId] ?? null : null,
      proposal: raw as ExtractedProposal,
      schemaVersion: unified ? 2 : undefined,
      data: unified ? (raw as UnifiedProposal) : undefined,
    };
  });

  const projectOpts = projects.map((p) => ({ id: p.id, name: projectLabels[p.id] ?? p.name }));
  const dealOpts = deals.map((d) => ({ id: d.id, name: `${d.company} · ${d.stage.replace(/_/g, "-")}` }));

  return (
    <>
      <Header eyebrow="Firm · Ingest" title="Ingest." />
      <IngestView
        proposals={proposals}
        partners={partners}
        contacts={contacts}
        clients={clients}
        projects={projectOpts}
        deals={dealOpts}
        currentPartnerId={partnerId}
        initialFocus={initialFocus}
      />
    </>
  );
}
