import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { DashboardViews } from "@/components/dashboard-views";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";

export default async function DashboardPage() {
  const [activeProjects, openDeals, openInvoices, activities, teamUpdates, news, contacts, clients] =
    await Promise.all([
      prisma.project.findMany({
        where: { status: { not: "closed" } },
        include: { client: true },
        orderBy: { startDate: "desc" },
      }),
      prisma.deal.findMany({
        where: { stage: { not: "signed" } },
      }),
      prisma.invoice.findMany({
        where: { status: { in: ["sent", "overdue"] } },
      }),
      prisma.activity.findMany({
        orderBy: { ts: "desc" },
        take: 8,
      }),
      prisma.teamUpdate.findMany({
        orderBy: { ts: "desc" },
      }),
      prisma.newsItem.findMany({
        orderBy: { ts: "desc" },
      }),
      // Lightweight lists powering the Quick Action record pickers.
      prisma.contact.findMany({
        select: { id: true, name: true, company: true },
        orderBy: { name: "asc" },
      }),
      prisma.client.findMany({
        select: { id: true, company: true },
        orderBy: { company: "asc" },
      }),
    ]);

  // Prisma Decimal (originationPct) can't be passed to a Client Component —
  // serialize to a plain number at the boundary.
  const activeProjectsSerialized = activeProjects.map((p) => ({
    ...p,
    originationPct: Number(p.originationPct),
  }));

  const atRiskCount = activeProjects.filter((p) => p.status === "at_risk" || p.status === "blocked").length;
  const openPipelineValue = openDeals.reduce((sum, d) => sum + d.valueEstimate, 0);
  const outstandingAR = openInvoices.reduce((sum, i) => sum + i.amount, 0);
  const overdueAR = openInvoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <Header eyebrow="The firm · This week" title="Operating dashboard." />

      <div className="px-8 py-8 flex flex-col gap-8">
        {/* Top-line stats */}
        <section className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Stat
              label="Active engagements"
              value={activeProjects.length}
              delta={`${atRiskCount} at risk`}
              gold={atRiskCount > 0}
            />
          </Card>
          <Card className="p-5">
            <Stat
              label="Open pipeline"
              value={formatCAD(openPipelineValue).replace("CA$", "$")}
              delta={`${openDeals.length} deals`}
            />
          </Card>
          <Card className="p-5">
            <Stat
              label="Outstanding AR"
              value={formatCAD(outstandingAR).replace("CA$", "$")}
              delta={overdueAR > 0 ? `${formatCAD(overdueAR).replace("CA$", "$")} overdue` : "On track"}
            />
          </Card>
        </section>

        <DashboardViews
          activeProjects={activeProjectsSerialized}
          activities={activities}
          teamUpdates={teamUpdates}
          news={news}
          contacts={contacts}
          deals={openDeals.map((d) => ({ id: d.id, company: d.company }))}
          clients={clients}
        />
      </div>
    </>
  );
}
