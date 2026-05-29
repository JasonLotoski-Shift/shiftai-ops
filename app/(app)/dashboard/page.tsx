import { Header } from "@/components/header";
import { Stat } from "@/components/ui";
import { DashboardViews } from "@/components/dashboard-views";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";

export default async function DashboardPage() {
  const [activeProjects, openDeals, openInvoices, activities, teamUpdates, news] = await Promise.all([
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
  ]);

  const atRiskCount = activeProjects.filter((p) => p.status === "at_risk" || p.status === "blocked").length;
  const openPipelineValue = openDeals.reduce((sum, d) => sum + d.valueEstimate, 0);
  const outstandingAR = openInvoices.reduce((sum, i) => sum + i.amount, 0);
  const overdueAR = openInvoices.filter((i) => i.status === "overdue").reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <Header eyebrow="The firm · This week" title="Operating dashboard." />

      <div className="px-8 py-8 flex flex-col gap-10">
        {/* Top-line stats */}
        <section className="grid grid-cols-3 gap-px bg-graphite border border-graphite">
          <div className="bg-bitumen p-6">
            <Stat
              label="— Active engagements"
              value={activeProjects.length}
              delta={`${atRiskCount} at risk`}
              gold={atRiskCount > 0}
            />
          </div>
          <div className="bg-bitumen p-6">
            <Stat
              label="— Open pipeline"
              value={formatCAD(openPipelineValue).replace("CA$", "$")}
              delta={`${openDeals.length} deals`}
            />
          </div>
          <div className="bg-bitumen p-6">
            <Stat
              label="— Outstanding AR"
              value={formatCAD(outstandingAR).replace("CA$", "$")}
              delta={overdueAR > 0 ? `${formatCAD(overdueAR).replace("CA$", "$")} overdue` : "On track"}
            />
          </div>
        </section>

        <DashboardViews
          activeProjects={activeProjects}
          activities={activities}
          teamUpdates={teamUpdates}
          news={news}
        />
      </div>
    </>
  );
}
