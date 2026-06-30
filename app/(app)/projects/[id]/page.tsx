import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { Header } from "@/components/header";
import { Card, CardBody, CardHeader, Label, Badge, Button, Avatar, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { currentIsManagingPartner } from "@/lib/permissions";
import { formatCAD, formatDate } from "@/lib/format";
import { ProjectTimeline } from "@/components/project-timeline";
import { ProjectTypeEdit } from "@/components/project-type-edit";
import { MilestoneEpic } from "@/components/milestone-epic";
import { ProjectFinancials } from "@/components/project-financials";
import { EconomicsEditor } from "@/components/billing/economics-editor";
import { DirectCostsEditor } from "@/components/billing/direct-costs-editor";
import { CommissionEditor, type CommissionLineView } from "@/components/billing/commission-editor";
import { BillingSummaryCard } from "@/components/billing/billing-summary-card";
import { ScopePricingPanel } from "@/components/billing/scope-pricing-panel";
import { TeamLedger } from "@/components/billing/team-ledger";
import { SubscriptionMonthButton } from "@/components/billing/subscription-month-button";
import { ChangeThread } from "@/components/billing/change-thread";
import { economicsTotals } from "@/lib/billing/economics";
import { allocateLaborRevenueV2 } from "@/lib/billing/allocation-v2";
import { authoritativeBuildValue } from "@/lib/billing/build-value";
import { ledgerTotals } from "@/lib/finance-ledger";
import { loadLedgerEntries } from "@/app/(app)/financials/ledger-data";
import { ProjectPnl } from "@/components/financials/project-pnl";
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
import { ProjectDealDocs } from "@/components/project-deal-docs";
import { ArtifactDeleteControl } from "@/components/artifact-delete-control";
import { ArrowLeft, Bot, Check, FolderOpen, Terminal, FileText, Presentation, Mail, ExternalLink } from "lucide-react";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "financials" ? "financials" : "overview";

  const [project, partners, session] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        partnerLead: true,
        clientLead: true,
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
        directCosts: { orderBy: { sortOrder: "asc" } },
        payouts: {
          include: {
            consultant: { select: { name: true } },
            settledByBill: { select: { vendor: true, number: true, driveUrl: true } },
          },
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
  if (!project) notFound();

  // The Financials tab is the ONLY consumer of the roster, the pending scope
  // proposal, the rate tiers, the billing change-log, and the commission /
  // service-contract reads. The page opens on Overview by default, so skip all
  // of them unless that tab is open (the page re-renders on tab change, so they
  // load live when Financials opens). Each defaults to empty/false off-tab.
  const wantFinancials = tab === "financials";

  const rosterConsultantsRaw = wantFinancials
    ? await prisma.consultant.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true, defaultPayRateCents: true },
        orderBy: { name: "asc" },
      })
    : [];
  const rosterConsultants = rosterConsultantsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    payRateCents: c.defaultPayRateCents,
  }));

  // Latest pending scope-pricing proposal for this project (review surface).
  const pendingScope = wantFinancials
    ? await prisma.ingestProposal.findFirst({
        where: { matchedProjectId: id, ingestType: "scope-pricing", status: "pending" },
        orderBy: { createdAt: "desc" },
        select: { id: true, proposal: true },
      })
    : null;
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
  const currentPartnerId = session?.user?.partnerId ?? "";

  const client = project.client;
  const partner = project.partnerLead;
  const consultants = project.consultants;
  const clientLead = project.clientLead;

  // Deal-stage documents — artifacts convertDeal repointed to this client but
  // left tied to their originating deal (so still off the project). These are
  // the docs "sent before the project" (pursuit proposals, SOWs, decks).
  const dealDocsRaw = await prisma.artifact.findMany({
    where: { clientId: project.clientId, dealId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, title: true, driveUrl: true, createdAt: true },
  });
  const dealDocs = dealDocsRaw.map((d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    driveUrl: d.driveUrl,
    createdAt: d.createdAt,
  }));
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
          settledByBill: p.settledByBill
            ? { vendor: p.settledByBill.vendor, number: p.settledByBill.number, driveUrl: p.settledByBill.driveUrl }
            : null,
          invoiceWaivedReason: p.invoiceWaivedReason,
        })),
    }));
  const hasPayouts = project.payouts.length > 0;

  const billingThread = wantFinancials
    ? await getProjectBillingThread(id, {
        installmentIds: project.installments.map((i) => i.id),
        lineIds: project.economicsLines.map((l) => l.id),
        payoutIds: project.payouts.map((p) => p.id),
        invoiceIds: project.invoices.map((i) => i.id),
      })
    : [];

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
    rateTierId: l.rateTierId,
  }));

  // Rate card (firm tiers) for the economics line tier picker (Financials tab).
  const tiers = wantFinancials
    ? await prisma.rateTier.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, billRateCents: true, payRateCents: true },
      })
    : [];

  // Direct costs for the Financials tab.
  const directCostRows = project.directCosts.map((c) => ({ id: c.id, label: c.label, amount: c.amount, notes: c.notes }));
  const directCostsTotal = directCostRows.reduce((s, c) => s + c.amount, 0);

  // Commission (firm money — managing partners only; Financials tab only). On
  // Overview, skip the managing-partner check and the reads entirely. The unified
  // CommissionLine model (origination + source) replaced Origination +
  // ProjectSourceCommission at the Phase 4 cutover; payouts carry the dollars.
  const managingPartner = wantFinancials ? await currentIsManagingPartner() : false;
  const commissionLinesRaw = managingPartner
    ? await prisma.commissionLine.findMany({
        where: { projectId: id },
        orderBy: { sortOrder: "asc" },
        include: {
          partner: { select: { id: true, name: true } },
          payouts: { select: { amount: true, status: true, stream: true } },
        },
      })
    : [];
  const projectServiceContract = managingPartner
    ? await prisma.serviceContract.findUnique({
        where: { projectId: id },
        select: { id: true, monthlyFee: true, status: true, startDate: true },
      })
    : null;
  // Unlinked, non-void vendor bills on this project — the candidates a managing
  // partner can attach to a contractor payout in the Team Ledger (Phase 2).
  const projectBillOptions = managingPartner
    ? (
        await prisma.bill.findMany({
          where: { projectId: id, status: { not: "void" }, settledPayouts: { none: {} } },
          orderBy: { createdAt: "desc" },
          select: { id: true, vendor: true, number: true, amount: true, total: true, driveUrl: true },
        })
      ).map((b) => ({ id: b.id, vendor: b.vendor, number: b.number, amount: b.total || b.amount, hasDoc: !!b.driveUrl }))
    : [];
  // CommissionLine → editor view. buildAmount / recurringAmount come straight off
  // the payout rows (§9.6 — read once, never re-derived). For origination, sharePct
  // is the partner's slice of the rate pool (buildPct ÷ rate × 100).
  const originationRate = Number(project.originationPct);
  const commissionLineViews: CommissionLineView[] = commissionLinesRaw.map((l) => {
    const buildAmount = l.payouts.filter((p) => p.stream === "build").reduce((s, p) => s + p.amount, 0);
    const recurringAmount = l.payouts.filter((p) => p.stream === "recurring").reduce((s, p) => s + p.amount, 0);
    const bp = Number(l.buildPct);
    const share = l.kind === "origination" && originationRate > 0 ? (bp / originationRate) * 100 : 0;
    return {
      id: l.id,
      kind: l.kind,
      partnerId: l.partnerId,
      externalName: l.externalName,
      payeeName: l.partner?.name ?? l.externalName ?? "—",
      sharePct: l.kind === "origination" ? share : null,
      pct: l.kind === "origination" ? share : bp,
      recurringPct: l.recurringPct !== null ? Number(l.recurringPct) : null,
      buildAmount,
      recurringAmount,
    };
  });

  // The labour-revenue allocation (rebuild §9.1-9.3) — origination off the labour
  // pie, source netted from firm reserve. MP-only (firm money). A buy-out is exempt
  // (its whole value is firm capture, no labour split, no commission).
  const econTotals = economicsTotals(economicsRows);
  const allocation = managingPartner
    ? allocateLaborRevenueV2({
        laborBillable: econTotals.billableTotal,
        takeHome: econTotals.costTotal,
        directCosts: directCostsTotal,
        originationPct: Number(project.originationPct) / 100,
        isFirstContract: project.isFirstContract,
        authoritativeBuildValue: authoritativeBuildValue({ kind: "project", budgetFee: project.budgetFee }),
        commissionLines: commissionLinesRaw.map((l) => ({ kind: l.kind, buildPct: Number(l.buildPct) })),
        isBuyout: project.projectType === "buyout",
      })
    : null;

  // Project P&L (Phase 2) — actuals from the deduped ledger filtered to this
  // project. MP-only (firm cost/margin). Reuses the spine so the figures match
  // /financials exactly. loadLedgerEntries degrades to null pre-migration.
  const projectLedger = managingPartner ? (await loadLedgerEntries())?.filter((e) => e.projectId === project.id) ?? [] : null;
  const projTotals = projectLedger ? ledgerTotals(projectLedger) : null;
  const commissionPlanned = allocation ? allocation.originationFromLabour + allocation.sourceCommissionTotal : 0;
  const plannedProjectCost = econTotals.costTotal + directCostsTotal;

  const artifactIcon = { proposal: FileText, deck: Presentation, email: Mail, sow: FileText, contract: FileText, invoice: FileText, report: FileText, other: FileText } as const;
  const reviewTone = { draft: "neutral", approved: "steel", sent: "gold", archived: "bone" } as const;

  const milestonesComplete = projectMilestones.filter((m) => m.status === "complete").length;
  const invoicedTotal = projectInvoices.reduce((s, i) => s + i.amount, 0);
  const feeBurn = project.budgetFee > 0 ? (invoicedTotal / project.budgetFee) * 100 : 0;
  const remainingFee = project.budgetFee - invoicedTotal;
  const receivedTotal = projectInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  // Per-stage "invoice sent / not sent" glance for the Overview billing card.
  const stageGlance = projectInstallments
    .filter((i) => !i.isExtra)
    .map((inst) => {
      const st = inst.invoiceId ? invoiceStatusById.get(inst.invoiceId) ?? null : null;
      return {
        id: inst.id,
        label: inst.label,
        amount: inst.amount,
        invoiced: st !== null && st !== "draft",
        paid: st === "paid",
      };
    });

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

      {/* Project tabs — URL-routed so the Overview billing card can deep-link
          into Financials. Overview = scope/milestones/deliverables; Financials
          = the full billing breakdown. */}
      <div className="px-8 pb-2 flex items-center gap-1 border-b border-graphite">
        {([
          { key: "overview", label: "Overview" },
          { key: "financials", label: "Financials" },
        ] as const).map((t) => (
          <Link
            key={t.key}
            href={`/projects/${project.id}${t.key === "financials" ? "?tab=financials" : ""}`}
            className={`px-4 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-track-gold text-bone"
                : "border-transparent text-bone-dim hover:text-bone"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="px-8 pt-6 pb-12 grid grid-cols-3 gap-8">
        <div className="col-span-2 flex flex-col gap-8">
          {tab === "overview" && (
          <>
          <Card>
            <CardBody className="flex flex-col gap-5">
              <div>
                <h2 className="title-md">Scope</h2>
                <p className="text-[14px] text-bone-dim mt-2 leading-relaxed whitespace-pre-line">{project.description}</p>
              </div>

              {project.objectives && (
                <div className="flex flex-col gap-1.5 border-t border-graphite/40 pt-4">
                  <Label>Objectives</Label>
                  <p className="text-[14px] text-bone-dim leading-relaxed whitespace-pre-line">{project.objectives}</p>
                </div>
              )}

              {project.successMetrics.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-graphite/40 pt-4">
                  <Label>Success metrics</Label>
                  <ul className="flex flex-col gap-1.5">
                    {project.successMetrics.map((m, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-bone-dim leading-relaxed">
                        <span className="mt-1.5 w-1 h-1 rounded-[var(--radius-pill)] bg-track-gold shrink-0" />
                        <span>{m}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(clientLead || project.statusNote) && (
                <div className="flex flex-col gap-3 border-t border-graphite/40 pt-4">
                  {clientLead && (
                    <div className="flex items-center gap-2 text-[12px]">
                      <Label>Client lead</Label>
                      <Link href={`/contacts/${clientLead.id}`} className="text-bone hover:text-track-gold">
                        {clientLead.name}
                      </Link>
                      {clientLead.title && <span className="text-bone-mute">· {clientLead.title}</span>}
                    </div>
                  )}
                  {project.statusNote && (
                    <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
                      <span className="text-[12px] text-bone-dim leading-relaxed">{project.statusNote}</span>
                    </div>
                  )}
                </div>
              )}
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
                      <div className="flex items-stretch group/doc">
                      <a
                        href={ar.driveUrl || "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 grid grid-cols-[28px_1fr_160px_100px_20px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors group"
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
                      <ArtifactDeleteControl
                        artifactId={ar.id}
                        className="self-center pl-3 pr-4 opacity-0 group-hover/doc:opacity-100 focus-within:opacity-100 transition-opacity"
                      />
                      </div>
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

          <ProjectDealDocs docs={dealDocs} />

          <BillingSummaryCard
            projectId={project.id}
            budgetFee={project.budgetFee}
            received={receivedTotal}
            stages={stageGlance}
          />
          </>
          )}

          {tab === "financials" && (
          <>
          {managingPartner && projTotals && allocation && (
            <ProjectPnl
              budgetFee={project.budgetFee}
              billed={projTotals.invoicedIn}
              collected={projTotals.receivedIn}
              plannedCost={plannedProjectCost}
              // actualCostPaid excludes commission — true margin subtracts commission
              // separately (commissionPlanned), so counting paid commission here too
              // would double-subtract it (§9.6 ledger dedup).
              actualCostPaid={projTotals.cashOut - projTotals.commissionPaid}
              takeHomePlanned={econTotals.costTotal}
              takeHomePaid={projTotals.payoutsPaid}
              plannedFirmReserve={allocation.firmReserve}
              commissionPlanned={commissionPlanned}
              missingDocCount={projTotals.missingDocCount}
              isBuyout={project.projectType === "buyout"}
            />
          )}

          <Card>
            <ProjectFinancials
              projectId={project.id}
              budgetFee={project.budgetFee}
              invoices={projectInvoices}
              installments={projectInstallments}
            />
          </Card>

          {project.projectType === "subscription" && (
            <SubscriptionMonthButton
              projectId={project.id}
              monthlyFee={project.budgetFee}
              monthsScheduled={projectInstallments.filter((i) => !i.isExtra).length}
            />
          )}

          {managingPartner && allocation && (
            <CommissionEditor
              projectId={project.id}
              originationPct={Number(project.originationPct)}
              isFirstContract={project.isFirstContract}
              scheduleType={project.scheduleType}
              hasServiceContract={!!projectServiceContract}
              lines={commissionLineViews}
              partners={partners}
              summary={{
                originationFromLabour: allocation.originationFromLabour,
                sourceCommissionTotal: allocation.sourceCommissionTotal,
                firmReserve: allocation.firmReserve,
                firmReserveDeficit: allocation.firmReserveDeficit,
                overCommitted: allocation.overCommitted,
              }}
            />
          )}

          {projectServiceContract && (
            <Card>
              <CardHeader>
                <h2 className="title-md">On-going service contract</h2>
              </CardHeader>
              <CardBody className="flex items-center justify-between gap-3 pt-0">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-bone">
                    {formatCAD(projectServiceContract.monthlyFee).replace("CA$", "$")}/mo · {projectServiceContract.status.replace("_", "-")}
                  </span>
                  <span className="text-[11px] text-bone-mute">
                    {projectServiceContract.status === "pending_start" ? "Starts" : "Started"} {formatDate(projectServiceContract.startDate)}
                  </span>
                </div>
                <Link href={`/service-contracts/${projectServiceContract.id}`} className="label-gold hover:underline">
                  View →
                </Link>
              </CardBody>
            </Card>
          )}

          <EconomicsEditor
            projectId={project.id}
            value={project.budgetFee}
            lines={economicsRows}
            consultants={rosterConsultants}
            tiers={tiers}
          />

          <DirectCostsEditor projectId={project.id} costs={directCostRows} />

          <ScopePricingPanel
            projectId={project.id}
            consultants={rosterConsultants}
            pending={pendingScopeProp}
          />

          {(hasPayouts || payoutStages.length > 0) && (
            <TeamLedger projectId={project.id} stages={payoutStages} canManage={managingPartner} projectBills={projectBillOptions} />
          )}

          <ChangeThread entries={billingThread} title="Billing change log" />
          </>
          )}
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
