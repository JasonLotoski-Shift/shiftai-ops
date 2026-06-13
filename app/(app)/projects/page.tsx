import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Header } from "@/components/header";
import { Label, Badge, Card, Stat, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { TYPE_LABELS } from "@/components/project-type-edit";
import { DeliveryTimeline, type TimelineMarker } from "@/components/delivery-timeline";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: {
      client: true,
      partnerLead: true,
      milestones: {
        select: { id: true, title: true, status: true, dueDate: true },
        orderBy: { dueDate: "asc" },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const active = projects.filter((p) => p.status !== "closed");
  const closed = projects.filter((p) => p.status === "closed");

  // Next-2 milestones = open (status !== complete), dated, due today-or-later,
  // soonest first. Milestones are always gold on the timeline (colour denotes
  // the kind of marker, not its state) — matching project-timeline.tsx.
  const todayMs = Date.now();

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
              <div className="grid grid-cols-[1.3fr_140px_1.4fr_120px] gap-6 px-6 py-3">
                <span className="text-[11px] text-bone-dim">Project</span>
                <span className="text-[11px] text-bone-dim">Type</span>
                <span className="text-[11px] text-bone-dim">Timeline</span>
                <span className="text-[11px] text-bone-dim text-right">Status</span>
              </div>

              {projects.map((p) => {
                const typeLabel = p.projectType ? TYPE_LABELS[p.projectType] ?? p.projectType.replace(/_/g, "-") : null;

                // Next two open, dated milestones (today-or-later), soonest first.
                const nextMilestones = p.milestones
                  .filter((m) => m.status !== "complete" && m.dueDate != null && m.dueDate.getTime() >= todayMs)
                  .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
                  .slice(0, 2);

                // Compact timeline bar — only the next-2 milestones as dots.
                const markers: TimelineMarker[] = nextMilestones.map((m, i) => ({
                  id: m.id,
                  kind: "milestone",
                  date: m.dueDate!,
                  numberLabel: `M${i + 1}`,
                  title: m.title,
                  detail: m.status.replace("_", "-"),
                  tone: "gold",
                }));

                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="grid grid-cols-[1.3fr_140px_1.4fr_120px] gap-6 px-6 py-5 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="text-[15px] text-bone truncate">{p.name}</div>
                      <div className="text-[11px] text-bone-mute">{p.client.company}</div>
                    </div>
                    <div className="flex flex-col gap-1 self-center">
                      <Label>Type</Label>
                      {typeLabel ? (
                        <Badge tone="gold">{typeLabel}</Badge>
                      ) : (
                        <span className="text-[11px] text-bone-mute">Not set</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 self-center min-w-0">
                      {markers.length > 0 ? (
                        <DeliveryTimeline
                          startDate={p.startDate}
                          targetEndDate={p.targetEndDate}
                          markers={markers}
                          compact
                        />
                      ) : (
                        <span className="mono text-[12px] text-bone-dim tabular-nums">
                          {formatDate(p.startDate).split(",")[0]} → {formatDate(p.targetEndDate).split(",")[0]}
                        </span>
                      )}
                      {nextMilestones.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {nextMilestones.map((m, i) => (
                            <span key={m.id} className="text-[11px] text-bone-mute truncate">
                              <span className="mono text-track-gold mr-1.5">M{i + 1}</span>
                              {m.title}
                              <span className="text-bone-dim"> · {formatDate(m.dueDate!).split(",")[0]}</span>
                            </span>
                          ))}
                        </div>
                      )}
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
