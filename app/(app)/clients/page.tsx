import { Briefcase } from "lucide-react";
import { Header } from "@/components/header";
import { Card, Stat, EmptyState } from "@/components/ui";
import { AddClient } from "@/components/add-client";
import { ClientsList, type ClientRow } from "@/components/clients-list";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";
import type { Industry, EngagementStatus } from "@/lib/types";

export default async function ClientsPage() {
  const [clients, contacts, partners, session] = await Promise.all([
    prisma.client.findMany({
      // Only the columns the list row renders. The open-project tally is the
      // sole use of the projects relation, so a `_count` (same where-clause)
      // replaces materializing id rows.
      select: {
        id: true,
        company: true,
        industry: true,
        subIndustry: true,
        revenue: true,
        contractValue: true,
        status: true,
        partnerLead: { select: { initials: true, name: true } },
        _count: { select: { projects: { where: { status: { not: "closed" } } } } },
      },
      orderBy: { contractSignedAt: "desc" },
    }),
    prisma.contact.findMany({
      select: { id: true, name: true, company: true, industry: true },
      orderBy: { name: "asc" },
    }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);

  const totalContractValue = clients.reduce((s, c) => s + c.contractValue, 0);
  const atRiskCount = clients.filter((c) => c.status === "at_risk" || c.status === "blocked").length;

  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    company: c.company,
    industry: c.industry as Industry,
    subIndustry: c.subIndustry ?? null,
    revenue: c.revenue,
    contractValue: c.contractValue,
    // DB stores hyphenated via @map, but the client returns underscored
    // identifiers — convert to the UI EngagementStatus form for display/match.
    status: c.status.replace("_", "-") as EngagementStatus,
    activeProjects: c._count.projects,
    partnerLeadInitials: c.partnerLead.initials,
    partnerLeadFirstName: c.partnerLead.name.split(" ")[0],
  }));

  return (
    <>
      <Header
        eyebrow="Active engagements"
        title="Clients."
        actions={
          <AddClient
            contacts={contacts}
            partners={partners}
            defaultPartnerId={session?.user?.partnerId}
          />
        }
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Stat label="Active clients" value={clients.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Total contract value" value={formatCAD(totalContractValue).replace("CA$", "$")} gold />
          </Card>
          <Card className="p-5">
            <Stat label="At-risk" value={atRiskCount} />
          </Card>
        </div>

        <Card>
          {clients.length === 0 ? (
            <EmptyState
              icon={<Briefcase size={28} strokeWidth={1.5} />}
              title="No active clients"
              hint="Converted deals show up here as engagements."
            />
          ) : (
            <ClientsList clients={rows} />
          )}
        </Card>
      </div>
    </>
  );
}
