import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { Card, Label, Badge, Button } from "@/components/ui";
import { AddToFunnelPanel } from "@/components/add-to-funnel-panel";
import { LeadEmailPanel } from "@/components/lead-email-panel";
import { LeadPeopleList } from "@/components/lead-people-list";
import { LeadClaimCard } from "@/components/lead-claim-card";
import { RestoreLeadButton } from "@/components/restore-lead-button";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatCAD } from "@/lib/format";
import type { ProspectLead, ProspectPerson } from "@/lib/types";
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react";

function scoreTone(score: number): { cls: string; style?: React.CSSProperties } {
  if (score >= 8) return { cls: "bg-track-gold-dim/20 text-track-gold border-track-gold/40" };
  if (score >= 6)
    return {
      cls: "",
      style: {
        backgroundColor: "color-mix(in srgb, var(--color-signal-warming) 15%, transparent)",
        color: "var(--color-signal-warming)",
        borderColor: "color-mix(in srgb, var(--color-signal-warming) 40%, transparent)",
      },
    };
  return { cls: "bg-graphite text-bone-mute border-graphite-2" };
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ compose?: string }>;
}) {
  const { id } = await params;
  const { compose } = await searchParams;
  const autoCompose = compose === "1";

  const [row, partners, session] = await Promise.all([
    prisma.prospectLead.findUnique({ where: { id }, include: { segment: { select: { id: true, name: true } } } }),
    prisma.partner.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);
  if (!row) notFound();

  const people = (row.people as unknown as ProspectPerson[]) ?? [];
  const lead: ProspectLead = {
    id: row.id,
    companyName: row.companyName,
    domain: row.domain,
    website: row.website ?? undefined,
    industryTags: row.industryTags,
    revenueEstimate: row.revenueEstimate ?? undefined,
    employeeEstimate: row.employeeEstimate ?? undefined,
    headquarters: row.headquarters ?? undefined,
    segmentId: row.segmentId ?? undefined,
    segmentName: row.segment?.name ?? undefined,
    score: row.score,
    rationale: row.rationale,
    disqualified: row.disqualified,
    status: row.status,
    people,
    foundBy: row.foundBy,
    sources: (row.sources as Record<string, unknown> | null) ?? null,
    createdBy: row.createdBy,
    generatedFromSkill: row.generatedFromSkill ?? undefined,
    convertedContactId: row.convertedContactId ?? undefined,
    convertedDealId: row.convertedDealId ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    claimedById: row.claimedById ?? undefined,
    claimedBy: row.claimedBy ?? undefined,
    claimedAt: row.claimedAt?.toISOString(),
    outreachSubject: row.outreachSubject ?? undefined,
    outreachDraft: row.outreachDraft ?? undefined,
    outreachPersonIndex: row.outreachPersonIndex ?? undefined,
    outreachSentAt: row.outreachSentAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  const tone = scoreTone(lead.score);

  return (
    <>
      <Header
        eyebrow={lead.origin === "imported" ? "Pipeline · Promoted Lead" : "Pipeline · AI Found Lead"}
        title={
          <span className="flex flex-col gap-2">
            <span>{lead.companyName}</span>
            <span className="flex items-center gap-2 text-[13px] font-normal tracking-normal text-track-gold">
              <Sparkles size={13} strokeWidth={1.5} />
              Surfaced by {lead.createdBy}
              {lead.generatedFromSkill ? (
                <span className="text-bone-mute">· skill: {lead.generatedFromSkill}</span>
              ) : null}
            </span>
          </span>
        }
        actions={
          <Link href="/pipeline">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={13} strokeWidth={1.5} />
              Back to pipeline
            </Button>
          </Link>
        }
      />

      <div className="px-8 py-8 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        <div className="flex flex-col gap-6">
          {lead.status !== "pending" && (
            <Card className="p-4">
              <span className="text-[13px] text-bone-dim">
                {lead.status === "added"
                  ? "This lead is in the pipeline."
                  : lead.status === "contacted"
                    ? "Cold email sent — this lead is in the cold funnel awaiting a reply."
                    : "This lead was set aside."}
                {lead.reviewedBy ? ` Reviewed by ${lead.reviewedBy}.` : ""}
              </span>
            </Card>
          )}

          {/* Fit */}
          <Card className="p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Label gold>Fit score</Label>
                <span
                  className={`inline-flex items-center justify-center w-11 h-8 border font-mono tabular-nums text-[15px] rounded-[var(--radius-pill)] ${tone.cls}`}
                  style={tone.style}
                >
                  {lead.score}
                </span>
                <span className="text-[12px] text-bone-mute">/ 10</span>
              </div>
              <div className="flex items-center gap-2">
                {lead.segmentName ? <Badge tone="bone">{lead.segmentName}</Badge> : <Badge tone="neutral">Unmatched</Badge>}
                {lead.disqualified && <Badge tone="red">Disqualified</Badge>}
              </div>
            </div>
            <p className="text-[13px] text-bone-dim leading-relaxed">{lead.rationale}</p>
          </Card>

          {/* Firmographics */}
          <Card className="p-5 flex flex-col gap-4">
            <Label gold>Firmographics</Label>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Revenue (est.)" value={lead.revenueEstimate != null ? formatCAD(lead.revenueEstimate) : "—"} />
              <Field
                label="Employees (est.)"
                value={lead.employeeEstimate != null ? lead.employeeEstimate.toLocaleString() : "—"}
              />
              <Field label="Headquarters" value={lead.headquarters ?? "—"} />
              <Field
                label="Website"
                value={
                  lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-track-gold hover:underline"
                    >
                      {lead.domain}
                      <ExternalLink size={11} strokeWidth={1.5} />
                    </a>
                  ) : (
                    lead.domain
                  )
                }
              />
            </div>
            {lead.industryTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lead.industryTags.map((t) => (
                  <Badge key={t} tone="neutral">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          {/* People */}
          <Card className="p-5 flex flex-col gap-4">
            <Label gold>Candidate people ({people.length})</Label>
            <LeadPeopleList
              leadId={lead.id}
              people={people}
              canReveal={lead.status === "pending" || lead.status === "added"}
            />
          </Card>

          {/* Provenance */}
          <Card className="p-5 flex flex-col gap-3">
            <Label gold>Source provenance</Label>
            <div className="flex flex-wrap gap-1.5">
              {lead.foundBy.map((s) => (
                <Badge key={s} tone="steel">
                  {s}
                </Badge>
              ))}
            </div>
            <span className="text-[12px] text-bone-mute">
              Surfaced by {lead.createdBy}
              {lead.generatedFromSkill ? ` · skill: ${lead.generatedFromSkill}` : ""}
            </span>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <LeadClaimCard
            leadId={lead.id}
            claimedById={lead.claimedById}
            claimedBy={lead.claimedBy}
            partners={partners}
            currentPartnerId={session?.user?.partnerId}
            readOnly={lead.status === "added" || lead.status === "ghost"}
          />

          {/* The email panel self-routes: composer for pending leads, the
              awaiting-reply state (with the two exits) while contacted, and the
              read-only "added to funnel" state once converted. */}
          {(lead.status === "pending" || lead.status === "contacted" || lead.status === "added") && (
            <LeadEmailPanel lead={lead} autoOpen={autoCompose} />
          )}

          {lead.status === "ghost" ? (
            <RestoreLeadButton leadId={lead.id} />
          ) : lead.status === "contacted" ? null : (
            <AddToFunnelPanel
              lead={lead}
              partners={partners}
              defaultPartnerId={session?.user?.partnerId}
              title="Add to funnel"
            />
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-bone-mute uppercase tracking-wide">{label}</span>
      <span className="text-[13px] text-bone">{value}</span>
    </div>
  );
}
