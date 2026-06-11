// Lead company-picture + positioning cards — the presentational, no-state
// counterpart of the deal Company-profile display (components/deal-enrich-panel.tsx
// :115–183). Rendered from the server lead detail page; the Enrich action is a
// sibling client component passed in. Both cards have an explicit empty state so
// an un-enriched lead reads as "run Enrich" rather than blank.

import { Card, CardBody, Label } from "@/components/ui";
import { formatCAD } from "@/lib/format";
import type { ProspectLead } from "@/lib/types";
import { Globe, ExternalLink, Linkedin, Instagram, Target } from "lucide-react";
import type { ReactNode } from "react";

export function LeadCompanyPictureCard({ lead, action }: { lead: ProspectLead; action?: ReactNode }) {
  const facts: { label: string; value?: string | null }[] = [
    { label: "Revenue estimate", value: lead.revenueEstimate != null ? formatCAD(lead.revenueEstimate).replace("CA$", "$") : null },
    { label: "Employees", value: lead.employeeEstimate != null ? lead.employeeEstimate.toLocaleString() : null },
    { label: "Headcount", value: lead.companySize },
    { label: "Headquarters", value: lead.headquarters },
    { label: "Founded", value: lead.founded },
    { label: "Ownership", value: lead.ownership },
    { label: "Sub-industry", value: lead.subIndustry },
  ];
  const setFacts = facts.filter((f) => f.value);

  const lists: { title: string; items: string[] }[] = [
    { title: "Key facts", items: lead.companyKeyFacts ?? [] },
    { title: "Current systems", items: lead.currentSystems ?? [] },
    { title: "Pain points", items: lead.painPoints ?? [] },
  ];

  const hasProfile =
    setFacts.length > 0 ||
    !!lead.website ||
    !!lead.linkedinUrl ||
    !!lead.instagramUrl ||
    !!lead.description ||
    (lead.companyKeyFacts?.length ?? 0) > 0 ||
    (lead.currentSystems?.length ?? 0) > 0 ||
    (lead.painPoints?.length ?? 0) > 0;

  return (
    <Card>
      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <span className="title-md">Company picture</span>
        {action}
      </div>
      <CardBody className="pt-0 flex flex-col gap-4">
        {!hasProfile ? (
          <p className="text-[13px] text-bone-dim leading-relaxed">
            No company picture yet. Run Enrich to build it from the web.
          </p>
        ) : (
          <>
            {(lead.website || lead.linkedinUrl || lead.instagramUrl) && (
              <div className="flex items-center gap-5 flex-wrap text-[13px]">
                {lead.website && (
                  <a href={`https://${lead.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Globe size={12} strokeWidth={1.5} />
                    {lead.website}
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
                {lead.linkedinUrl && (
                  <a href={lead.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Linkedin size={12} strokeWidth={1.5} />
                    LinkedIn
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
                {lead.instagramUrl && (
                  <a href={lead.instagramUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Instagram size={12} strokeWidth={1.5} />
                    Instagram
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
              </div>
            )}

            {setFacts.length > 0 && (
              <div className="grid grid-cols-3 gap-5">
                {setFacts.map((f) => (
                  <div key={f.label} className="flex flex-col gap-1.5">
                    <Label>{f.label}</Label>
                    <span className="text-[14px] text-bone">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            {lead.description && (
              <div className="flex flex-col gap-1.5">
                <Label>What they do</Label>
                <p className="text-[14px] text-bone-dim leading-relaxed">{lead.description}</p>
              </div>
            )}

            {lists.filter((l) => l.items.length > 0).map((l) => (
              <div key={l.title} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Label>{l.title}</Label>
                  <span className="mono text-[10px] text-bone-mute tabular-nums">{l.items.length}</span>
                </div>
                <div className="flex flex-col gap-1 max-h-[240px] overflow-y-auto pr-2">
                  {l.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <p className="text-[13px] text-bone leading-snug">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function LeadPositioningCard({ lead }: { lead: ProspectLead }) {
  const likelyNeeds = lead.likelyNeeds ?? [];
  const hasPositioning = !!lead.fitSummary || likelyNeeds.length > 0 || !!lead.salesAngle;

  return (
    <Card>
      <div className="px-5 pt-4 pb-2 flex items-center gap-2">
        <Target size={14} strokeWidth={1.5} className="text-track-gold" />
        <span className="title-md">How we&apos;d sell to them</span>
      </div>
      <CardBody className="pt-0 flex flex-col gap-4">
        {!hasPositioning ? (
          <p className="text-[13px] text-bone-dim leading-relaxed">Run Enrich to generate the selling view.</p>
        ) : (
          <>
            {lead.fitSummary && (
              <div className="flex flex-col gap-1.5">
                <Label gold>The fit</Label>
                <p className="text-[14px] text-bone-dim leading-relaxed">{lead.fitSummary}</p>
              </div>
            )}

            {likelyNeeds.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Likely needs</Label>
                <div className="flex flex-col gap-1.5">
                  {likelyNeeds.map((need, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <p className="text-[13px] text-bone leading-snug">{need}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lead.salesAngle && (
              <div className="flex flex-col gap-1.5 border border-track-gold/40 bg-track-gold-dim/5 rounded-[var(--radius-lg)] px-4 py-3">
                <Label gold>Opening angle</Label>
                <p className="text-[14px] text-bone leading-relaxed">{lead.salesAngle}</p>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
