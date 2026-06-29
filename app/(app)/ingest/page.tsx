import { Header } from "@/components/header";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { IngestView, type ProposalProp, type IngestPayoutOption } from "@/components/ingest-view";
import type { ExtractedProposal } from "@/app/(app)/ingest/actions";
import { isUnifiedProposal, type IngestTargetKind, type UnifiedProposal } from "@/lib/ingest/types";

// The extractUnified server action (composer-actions.ts) runs under this route.
// A large document's ingest Claude call takes ~55-120s; the default 60s function
// ceiling killed it. Lift it to 300s (active on our Vercel Pro plan — Hobby would
// clamp this to 60s). Matches the prototype-engine fix.
export const maxDuration = 300;

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

  const [pending, partners, consultants, contacts, clients, projects, deals, isMP] = await Promise.all([
    prisma.ingestProposal.findMany({
      // Scope-pricing proposals are reviewed on their project page, not here.
      // NOTE: a `NOT`/`not` filter on a NULLABLE field excludes NULL rows in
      // Prisma — so null-ingestType proposals (Fireflies + pasted meetings)
      // must be OR'd in explicitly, or they silently never show on Ingest.
      where: {
        status: "pending",
        OR: [{ ingestType: null }, { ingestType: { not: "scope-pricing" } }],
      },
      // Only the columns the review list renders — omits the heavy `transcript`
      // (full Gmail thread body); the approve/detail path re-fetches it by id.
      select: {
        id: true,
        source: true,
        title: true,
        meetingDate: true,
        createdBy: true,
        matchedContactId: true,
        matchedClientId: true,
        matchedProjectId: true,
        matchedDealId: true,
        proposal: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.consultant.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({ select: { id: true, name: true, company: true }, orderBy: { name: "asc" } }),
    prisma.client.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    prisma.project.findMany({
      select: { id: true, name: true, client: { select: { company: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.deal.findMany({ select: { id: true, company: true, stage: true }, orderBy: { lastTouchAt: "desc" } }),
    currentIsManagingPartner(),
  ]);

  const projectLabels: Record<string, string> = Object.fromEntries(
    projects.map((p) => [p.id, `${p.client.company} · ${p.name}`]),
  );

  // Phase 2: for managing partners only, gather the unlinked contractor payouts on
  // each matched project so the ingest card can offer "link this invoice to the
  // payout(s) it documents" when filing a vendor bill. Non-MPs never see payout
  // amounts here (the picker is gated client-side AND this fetch is skipped).
  const matchedProjectIds = [...new Set(pending.map((p) => p.matchedProjectId).filter((x): x is string => !!x))];
  const payoutsByProject: Record<string, IngestPayoutOption[]> = {};
  if (isMP && matchedProjectIds.length) {
    const payoutRows = await prisma.consultantPayout.findMany({
      where: { projectId: { in: matchedProjectIds }, settledByBillId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, status: true, projectId: true, consultant: { select: { name: true } } },
    });
    for (const r of payoutRows) {
      (payoutsByProject[r.projectId] ??= []).push({ id: r.id, consultantName: r.consultant.name, amount: r.amount, status: r.status });
    }
  }

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
        consultants={consultants}
        contacts={contacts}
        clients={clients}
        projects={projectOpts}
        deals={dealOpts}
        currentPartnerId={partnerId}
        canLinkPayouts={isMP}
        payoutsByProject={payoutsByProject}
        initialFocus={initialFocus}
      />
    </>
  );
}
