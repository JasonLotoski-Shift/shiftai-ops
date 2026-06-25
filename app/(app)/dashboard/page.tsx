import { Header } from "@/components/header";
import { Card, Stat } from "@/components/ui";
import { DashboardViews } from "@/components/dashboard-views";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";

export default async function DashboardPage() {
  const [activeProjects, dealStats, invoiceTotals, openDeals, activities, teamUpdates, news, contacts, clients] =
    await Promise.all([
      prisma.project.findMany({
        where: { status: { not: "closed" } },
        // Only the columns the engagements list renders.
        select: {
          id: true,
          name: true,
          phase: true,
          status: true,
          originationPct: true,
          client: { select: { company: true } },
        },
        orderBy: { startDate: "desc" },
      }),
      // Top-line pipeline figure straight from the DB — don't pull full deal
      // rows just to sum + count them.
      prisma.deal.aggregate({
        where: { stage: { not: "signed" } },
        _sum: { valueEstimate: true },
        _count: true,
      }),
      // AR totals grouped by status (sent + overdue) — summed in the DB.
      prisma.invoice.groupBy({
        by: ["status"],
        where: { status: { in: ["sent", "overdue"] } },
        _sum: { amount: true },
      }),
      // Lightweight deal list for the Quick Action picker (id + company only).
      prisma.deal.findMany({
        where: { stage: { not: "signed" } },
        select: { id: true, company: true },
        orderBy: { company: "asc" },
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
  // serialize to a plain number at the boundary. Built explicitly because the
  // project query is now a narrowed select.
  const activeProjectsSerialized = activeProjects.map((p) => ({
    id: p.id,
    name: p.name,
    phase: p.phase,
    status: p.status,
    client: p.client,
    originationPct: Number(p.originationPct),
  }));

  const atRiskCount = activeProjects.filter((p) => p.status === "at_risk" || p.status === "blocked").length;
  const openPipelineValue = dealStats._sum.valueEstimate ?? 0;
  const outstandingAR = invoiceTotals.reduce((sum, g) => sum + (g._sum.amount ?? 0), 0);
  const overdueAR = invoiceTotals.find((g) => g.status === "overdue")?._sum.amount ?? 0;

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
              delta={`${dealStats._count} deals`}
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
          deals={openDeals}
          clients={clients}
        />
      </div>
    </>
  );
}
