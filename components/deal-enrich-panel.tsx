"use client";

// Deal company profile + "Enrich from web" — the deal-page counterpart of
// the client Company-profile tab (components/client-detail-tabs.tsx
// CompanyProfile). Same flow: idle → results-with-checkboxes → applied;
// conflicts surface in red for review and are never auto-applied. The
// profile gathered here copies onto the new Client on Convert.

import { useState, useTransition } from "react";
import { Card, CardBody, Label, Button } from "@/components/ui";
import { formatCAD, formatDate } from "@/lib/format";
import {
  generateDealCompanyEnrichment,
  applyDealCompanyEnrichment,
  type DealCompanyEnrichAddition,
  type DealCompanyEnrichConflict,
} from "@/app/(app)/pipeline/[id]/actions";
import type { DealModel as Deal } from "@/lib/generated/prisma/models";
import { Globe, Sparkles, Check, ShieldAlert, ExternalLink, Linkedin, Instagram } from "lucide-react";

const DEAL_ENRICH_FIELD_LABELS: Record<string, string> = {
  website: "Website",
  companySize: "Headcount",
  headquarters: "Headquarters",
  founded: "Founded",
  ownership: "Ownership",
  description: "Description",
  linkedinUrl: "LinkedIn",
  instagramUrl: "Instagram",
  revenueEstimate: "Revenue estimate",
  employeeCount: "Employee count",
  subIndustry: "Sub-industry",
  companyKeyFacts: "Key facts",
  currentSystems: "Current systems",
  painPoints: "Pain points",
};

export function DealEnrichPanel({ deal }: { deal: Deal }) {
  const [phase, setPhase] = useState<"idle" | "results" | "applied">("idle");
  const [additions, setAdditions] = useState<DealCompanyEnrichAddition[]>([]);
  const [conflicts, setConflicts] = useState<DealCompanyEnrichConflict[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [appliedCount, setAppliedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, startRun] = useTransition();
  const [isApplying, startApply] = useTransition();

  function runEnrichment() {
    setError(null);
    startRun(async () => {
      try {
        const res = await generateDealCompanyEnrichment(deal.id);
        setAdditions(res.additions);
        setConflicts(res.conflicts);
        setSelected(new Set(res.additions.map((_, i) => i))); // all checked by default
        setPhase("results");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Enrichment failed");
      }
    });
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function apply() {
    setError(null);
    const chosen = additions.filter((_, i) => selected.has(i));
    startApply(async () => {
      try {
        const res = await applyDealCompanyEnrichment(deal.id, chosen);
        setAppliedCount(res.applied);
        setPhase("applied");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply");
      }
    });
  }

  const facts: { label: string; value?: string | null }[] = [
    { label: "Revenue estimate", value: deal.revenueEstimate != null ? formatCAD(deal.revenueEstimate).replace("CA$", "$") : null },
    { label: "Employees", value: deal.employeeCount != null ? String(deal.employeeCount) : null },
    { label: "Headcount", value: deal.companySize },
    { label: "Headquarters", value: deal.headquarters },
    { label: "Founded", value: deal.founded },
    { label: "Ownership", value: deal.ownership },
    { label: "Sub-industry", value: deal.subIndustry },
  ];
  const setFacts = facts.filter((f) => f.value);

  const hasProfile =
    setFacts.length > 0 ||
    !!deal.website ||
    !!deal.linkedinUrl ||
    !!deal.instagramUrl ||
    !!deal.description ||
    deal.companyKeyFacts.length > 0 ||
    deal.currentSystems.length > 0 ||
    deal.painPoints.length > 0;

  const lists: { title: string; items: string[] }[] = [
    { title: "Key facts", items: deal.companyKeyFacts },
    { title: "Current systems", items: deal.currentSystems },
    { title: "Pain points", items: deal.painPoints },
  ];

  return (
    <>
      {hasProfile && (
        <Card>
          <div className="px-5 pt-4 pb-2"><span className="title-md">Company profile</span></div>
          <CardBody className="pt-0 flex flex-col gap-4">
            {(deal.website || deal.linkedinUrl || deal.instagramUrl) && (
              <div className="flex items-center gap-5 flex-wrap text-[13px]">
                {deal.website && (
                  <a href={`https://${deal.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Globe size={12} strokeWidth={1.5} />
                    {deal.website}
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
                {deal.linkedinUrl && (
                  <a href={deal.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
                    <Linkedin size={12} strokeWidth={1.5} />
                    LinkedIn
                    <ExternalLink size={10} strokeWidth={1.5} className="opacity-50" />
                  </a>
                )}
                {deal.instagramUrl && (
                  <a href={deal.instagramUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-bone-dim hover:text-bone">
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

            {deal.description && (
              <div className="flex flex-col gap-1.5">
                <Label>What they do</Label>
                <p className="text-[14px] text-bone-dim leading-relaxed">{deal.description}</p>
              </div>
            )}

            {lists.filter((l) => l.items.length > 0).map((l) => (
              <div key={l.title} className="flex flex-col gap-1.5">
                <Label>{l.title}</Label>
                <div className="flex flex-col gap-1">
                  {l.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="mono text-[11px] text-track-gold mt-0.5 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <p className="text-[13px] text-bone leading-snug">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Card className="border border-track-gold/40 bg-track-gold-dim/5">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
            <span className="title-md text-track-gold">{hasProfile ? "Keep this current" : "Build the company picture"}</span>
          </div>
          {deal.enrichedAt && <span className="label">Last enriched {formatDate(deal.enrichedAt)}</span>}
        </div>
        <CardBody className="flex flex-col gap-3 pt-0">
          {hasProfile ? (
            <p className="text-[13px] text-bone leading-relaxed">
              Pull public company facts from the web — revenue, headcount, HQ, socials, what they run today, and where it
              hurts — each cited to its source. Updates are <span className="text-track-gold">proposed</span>: existing facts
              are never overwritten, and anything that conflicts is flagged for you to resolve. Everything gathered here
              carries onto the Client on Convert.
            </p>
          ) : (
            <p className="text-[13px] text-bone leading-relaxed">
              This record is thin — no company profile yet. Run an enrich to pull public facts from the web (revenue,
              headcount, HQ, socials, the systems they run, the pain that brought them in). Every fact is cited and{" "}
              <span className="text-track-gold">proposed</span> for your review before it lands. It all carries onto the
              Client on Convert.
            </p>
          )}

          {phase === "results" && (
            <>
              {additions.length === 0 && conflicts.length === 0 ? (
                <p className="text-[13px] text-bone-dim leading-relaxed">
                  Nothing new to add — the web search didn&apos;t surface anything beyond what&apos;s already on the record.
                </p>
              ) : (
                <>
                  {additions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <Label gold>Proposed additions ({additions.length}) · check what to keep</Label>
                      <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
                        {additions.map((a, i) => (
                          <label
                            key={i}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--color-row-hover)] ${i > 0 ? "border-t border-graphite/30" : ""} ${selected.has(i) ? "" : "opacity-50"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggle(i)}
                              className="mt-1 accent-track-gold"
                            />
                            <div className="min-w-0">
                              <Label>{DEAL_ENRICH_FIELD_LABELS[a.field] ?? a.field}</Label>
                              <p className="text-[13px] text-bone mt-0.5 leading-snug">{a.value}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {conflicts.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <Label>Conflicts · review ({conflicts.length})</Label>
                      {conflicts.map((c, i) => (
                        <div key={i} className="border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2">
                          <Label>{DEAL_ENRICH_FIELD_LABELS[c.field] ?? c.field}</Label>
                          <div className="grid grid-cols-2 gap-3 text-[13px]">
                            <div className="flex flex-col gap-1">
                              <span className="label text-[9px]">Keep (current)</span>
                              <span className="text-bone">{c.existing}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="label text-[9px]">Proposed</span>
                              <span className="text-bone-dim">{c.proposed}</span>
                            </div>
                          </div>
                          {c.note && <span className="text-[11px] text-bone-mute">{c.note}</span>}
                          <span className="text-[11px] text-bone-mute">Not applied — edit the deal by hand if you want this.</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {phase === "applied" && (
            <div className="flex items-center gap-2 px-3 py-2 border border-diagnostic-steel/40 bg-diagnostic-steel/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <Check size={14} strokeWidth={2} className="text-diagnostic-steel" />
              <span className="text-[13px] text-bone">{appliedCount} fact(s) merged. Existing facts kept.</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            {phase === "idle" && (
              <Button variant="secondary" size="sm" onClick={runEnrichment} disabled={isRunning}>
                <Globe size={13} strokeWidth={1.5} />
                {isRunning ? "Searching the web…" : "Enrich from web"}
              </Button>
            )}
            {phase === "results" && additions.length > 0 && (
              <Button variant="primary" size="sm" onClick={apply} disabled={isApplying || selected.size === 0}>
                {isApplying ? "Merging…" : `Add ${selected.size} (keep existing)`}
              </Button>
            )}
            {phase === "results" && additions.length === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setPhase("idle")}>Done</Button>
            )}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
