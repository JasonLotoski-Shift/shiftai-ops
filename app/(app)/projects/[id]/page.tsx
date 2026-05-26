import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Button, Hairline } from "@/components/ui";
import {
  projectById,
  clientById,
  partnerById,
  milestones,
  hoursEntries,
  invoices,
  formatDate,
  formatCAD,
} from "@/lib/data/seed";
import { ArrowLeft, Clock, Bot, Check, Circle, AlertTriangle, FolderOpen, Terminal } from "lucide-react";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projectById(id);
  if (!project) notFound();

  const client = clientById(project.clientId);
  const partner = partnerById(project.partnerLeadId);
  const consultants = project.consultantIds.map(partnerById).filter(Boolean);
  const projectMilestones = milestones.filter((m) => m.projectId === project.id);
  const projectHours = hoursEntries.filter((h) => h.projectId === project.id);
  const projectInvoices = invoices.filter((i) => i.projectId === project.id);

  const burn = (project.hoursLogged / project.budgetHours) * 100;
  const feeBurn = projectInvoices.reduce((s, i) => s + i.amount, 0) / project.budgetFee * 100;
  const overBudget = burn > 90;

  return (
    <>
      <Header
        eyebrow={`${client?.company} · ${project.phase}`}
        title={project.name.split("·")[1]?.trim() ?? project.name}
        actions={
          <>
            <Button variant="ghost" size="sm">
              <FolderOpen size={13} strokeWidth={1.5} />
              Drive
            </Button>
            <Button variant="ghost" size="sm">
              <Terminal size={13} strokeWidth={1.5} />
              Workspace
            </Button>
            <Button variant="primary" size="sm">
              <Clock size={13} strokeWidth={1.5} />
              Log hours
            </Button>
          </>
        }
      />

      <div className="px-8 py-6">
        <Link href="/projects" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to projects
        </Link>
      </div>

      <div className="px-8 pb-12 grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          {/* Description */}
          <Card>
            <CardBody>
              <Label>— Scope</Label>
              <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{project.description}</p>
            </CardBody>
          </Card>

          {/* Hours + budget */}
          <Card>
            <div className="p-6 grid grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <Label>— Hours</Label>
                <span className={`mono text-[28px] tabular-nums ${overBudget ? "text-flag-red" : "text-bone"}`}>
                  {project.hoursLogged}
                </span>
                <span className="label text-[10px]">of {project.budgetHours} budgeted</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Burn</Label>
                <span className={`mono text-[28px] tabular-nums ${overBudget ? "text-flag-red" : burn > 75 ? "text-track-gold" : "text-bone"}`}>
                  {Math.round(burn)}%
                </span>
                <div className="h-[3px] bg-graphite w-full mt-1">
                  <div
                    className={`h-full ${overBudget ? "bg-flag-red" : burn > 75 ? "bg-track-gold" : "bg-diagnostic-steel"}`}
                    style={{ width: `${Math.min(burn, 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Fee</Label>
                <span className="mono text-[20px] text-bone tabular-nums">
                  {formatCAD(project.budgetFee).replace("CA$", "$")}
                </span>
                <span className="label text-[10px]">{Math.round(feeBurn)}% billed</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Status</Label>
                <Badge tone={project.status === "on-track" ? "steel" : project.status === "at-risk" ? "gold" : project.status === "blocked" ? "red" : "neutral"}>
                  {project.status}
                </Badge>
              </div>
            </div>
          </Card>

          {/* Milestones */}
          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Milestones</Label>
            </div>
            <div className="flex flex-col">
              {projectMilestones.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-4 px-5 py-4 ${i < projectMilestones.length - 1 ? "border-b border-graphite" : ""}`}
                >
                  <div className="shrink-0">
                    {m.status === "complete" ? (
                      <div className="w-6 h-6 bg-diagnostic-steel/20 border border-diagnostic-steel/50 flex items-center justify-center">
                        <Check size={12} strokeWidth={2} className="text-diagnostic-steel" />
                      </div>
                    ) : m.status === "at-risk" ? (
                      <div className="w-6 h-6 bg-flag-red/20 border border-flag-red/50 flex items-center justify-center">
                        <AlertTriangle size={12} strokeWidth={2} className="text-flag-red" />
                      </div>
                    ) : m.status === "in-progress" ? (
                      <div className="w-6 h-6 bg-track-gold-dim/30 border border-track-gold flex items-center justify-center mono text-[10px] text-track-gold">
                        <Circle size={8} strokeWidth={3} className="text-track-gold animate-pulse" fill="currentColor" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border border-graphite-2 flex items-center justify-center">
                        <Circle size={8} strokeWidth={1.5} className="text-bone-mute" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] text-bone">{m.title}</div>
                    <div className="label mt-0.5">Due {formatDate(m.dueDate)}</div>
                  </div>
                  <Badge
                    tone={
                      m.status === "complete" ? "steel" :
                      m.status === "at-risk" ? "red" :
                      m.status === "in-progress" ? "gold" : "neutral"
                    }
                  >
                    {m.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent hours */}
          <Card>
            <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
              <Label>— Recent hours logged</Label>
              <span className="label">{projectHours.length} entries</span>
            </div>
            {projectHours.length === 0 ? (
              <CardBody>
                <span className="label">— No hours logged yet</span>
              </CardBody>
            ) : (
              <div className="flex flex-col">
                {projectHours.map((h, i) => (
                  <div
                    key={h.id}
                    className={`grid grid-cols-[1fr_60px_100px] gap-4 px-5 py-3 ${i < projectHours.length - 1 ? "border-b border-graphite" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Label className={h.loggedBy.startsWith("agent") ? "label-gold" : ""}>
                          {h.loggedByLabel}
                        </Label>
                        {h.loggedBy.startsWith("agent") && (
                          <Bot size={11} strokeWidth={1.5} className="text-track-gold" />
                        )}
                      </div>
                      <div className="text-[13px] text-bone-dim truncate">{h.description}</div>
                    </div>
                    <div className="mono text-[14px] text-bone tabular-nums self-center">{h.hours}h</div>
                    <div className="mono text-[11px] text-bone-mute tabular-nums self-center text-right">
                      {formatDate(h.date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Client</Label>
            </div>
            <CardBody className="flex flex-col gap-3">
              <Link href={`/clients/${client?.id}`} className="text-[14px] text-bone hover:text-track-gold">
                {client?.company}
              </Link>
              <div className="text-[11px] text-bone-mute">
                Contract {formatCAD(client?.contractValue ?? 0).replace("CA$", "$")} · Signed {formatDate(client?.contractSignedAt ?? "")}
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Team</Label>
            </div>
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center mono text-[13px] text-track-gold">
                  {partner?.initials}
                </div>
                <div>
                  <div className="text-[14px] text-bone">{partner?.name}</div>
                  <div className="label text-[9px]">Partner lead</div>
                </div>
              </div>
              <Hairline />
              {consultants.map((c) => (
                <div key={c!.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-graphite-2 flex items-center justify-center mono text-[13px] text-bone-dim">
                    {c!.initials}
                  </div>
                  <div>
                    <div className="text-[14px] text-bone">{c!.name}</div>
                    <div className="label text-[9px]">Consultant</div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          {/* Agent panel */}
          <Card className="border-track-gold/40 bg-track-gold-dim/5">
            <div className="px-5 py-4 border-b border-track-gold/20 flex items-center gap-2">
              <Bot size={14} strokeWidth={1.5} className="text-track-gold" />
              <Label gold>— Agent · Claude</Label>
            </div>
            <CardBody className="flex flex-col gap-3">
              <p className="text-[13px] text-bone leading-relaxed">
                Last sync: <span className="mono">2026-05-11 14:42</span>. Drafted weekly brief from
                recent activity. Suggested 2 IP harvests if engagement closes on time.
              </p>
              <Hairline />
              <div className="flex flex-col gap-2 text-[12px]">
                <button className="text-left text-bone-dim hover:text-bone">→ Open in Claude workspace</button>
                <button className="text-left text-bone-dim hover:text-bone">→ Generate weekly brief</button>
                <button className="text-left text-bone-dim hover:text-bone">→ Run engagement health check</button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
