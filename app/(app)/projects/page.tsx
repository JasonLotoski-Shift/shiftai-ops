import Link from "next/link";
import { Header } from "@/components/header";
import { Label, Badge, Card } from "@/components/ui";
import {
  projects,
  clientById,
  partnerById,
  formatDate,
  formatCAD,
} from "@/lib/data/seed";

export default function ProjectsPage() {
  const active = projects.filter((p) => p.status !== "closed");
  const totalHours = active.reduce((s, p) => s + p.hoursLogged, 0);
  const totalBudget = active.reduce((s, p) => s + p.budgetHours, 0);

  return (
    <>
      <Header eyebrow="Active builds" title="Projects." />

      <div className="px-8 py-6 border-b border-graphite flex items-center gap-8">
        <div className="flex flex-col gap-1">
          <Label>— Active</Label>
          <span className="mono text-[24px] text-bone tabular-nums">{active.length}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Hours logged · this engagement set</Label>
          <span className="mono text-[24px] text-bone tabular-nums">
            {totalHours} <span className="text-bone-mute text-[14px]">/ {totalBudget}</span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <Label>— Closed (archive)</Label>
          <span className="mono text-[24px] text-bone-dim tabular-nums">
            {projects.filter((p) => p.status === "closed").length}
          </span>
        </div>
      </div>

      <div className="px-8 py-8 flex flex-col gap-3">
        {projects.map((p) => {
          const client = clientById(p.clientId);
          const partner = partnerById(p.partnerLeadId);
          const burn = (p.hoursLogged / p.budgetHours) * 100;
          const overBudget = burn > 90;
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-bone-mute transition-colors">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_120px] gap-6 px-6 py-5">
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="text-[15px] text-bone truncate">{p.name}</div>
                    <div className="text-[11px] text-bone-mute">{client?.company}</div>
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
                  <div className="flex flex-col gap-1 self-center">
                    <Label>Hours</Label>
                    <span className={`mono text-[13px] tabular-nums ${overBudget ? "text-flag-red" : "text-bone"}`}>
                      {p.hoursLogged} / {p.budgetHours}
                    </span>
                    <div className="h-[2px] bg-graphite w-full">
                      <div
                        className={`h-full ${overBudget ? "bg-flag-red" : burn > 75 ? "bg-track-gold" : "bg-diagnostic-steel"}`}
                        style={{ width: `${Math.min(burn, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end self-center">
                    <Badge tone={p.status === "on-track" ? "steel" : p.status === "at-risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                      {p.status}
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
