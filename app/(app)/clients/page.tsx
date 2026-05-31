import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Header } from "@/components/header";
import { Badge, Card, Stat, Avatar, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";
import { industryLabels } from "@/lib/data/seed";

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    include: {
      partnerLead: true,
      projects: { where: { status: { not: "closed" } }, select: { id: true } },
    },
    orderBy: { contractSignedAt: "desc" },
  });

  const totalContractValue = clients.reduce((s, c) => s + c.contractValue, 0);
  const atRiskCount = clients.filter((c) => c.status === "at_risk" || c.status === "blocked").length;

  return (
    <>
      <Header eyebrow="Active engagements" title="Clients." />

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
              icon={Briefcase}
              title="No active clients"
              hint="Converted deals show up here as engagements."
            />
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3">
                <span className="text-[11px] text-bone-dim">Client</span>
                <span className="text-[11px] text-bone-dim">Industry</span>
                <span className="text-[11px] text-bone-dim">Revenue</span>
                <span className="text-[11px] text-bone-dim">Contract</span>
                <span className="text-[11px] text-bone-dim">Partner lead</span>
                <span className="text-[11px] text-bone-dim text-right">Status</span>
              </div>

              {clients.map((c) => {
            const activeCount = c.projects.length;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[14px] text-bone truncate">{c.company}</span>
                  <span className="text-[11px] text-bone-mute truncate">
                    {activeCount} active project{activeCount !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="self-center"><Badge tone="bone">{industryLabels[c.industry]}</Badge></div>
                <span className="mono text-[13px] text-bone-dim tabular-nums self-center">{c.revenue}</span>
                <span className="mono text-[13px] text-track-gold tabular-nums self-center">
                  {formatCAD(c.contractValue).replace("CA$", "$")}
                </span>
                <div className="flex items-center gap-2 self-center">
                  <Avatar initials={c.partnerLead.initials} size="sm" />
                  <span className="text-[12px] text-bone-dim truncate">{c.partnerLead.name.split(" ")[0]}</span>
                </div>
                <div className="flex justify-end self-center">
                  <Badge tone={c.status === "on_track" ? "steel" : c.status === "at_risk" ? "gold" : c.status === "blocked" ? "red" : "neutral"}>
                    {c.status.replace("_", "-")}
                  </Badge>
                </div>
              </Link>
            );
          })}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
