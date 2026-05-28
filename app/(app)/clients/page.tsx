import Link from "next/link";
import { Header } from "@/components/header";
import { Label, Badge, Card } from "@/components/ui";
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

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Active clients</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{clients.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Total contract value</Label>
          <span className="mono text-[24px] text-track-gold tabular-nums">
            {formatCAD(totalContractValue).replace("CA$", "$")}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— At-risk</Label>
          <span className="mono text-[24px] text-flag-red tabular-nums">{atRiskCount}</span>
        </div>
      </div>

      <div className="px-8 py-8">
        <Card>
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-4 px-5 py-3 border-b border-graphite">
            <span className="label">Client</span>
            <span className="label">Industry</span>
            <span className="label">Revenue</span>
            <span className="label">Contract</span>
            <span className="label">Partner lead</span>
            <span className="label text-right">Status</span>
          </div>

          {clients.map((c) => {
            const activeCount = c.projects.length;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_120px] gap-4 px-5 py-4 border-b border-graphite last:border-0 hover:bg-graphite/40 transition-colors"
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
                  <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim">
                    {c.partnerLead.initials}
                  </div>
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
        </Card>
      </div>
    </>
  );
}
