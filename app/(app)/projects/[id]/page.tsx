import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Button, Hairline } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";
import { ArrowLeft, Bot, Check, Circle, AlertTriangle, FolderOpen, Terminal, FileText, Presentation, Mail, ExternalLink } from "lucide-react";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      partnerLead: true,
      consultants: true,
      milestones: { orderBy: { dueDate: "asc" } },
      invoices: true,
      artifacts: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const client = project.client;
  const partner = project.partnerLead;
  const consultants = project.consultants;
  const projectMilestones = project.milestones;
  const projectInvoices = project.invoices;
  const projectArtifacts = project.artifacts;

  const artifactIcon = { proposal: FileText, deck: Presentation, email: Mail, sow: FileText, invoice: FileText, report: FileText, other: FileText } as const;
  const reviewTone = { draft: "neutral", approved: "steel", sent: "gold", archived: "bone" } as const;

  const milestonesComplete = projectMilestones.filter((m) => m.status === "complete").length;
  const feeBurn = project.budgetFee > 0 ? (projectInvoices.reduce((s, i) => s + i.amount, 0) / project.budgetFee) * 100 : 0;

  return (
    <>
      <Header
        eyebrow={`${client.company} · ${project.phase}`}
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
          <Card>
            <CardBody>
              <Label>— Scope</Label>
              <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{project.description}</p>
            </CardBody>
          </Card>

          <Card>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div className="flex flex-col gap-2">
                <Label>— Fee</Label>
                <span className="mono text-[28px] text-bone tabular-nums">
                  {formatCAD(project.budgetFee).replace("CA$", "$")}
                </span>
                <span className="label text-[10px]">{Math.round(feeBurn)}% billed</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Milestones</Label>
                <span className="mono text-[28px] text-bone tabular-nums">
                  {milestonesComplete}<span className="text-bone-mute text-[16px]"> / {projectMilestones.length}</span>
                </span>
                <span className="label text-[10px]">complete</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>— Status</Label>
                <Badge tone={project.status === "on_track" ? "steel" : project.status === "at_risk" ? "gold" : project.status === "blocked" ? "red" : "neutral"}>
                  {project.status.replace("_", "-")}
                </Badge>
              </div>
            </div>
          </Card>

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
                      <div className="w-6 h-6 bg-diagnostic-steel/20 border border-diagnostic-steel/50 rounded-[var(--radius-sm)] flex items-center justify-center">
                        <Check size={12} strokeWidth={2} className="text-diagnostic-steel" />
                      </div>
                    ) : m.status === "at_risk" ? (
                      <div className="w-6 h-6 bg-flag-red/20 border border-flag-red/50 rounded-[var(--radius-sm)] flex items-center justify-center">
                        <AlertTriangle size={12} strokeWidth={2} className="text-flag-red" />
                      </div>
                    ) : m.status === "in_progress" ? (
                      <div className="w-6 h-6 bg-track-gold-dim/30 border border-track-gold rounded-[var(--radius-sm)] flex items-center justify-center mono text-[10px] text-track-gold">
                        <Circle size={8} strokeWidth={3} className="text-track-gold animate-pulse" fill="currentColor" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 border border-graphite-2 rounded-[var(--radius-sm)] flex items-center justify-center">
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
                      m.status === "at_risk" ? "red" :
                      m.status === "in_progress" ? "gold" : "neutral"
                    }
                  >
                    {m.status.replace("_", "-")}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite flex justify-between items-center">
              <Label>— Deliverables</Label>
              <span className="label">{projectArtifacts.length} {projectArtifacts.length === 1 ? "artifact" : "artifacts"}</span>
            </div>
            {projectArtifacts.length === 0 ? (
              <CardBody>
                <span className="label">— No deliverables logged yet. AI-generated drafts and partner uploads appear here.</span>
              </CardBody>
            ) : (
              <div className="flex flex-col">
                {projectArtifacts.map((ar, i) => {
                  const Icon = artifactIcon[ar.type] ?? FileText;
                  const isAgent = ar.createdBy.startsWith("AGENT");
                  return (
                    <a
                      href={ar.driveUrl}
                      target="_blank"
                      rel="noreferrer"
                      key={ar.id}
                      className={`grid grid-cols-[28px_1fr_160px_100px_20px] gap-4 px-5 py-4 ${i < projectArtifacts.length - 1 ? "border-b border-graphite" : ""} hover:bg-graphite/40 transition-colors group`}
                    >
                      <div className="self-center text-bone-mute group-hover:text-track-gold transition-colors">
                        <Icon size={16} strokeWidth={1.5} />
                      </div>
                      <div className="min-w-0 flex flex-col gap-1 self-center">
                        <div className="text-[14px] text-bone truncate">{ar.title}</div>
                        <div className="flex items-center gap-2 text-[11px] text-bone-mute">
                          <span className="mono uppercase tracking-[0.08em]">{ar.type}</span>
                          {ar.fileName && (<><span>·</span><span className="truncate">{ar.fileName}</span></>)}
                          {ar.generatedFromSkill && (<><span>·</span><span className="mono text-track-gold">/{ar.generatedFromSkill}</span></>)}
                        </div>
                      </div>
                      <div className="self-center flex flex-col gap-0.5 min-w-0">
                        <div className={`text-[12px] truncate flex items-center gap-1.5 ${isAgent ? "text-track-gold" : "text-bone"}`}>
                          {isAgent && <Bot size={11} strokeWidth={1.5} />}
                          <span className="truncate">{ar.createdBy}</span>
                        </div>
                        <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(ar.createdAt)}</span>
                      </div>
                      <div className="self-center flex justify-end">
                        <Badge tone={reviewTone[ar.reviewStatus]}>{ar.reviewStatus}</Badge>
                      </div>
                      <div className="self-center text-bone-mute opacity-50 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={12} strokeWidth={1.5} />
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Client</Label>
            </div>
            <CardBody className="flex flex-col gap-3">
              <Link href={`/clients/${client.id}`} className="text-[14px] text-bone hover:text-track-gold">
                {client.company}
              </Link>
              <div className="text-[11px] text-bone-mute">
                Contract {formatCAD(client.contractValue).replace("CA$", "$")} · Signed {formatDate(client.contractSignedAt)}
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 py-4 border-b border-graphite">
              <Label>— Team</Label>
            </div>
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-track-gold-dim/30 border border-track-gold/40 rounded-[var(--radius-pill)] flex items-center justify-center mono text-[13px] text-track-gold">
                  {partner.initials}
                </div>
                <div>
                  <div className="text-[14px] text-bone">{partner.name}</div>
                  <div className="label text-[9px]">Partner lead</div>
                </div>
              </div>
              <Hairline />
              {consultants.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-graphite-2 rounded-[var(--radius-pill)] flex items-center justify-center mono text-[13px] text-bone-dim">
                    {c.initials}
                  </div>
                  <div>
                    <div className="text-[14px] text-bone">{c.name}</div>
                    <div className="label text-[9px]">Consultant</div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

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
