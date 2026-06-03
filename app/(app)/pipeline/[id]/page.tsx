import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, CardBody, Label, Badge, Hairline, Avatar, EmptyState } from "@/components/ui";
import { DealActions } from "@/components/deal-actions";
import { MarkRepliedButton } from "@/components/mark-replied-button";
import { EstimateEditor } from "@/components/billing/estimate-editor";
import { prisma } from "@/lib/prisma";
import { formatCAD, formatDate, daysSince } from "@/lib/format";
import { stageLabels, industryLabels, leadSourceLabels } from "@/lib/data/seed";
import { ArrowLeft, Mail, Phone, Sparkles, Activity } from "lucide-react";

// The proposal engine's Opus build chain (server actions on this route) can run
// 60–120s. Extend the function timeout to the max (honored on hosts that allow
// it; capped by the plan otherwise).
export const maxDuration = 300;

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { contact: true, partnerLead: true },
  });
  if (!deal) notFound();

  // Latest open/accepted estimate for this deal (Phase 5 scoping) + whether a
  // prototype already exists (gates the proposal-deck action).
  const [estimateRaw, tiers, prototype] = await Promise.all([
    prisma.estimate.findFirst({
      where: { dealId: id, status: { not: "superseded" } },
      orderBy: { version: "desc" },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.rateTier.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, billRateCents: true, payRateCents: true },
    }),
    prisma.artifact.findFirst({
      where: { dealId: id, generatedFromSkill: "html-prototype" },
      select: { id: true },
    }),
  ]);
  const hasPrototype = !!prototype;
  const estimate = estimateRaw
    ? {
        id: estimateRaw.id,
        version: estimateRaw.version,
        status: estimateRaw.status as "draft" | "sent" | "accepted" | "superseded",
        totalValue: estimateRaw.totalValue,
        lines: estimateRaw.lines.map((l) => ({
          id: l.id,
          role: l.role,
          hours: Number(l.hours),
          payRateCents: l.payRateCents,
          billRateCents: l.billRateCents,
          isExtra: l.isExtra,
          rateTierId: l.rateTierId,
        })),
      }
    : null;

  const contact = deal.contact;
  const partner = deal.partnerLead;
  const stale = daysSince(deal.lastTouchAt) > 30;

  return (
    <>
      <Header
        eyebrow={`Pipeline · ${stageLabels[deal.stage]}`}
        title={deal.company}
        actions={<DealActions deal={deal} partner={partner} contact={contact} hasPrototype={hasPrototype} />}
      />

      <div className="px-8 py-8 flex flex-col gap-8">
        <Link href="/pipeline" className="label hover:text-bone flex items-center gap-2">
          <ArrowLeft size={12} strokeWidth={1.5} />
          Back to board
        </Link>

        <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 flex flex-col gap-6">
          <Card>
            <div className="p-6 grid grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <Label>Value</Label>
                <span className="mono text-[24px] text-track-gold tabular-nums">
                  {formatCAD(deal.valueEstimate).replace("CA$", "$")}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Stage</Label>
                <span className="text-[18px] text-bone">{stageLabels[deal.stage]}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Industry</Label>
                <span className="text-[18px] text-bone">{industryLabels[deal.industry]}</span>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Close target</Label>
                <span className="mono text-[14px] text-bone tabular-nums">
                  {formatDate(deal.closeTargetDate)}
                </span>
              </div>
            </div>
            {deal.coldOutreachAt && (
              <div className="mx-6 mb-6 px-4 py-4 bg-track-gold-dim/5 border border-track-gold/30 rounded-[var(--radius)] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Badge tone={deal.outreachRepliedAt ? "gold" : "bone"}>
                    {deal.outreachRepliedAt ? "Replied" : "Awaiting reply"}
                  </Badge>
                  <span className="text-[13px] text-bone-dim">
                    Cold outreach sent {formatDate(deal.coldOutreachAt)}
                    {deal.outreachRepliedAt ? ` · replied ${formatDate(deal.outreachRepliedAt)}` : ""}.
                  </span>
                </div>
                {deal.stage === "lead" && !deal.outreachRepliedAt && (
                  <MarkRepliedButton dealId={deal.id} />
                )}
              </div>
            )}
            {deal.notes && (
              <div className="px-6 pb-6">
                <Label>Latest note</Label>
                <p className="text-[14px] text-bone-dim mt-2 leading-relaxed">{deal.notes}</p>
              </div>
            )}
            {stale && (
              <div className="mx-6 mb-6 px-4 py-4 bg-flag-red/10 border border-flag-red/40 rounded-[var(--radius)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge tone="red">{daysSince(deal.lastTouchAt)}d cold</Badge>
                  <span className="text-[13px] text-bone-dim">
                    Last touch {formatDate(deal.lastTouchAt)} — flagged stale.
                  </span>
                </div>
                <button className="label-gold hover:underline">Re-engage →</button>
              </div>
            )}
          </Card>

          <EstimateEditor dealId={deal.id} estimate={estimate} tiers={tiers} />

          <Card className="border-track-gold/40 bg-track-gold-dim/5">
            <CardBody className="flex items-start gap-4">
              <div className="w-8 h-8 bg-track-gold-dim/30 border border-track-gold/40 flex items-center justify-center shrink-0 rounded-[var(--radius-sm)]">
                <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label gold>Agent · Claude proposal</Label>
                <p className="text-[13px] text-bone leading-relaxed">
                  Based on the {industryLabels[deal.industry]} vertical and the {stageLabels[deal.stage].toLowerCase()} stage,
                  Claude can draft a tailored SOW pulling from the IP library — methodology, prior case study
                  shape, and similar engagements. Partner reviews before send.
                </p>
                <div className="flex gap-3 pt-1">
                  <button className="label-gold hover:underline">Draft SOW →</button>
                  <button className="label hover:text-bone">Draft re-engagement email</button>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-3">
              <span className="title-md">Activity</span>
            </div>
            <div className="flex flex-col">
              {(() => {
                const activity = [
                  { ts: deal.lastTouchAt, actor: partner?.name ?? "—", detail: "Touch logged — most recent activity" },
                  { ts: deal.createdAt, actor: partner?.name ?? "—", detail: `Deal created · stage: ${stageLabels[deal.stage]}` },
                ];
                if (activity.length === 0) {
                  return (
                    <EmptyState
                      icon={<Activity size={22} strokeWidth={1.5} />}
                      title="No activity yet"
                      hint="Logged touches and stage changes will appear here."
                      compact
                    />
                  );
                }
                return activity.map((a, i) => (
                  <div
                    key={i}
                    className="px-5 py-3 hover:bg-[var(--color-row-hover)]"
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <Label>{a.actor}</Label>
                      <span className="label">{formatDate(a.ts)}</span>
                    </div>
                    <p className="text-[13px] text-bone-dim">{a.detail}</p>
                  </div>
                ));
              })()}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <span className="title-md">Primary contact</span>
              <Link href={`/contacts/${contact.id}`} className="label-gold hover:underline">
                View →
              </Link>
            </div>
            <CardBody className="flex flex-col gap-3">
              <div>
                <div className="text-[16px] text-bone">{contact.name}</div>
                <div className="text-[12px] text-bone-mute">{contact.title} · {contact.company}</div>
              </div>
              <Hairline />
              <div className="flex flex-col gap-2 text-[12px]">
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                  <Mail size={12} strokeWidth={1.5} />
                  {contact.email}
                </a>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Phone size={12} strokeWidth={1.5} />
                    {contact.phone}
                  </a>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-3">
              <span className="title-md">Partner lead</span>
            </div>
            <CardBody className="flex items-center gap-3">
              <Avatar initials={partner.initials} size="lg" gold />
              <div>
                <div className="text-[14px] text-bone">{partner.name}</div>
                <div className="text-[11px] text-bone-mute">{partner.role}</div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <div className="px-5 pt-5 pb-3">
              <span className="title-md">Source</span>
            </div>
            <CardBody className="flex flex-col gap-2">
              {contact.sourceCategory && (
                <Badge tone="gold">{leadSourceLabels[contact.sourceCategory] ?? contact.sourceCategory}</Badge>
              )}
              <p className="text-[13px] text-bone-dim">{contact.source ?? "Unknown"}</p>
            </CardBody>
          </Card>
        </div>
        </div>
      </div>
    </>
  );
}
