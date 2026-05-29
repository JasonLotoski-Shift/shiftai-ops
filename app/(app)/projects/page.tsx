import Link from "next/link";
import { Header } from "@/components/header";
import { Label, Badge, Card } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: { client: true, partnerLead: true },
    orderBy: { startDate: "desc" },
  });

  const active = projects.filter((p) => p.status !== "closed");
  const closed = projects.filter((p) => p.status === "closed");

  return (
    <>
      <Header eyebrow="Active builds" title="Projects." />

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Active</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{active.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Closed (archive)</Label>
          <span className="mono text-[24px] text-bone-dim tabular-nums">{closed.length}</span>
        </div>
      </div>

      <div className="px-8 py-8 flex flex-col gap-3">
        {projects.map((p) => {
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-bone-mute transition-colors">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_120px] gap-6 px-6 py-5">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="text-[15px] text-bone truncate">{p.name}</div>
                    <div className="text-[11px] text-bone-mute">{p.client.company}</div>
                  </div>
                  <div className="flex flex-col gap-1 self-center">
                    <Label>Phase</Label>
                    <Badge tone={p.phase === "build" ? "gold" : p.phase === "run" ? "steel" : "bone"}>
                      {p.phase}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1 self-center">
                    <Label>Timeline</Label>
                    <span className="mono text-[12px] text-bone-dim tabular-nums">
                      {formatDate(p.startDate).split(",")[0]} → {formatDate(p.targetEndDate).split(",")[0]}
                    </span>
                  </div>
                  <div className="flex items-center justify-end self-center">
                    <Badge tone={p.status === "on_track" ? "steel" : p.status === "at_risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                      {p.status.replace("_", "-")}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
