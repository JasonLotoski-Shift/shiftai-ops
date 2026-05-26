import { Header } from "@/components/header";
import { Stat } from "@/components/ui";
import { DashboardViews } from "@/components/dashboard-views";
import { projects, deals, invoices, formatCAD } from "@/lib/data/seed";

export default function DashboardPage() {
  const active = projects.filter((p) => p.status !== "closed");
  const atRisk = active.filter((p) => p.status === "at-risk" || p.status === "blocked");
  const openPipelineValue = deals
    .filter((d) => d.stage !== "signed")
    .reduce((sum, d) => sum + d.valueEstimate, 0);
  const outstandingAR = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amount, 0);
  const overdueAR = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + i.amount, 0);

  return (
    <>
      <Header eyebrow="The firm · This week" title="Operating dashboard." />

      <div className="px-8 py-8 flex flex-col gap-10">
        {/* Top-line stats — persistent across both views */}
        <section className="grid grid-cols-4 gap-px bg-graphite border border-graphite">
          <div className="bg-bitumen p-6">
            <Stat
              label="— Active engagements"
              value={active.length}
              delta={`${atRisk.length} at risk`}
              gold={atRisk.length > 0}
            />
          </div>
          <div className="bg-bitumen p-6">
            <Stat
              label="— Open pipeline"
              value={formatCAD(openPipelineValue).replace("CA$", "$")}
              delta={`${deals.filter((d) => d.stage !== "signed").length} deals`}
            />
          </div>
          <div className="bg-bitumen p-6">
            <Stat
              label="— Outstanding AR"
              value={formatCAD(outstandingAR).replace("CA$", "$")}
              delta={overdueAR > 0 ? `${formatCAD(overdueAR).replace("CA$", "$")} overdue` : "On track"}
            />
          </div>
          <div className="bg-bitumen p-6">
            <Stat label="— Hours this week" value="38.4" delta="+12% vs last wk" />
          </div>
        </section>

        <DashboardViews />
      </div>
    </>
  );
}
