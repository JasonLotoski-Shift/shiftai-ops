import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Header } from "@/components/header";
import { Card, CardBody, CardHeader, Label, Badge, Button, Avatar, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate } from "@/lib/format";
import { ProjectTimeline } from "@/components/project-timeline";
import { ProjectTypeEdit } from "@/components/project-type-edit";
import { MilestoneEpic } from "@/components/milestone-epic";
import { ProjectFinancials } from "@/components/project-financials";
import { EconomicsEditor } from "@/components/billing/economics-editor";
import { ScopePricingPanel } from "@/components/billing/scope-pricing-panel";
import { TeamLedger } from "@/components/billing/team-ledger";
import { ChangeThread } from "@/components/billing/change-thread";
import { isScopePricingProposal } from "@/lib/ingest/scope-pricing-types";
import { getProjectBillingThread } from "@/lib/audit-read";
import { ProjectFeeEdit } from "@/components/project-fee-edit";
import { ProjectNameEdit } from "@/components/project-name-edit";
import { ProjectDatesEdit } from "@/components/project-dates-edit";
import { ManualMilestoneForm } from "@/components/manual-milestone-form";
import { ManualDeliverableForm } from "@/components/manual-deliverable-form";
import { DeliverableTasks } from "@/components/deliverable-tasks";
import { SendInvoiceModal } from "@/components/send-invoice-modal";
import { ProjectDropPanel } from "@/components/project-drop-panel";
import { ArrowLeft, Bot, Check, FolderOpen, Terminal, FileText, Presentation, Mail, ExternalLink, FileInput } from "lucide-react";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [project, partners, session] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        partnerLead: true,
        consultants: true,
        milestones: {
          orderBy: { dueDate: "asc" },
          include: {
            owner: { select: { id: true, name: true, initials: true } },
            tasks: { include: { owner: { select: { name: true, initials: true } } } },
          },
        },
        invoices: true,
        installments: { orderBy: { sortOrder: "asc" } },
        economicsLines: {
          orderBy: { sortOrder: "asc" },
          include: { consultant: { select: { id: true, name: true } } },
        },
        payouts: {
          include: { consultant: { select: { name: true } } },
        },
        artifacts: {
          orderBy: { createdAt: "desc" },
          include: { tasks: { include: { owner: true } } },
        },
      },
    }),
    prisma.partner.findMany({
      select: { id: true, name: true, initials: true },
      orderBy: { name: "asc" },
    }),
    auth(),
  ]);
  const rosterConsultantsRaw = await prisma.consultant.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, defaultPayRateCents: true },
    orderBy: { name: "asc" },
  });
  const rosterConsultants = rosterConsultantsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    payRateCents: c.defaultPayRateCents,
  }));

  // Latest pending scope-pricing proposal for this project (review surface).
  const pendingScope = await prisma.ingestProposal.findFirst({
    where: { matchedProjectId: id, ingestType: "scope-pricing", status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { id: true, proposal: true },
  });
  let pendingScopeProp: {
    id: string;
    total: number | null;
    notes: string[];
    lines: {
      role: string;
      consultantId: string | null;
      consultantHint: string | null;
      hours: number;
      payRateCents: number | null;
      billRateCents: number;
      isExtra: boolean;
    }[];
  } | null = null;
  if (pendingScope && isScopePricingProposal(pendingScope.proposal)) {
    const sp = pendingScope.proposal;
    // Resolve each line's consultantHint → a roster id by case-insensitive name.
    const byName = new Map(rosterConsultantsRaw.map((c) => [c.name.toLowerCase(), c.id]));
    pendingScopeProp = {
      id: pendingScope.id,
      total: sp.total,
      notes: sp.notes ?? [],
      lines: sp.lines.map((l) => ({
        role: l.role,
        consultantId: l.consultantHint ? byName.get(l.consultantHint.toLowerCase()) ?? null : null,
        consultantHint: l.consultantHint,
        hours: l.hours,
        payRateCents: l.payRateCents,
        billRateCents: l.billRateCents,
        isExtra: l.isExtra,
      })),
    };
  }
  if (!project) notFound();

  const currentPartnerId = session?.user?.partnerId ?? "";

  const client = project.client;
  const partner = project.partnerLead;
  const consultants = project.consultants;
  const projectMilestones = project.milestones;
  const projectInvoices = project.invoices;
  const projectArtifacts = project.artifacts;
  const projectInstallments = project.installments;

  // Team payout ledger — group payouts by client stage (non-extra installment).
  const invoiceStatusById = new Map(projectInvoices.map((inv) => [inv.id, inv.status]));
  const payoutStages = projectInstallments
    .filter((i) => !i.isExtra)
    .map((inst) => ({
      installmentId: inst.id,
      label: inst.label,
      amount: inst.amount,
      invoiceStatus: inst.invoiceId ? invoiceStatusById.get(inst.invoiceId) ?? null : null,
      payouts: project.payouts
        .filter((p) => p.installmentId === inst.id)
        .map((p) => ({
          id: p.id,
          consultantName: p.consultant.name,
          amount: p.amount,
          status: p.status as "owed" | "paid" | "confirmed",
          method: p.method,
          clientPaidFirst: p.clientPaidFirst,
        })),
    }));
  const hasPayouts = project.payouts.length > 0;

  const billingThread = await getProjectBillingThread(id);

  // Economics lines → client-safe shape (Decimal hours → number).
  const economicsRows = project.economicsLines.map((l) => ({
    id: l.id,
    role: l.role,
    hours: Number(l.hours),
    payRateCents: l.payRateCents,
    billRateCents: l.billRateCents,
    isExtra: l.isExtra,
    fromFirmDefault: l.fromFirmDefault,
    consultantId: l.consultantId,
    consultantName: l.consultant?.name ?? null,
  }));

  const artifactIcon = { proposal: FileText, deck: Presentation, email: Mail, sow: FileText, invoice: FileText, report: FileText, other: FileText } as const;
  const reviewTone = { draft: "neutral", approved: "steel", sent: "gold", archived: "bone" } as const;

  const milestonesComplete = projectMilestones.filter((m) => m.status === "complete").length;
  const invoicedTotal = projectInvoices.reduce((s, i) => s + i.amount, 0);
  const feeBurn = project.budgetFee > 0 ? (invoicedTotal / project.budgetFee) * 100 : 0;
  const remainingFee = project.budgetFee - invoicedTotal;

  return (
    <>
      <Header
        eyebrow={client.company}
        title={<ProjectNameEdit projectId={project.id} name={project.name} />}
        actions={
          <>
            <SendInvoiceModal
              projectId={project.id}
              installments={projectInstallments}
              remainingFee={remainingFee}
            />
            <Button variant="ghost" size="sm">
              <FolderOpen size={13} strokeWidth={1.5} />
              Drive
            </Button>
            <Button variant="ghost" size="sm">
              <Terminal size={13} strokeWidth={1.5} />
              Workspace
            </Button>
            <Link
              href={`/ingest?focus=project:${project.id}`}
              className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-transparent text-bone hover:bg-asphalt h-7 px-3 text-[12px]"
            >
              <FileInput size={13} strokeWidth={1.5} />
              Ingest
            </Link>
          </>
        }
      />

      <div className="px-8 py-6 flex items-center justify-between gap-4">
        <Link href="/projects" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to projects
        </Link>
        <ProjectTypeEdit projectId={project.id} projectType={project.projectType} />
      </div>

      {/* Delivery timeline — full-width, outside the 2/3 column grid */}
      <div className="px-8 pb-8">
        <div className="flex items-center justify-between mb-3">
          <Label>Timeline</Label>
          <ProjectDatesEdit
            projectId={project.id}
            startDate={project.startDate}
            targetEndDate={project.targetEndDate}
          />
        </div>
        <ProjectTimeline
          startDate={project.startDate}
          targetEndDate={project.targetEndDate}
          milestones={projectMilestones.map((m) => ({
            id: m.id,
            title: m.title,
            status: m.status,
            dueDate: m.dueDate,
          }))}
          installments={projectInstallments.map((i) => ({
            id: i.id,
            label: i.label,
            amount: i.amount,
            status: i.status,
            dueDate: i.dueDate,
          }))}
          invoices={projectInvoices.map((i) => ({
            id: i.id,
            number: i.number,
            status: i.status,
            issuedAt: i.issuedAt,
            paidAt: i.paidAt,
          }))}
        />
      </div>

      <div className="px-8 pb-12 grid grid-cols-3 gap-8">
        <div className="col-span-2 flex flex-col gap-8">
          <Card>
            <CardBody>
              <h2 className="title-md">Scope</h2>
              <p className="text-[14px] text-bone-dim mt-2 leading-relaxed whitespace-pre-line">{project.description}</p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="flex flex-col gap-2">
                <Label>Fee</Label>
                <ProjectFeeEdit projectId={project.id} budgetFee={project.budgetFee} feeBurnPct={feeBurn} />
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex flex-col gap-2">
                <Label>Milestones</Label>
                <span className="mono text-[28px] text-bone tabular-nums">
                  {milestonesComplete}<span className="text-bone-mute text-[16px]"> / {projectMilestones.length}</span>
                </span>
                <span className="label text-[10px]">complete</span>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Badge tone={project.status === "on_track" ? "steel" : project.status === "at_risk" ? "gold" : project.status === "blocked" ? "red" : "neutral"}>
                  {project.status.replace("_", "-")}
                </Badge>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2 className="title-md">Milestones</h2>
            </CardHeader>
            {projectMilestones.length === 0 ? (
              <EmptyState icon={<Check size={22} strokeWidth={1.5} />} title="No milestones yet" hint="Milestones added to this project will appear here." compact />
            ) : (
              <div className="flex flex-col">
                {projectMilestones.map((m) => (
                  <MilestoneEpic
                    key={m.id}
                    milestone={m}
                    projectId={project.id}
                    partners={partners}
                    currentPartnerId={currentPartnerId}
                  />
                ))}
              </div>
            )}
            <ManualMilestoneForm
              projectId={project.id}
              partners={partners}
              currentPartnerId={currentPartnerId}
            />
          </Card>

          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="title-md">Deliverables</h2>
              <span className="label">{projectArtifacts.length} {projectArtifacts.length === 1 ? "artifact" : "artifacts"}</span>
            </CardHeader>
            {projectArtifacts.length === 0 ? (
              <EmptyState icon={<FileText size={22} strokeWidth={1.5} />} title="No deliverables yet" hint="AI-generated drafts and partner uploads appear here." compact />
            ) : (
              <div className="flex flex-col">
                {projectArtifacts.map((ar) => {
                  const Icon = artifactIcon[ar.type] ?? FileText;
                  const isAgent = ar.createdBy.startsWith("AGENT");
                  return (
                    <div key={ar.id} className="flex flex-col">
                      <a
                        href={ar.driveUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="grid grid-cols-[28px_1fr_160px_100px_20px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors group"
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
                      {/* Tasks hang off the deliverable — rendered OUTSIDE the anchor (interactive buttons can't nest in <a>). */}
                      <div className="px-5 pb-4 pl-[60px]">
                        <DeliverableTasks
                          artifactId={ar.id}
                          projectId={project.id}
                          tasks={ar.tasks}
                          partners={partners}
                          currentPartnerId={currentPartnerId}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <ManualDeliverableForm projectId={project.id} />
          </Card>

          <Card>
            <ProjectFinancials
              projectId={project.id}
              budgetFee={project.budgetFee}
              invoices={projectInvoices}
              installments={projectInstallments}
            />
          </Card>

          <EconomicsEditor
            projectId={project.id}
            value={project.budgetFee}
            lines={economicsRows}
            consultants={rosterConsultants}
          />

          <ScopePricingPanel
            projectId={project.id}
            consultants={rosterConsultants}
            pending={pendingScopeProp}
          />

          {(hasPayouts || payoutStages.length > 0) && (
            <TeamLedger projectId={project.id} stages={payoutStages} />
          )}

          <ChangeThread entries={billingThread} title="Billing change log" />
        </div>

        <div className="flex flex-col gap-8">
          <Card>
            <CardHeader>
              <h2 className="title-md">Client</h2>
            </CardHeader>
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
            <CardHeader>
              <h2 className="title-md">Team</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar initials={partner.initials} size="lg" gold />
                <div>
                  <div className="text-[14px] text-bone">{partner.name}</div>
                  <div className="label text-[9px]">Partner lead</div>
                </div>
              </div>
              {consultants.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <Avatar initials={c.initials} size="lg" />
                  <div>
                    <div className="text-[14px] text-bone">{c.name}</div>
                    <div className="label text-[9px]">Consultant</div>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <ProjectDropPanel projectId={project.id} />

          <Card className="border border-track-gold/40 bg-track-gold-dim/5">
            <CardHeader className="flex items-center gap-2">
              <Bot size={14} strokeWidth={1.5} className="text-track-gold" />
              <h2 className="title-md text-track-gold">Agent · Claude</h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <p className="text-[13px] text-bone leading-relaxed">
                Last sync: <span className="mono">2026-05-11 14:42</span>. Drafted weekly brief from
                recent activity. Suggested 2 IP harvests if engagement closes on time.
              </p>
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
