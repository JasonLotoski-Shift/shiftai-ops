import { Header } from "@/components/header";
import { Button } from "@/components/ui";
import { PipelineTabs } from "@/components/pipeline-tabs";
import { AddDeal } from "@/components/add-deal";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stageAgeTier } from "@/lib/format";
import type { ProspectLead, ProspectPerson } from "@/lib/types";
import { Filter } from "lucide-react";

type LeadRow = Awaited<ReturnType<typeof loadLeads>>[number];

function loadLeads() {
  return prisma.prospectLead.findMany({
    include: { segment: { select: { id: true, name: true } } },
    orderBy: { score: "desc" },
  });
}

function toLead(row: LeadRow): ProspectLead {
  return {
    id: row.id,
    companyName: row.companyName,
    domain: row.domain,
    website: row.website ?? undefined,
    industryTags: row.industryTags,
    revenueEstimate: row.revenueEstimate ?? undefined,
    employeeEstimate: row.employeeEstimate ?? undefined,
    headquarters: row.headquarters ?? undefined,
    segmentId: row.segmentId ?? undefined,
    segmentName: row.segment?.name ?? undefined,
    score: row.score,
    rationale: row.rationale,
    disqualified: row.disqualified,
    status: row.status,
    people: (row.people as unknown as ProspectPerson[]) ?? [],
    foundBy: row.foundBy,
    sources: (row.sources as Record<string, unknown> | null) ?? null,
    createdBy: row.createdBy,
    generatedFromSkill: row.generatedFromSkill ?? undefined,
    convertedContactId: row.convertedContactId ?? undefined,
    convertedDealId: row.convertedDealId ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    outreachSubject: row.outreachSubject ?? undefined,
    outreachDraft: row.outreachDraft ?? undefined,
    outreachPersonIndex: row.outreachPersonIndex ?? undefined,
    outreachSentAt: row.outreachSentAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; segment?: string }>;
}) {
  const { tab, segment } = await searchParams;
  const [deals, contacts, partners, leadRows, session] = await Promise.all([
    prisma.deal.findMany({
      include: { contact: true, partnerLead: true },
      orderBy: { closeTargetDate: "asc" },
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, industry: true },
      orderBy: { lastTouchAt: "desc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    loadLeads(),
    auth(),
  ]);

  const openDeals = deals.filter((d) => d.stage !== "signed");
  const totalValue = openDeals.reduce((s, d) => s + d.valueEstimate, 0);
  const staleCount = openDeals.filter((d) => stageAgeTier(d.stageEnteredAt) === "stale").length;

  const allLeads = leadRows.map(toLead);
  const foundLeads = allLeads.filter((l) => l.status === "pending" && !l.disqualified);
  const filteredLeads = allLeads.filter((l) => l.status === "ghost" || l.disqualified);

  return (
    <>
      <Header
        eyebrow="Pipeline · CRM"
        title="The board."
        actions={
          <>
            <Button variant="ghost" size="sm">
              <Filter size={13} strokeWidth={1.5} />
              Filter
            </Button>
            <AddDeal contacts={contacts} partners={partners} defaultPartnerId={session?.user?.partnerId} />
          </>
        }
      />

      <PipelineTabs
        deals={deals}
        stats={{ totalValue, openDeals: openDeals.length, staleCount }}
        foundLeads={foundLeads}
        filteredLeads={filteredLeads}
        initialTab={tab === "found" ? "leads" : "board"}
        segment={segment}
      />
    </>
  );
}
