import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Header } from "@/components/header";
import { Label, Badge, Card, Stat, EmptyState } from "@/components/ui";
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

      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <Stat label="Active" value={active.length} />
          </Card>
          <Card className="p-5">
            <Stat label="Closed (archive)" value={closed.length} />
          </Card>
        </div>

        <Card>
          {projects.length === 0 ? (
            <EmptyState
              icon={<FolderKanban size={28} strokeWidth={1.5} />}
              title="No projects yet"
              hint="Active builds will appear here once a deal is converted into a project."
            />
          ) : (
            <>
              <div className="grid grid-cols-[1.5fr_1fr_1fr_120px] gap-6 px-6 py-3">
                <span className="text-[11px] text-bone-dim">Project</span>
                <span className="text-[11px] text-bone-dim">Phase</span>
                <span className="text-[11px] text-bone-dim">Timeline</span>
                <span className="text-[11px] text-bone-dim text-right">Status</span>
              </div>

              {projects.map((p) => {
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="grid grid-cols-[1.5fr_1fr_1fr_120px] gap-6 px-6 py-5 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
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
