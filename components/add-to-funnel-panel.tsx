"use client";

// AddToFunnelPanel — inline panel on a lead detail page. Pick a person, an
// industry (pre-matched from the lead's industryTags), and the lead owner,
// then promote the lead into the pipeline. Or decline it (optional reason).
//
// Disabled once the lead is no longer "pending" (already added or ghosted).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Select, Input, Button, Badge } from "@/components/ui";
import { industryLabels } from "@/lib/data/seed";
import { addToFunnel, declineLead } from "@/app/(app)/pipeline/leads/actions";
import type { Industry, ProspectLead, ProspectPerson } from "@/lib/types";

// Cheap keyword → Industry heuristic over the lead's free-form industryTags.
const INDUSTRY_KEYWORDS: { match: RegExp; industry: Industry }[] = [
  { match: /motorsport|racing|race|track/i, industry: "motorsport" },
  { match: /auto|vehicle|car|mobility|ev\b|dealership/i, industry: "automotive" },
  { match: /construct|build|contractor|infrastructure/i, industry: "construction" },
  { match: /engineer|machin|fabricat|manufactur|industrial/i, industry: "engineering" },
];

function guessIndustry(tags: string[]): Industry {
  for (const tag of tags) {
    for (const { match, industry } of INDUSTRY_KEYWORDS) {
      if (match.test(tag)) return industry;
    }
  }
  return "other";
}

export function AddToFunnelPanel({
  lead,
  partners,
  defaultPartnerId,
  title = "Add to funnel",
}: {
  lead: ProspectLead;
  partners: { id: string; name: string }[];
  defaultPartnerId?: string;
  title?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [personIndex, setPersonIndex] = useState(0);
  const [industry, setIndustry] = useState<Industry>(guessIndustry(lead.industryTags));
  const [partnerLeadId, setPartnerLeadId] = useState(defaultPartnerId ?? partners[0]?.id ?? "");
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Already-added or ghosted leads are read-only here (D36: the cold-email path
  // also produces an "added" lead via sendColdEmail).
  const reviewed = lead.status === "added" || lead.status === "ghost";

  function onAdd() {
    setError(null);
    startTransition(async () => {
      try {
        const { dealId } = await addToFunnel(lead.id, { personIndex, industry, partnerLeadId });
        router.push(`/pipeline/${dealId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function onDecline() {
    setError(null);
    startTransition(async () => {
      try {
        await declineLead(lead.id, { reason: reason.trim() || undefined });
        router.push("/pipeline");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  if (reviewed) {
    return (
      <Card className="p-5">
        <Label gold>{title}</Label>
        <p className="mt-3 text-[13px] text-bone-dim">
          {lead.status === "added" ? (
            <>
              This lead is already in the pipeline.
              {lead.convertedDealId && (
                <>
                  {" "}
                  <a className="text-track-gold hover:underline" href={`/pipeline/${lead.convertedDealId}`}>
                    Open the deal →
                  </a>
                </>
              )}
            </>
          ) : (
            "This lead was declined and set aside."
          )}
        </p>
      </Card>
    );
  }

  const people: ProspectPerson[] = lead.people;
  const selected = people[personIndex];
  const noEmail = !selected?.email?.trim();

  return (
    <Card className="p-5 flex flex-col gap-4">
      <Label gold>{title}</Label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-bone-mute uppercase tracking-wide">Contact person</span>
        <Select value={personIndex} onChange={(e) => setPersonIndex(Number(e.target.value))} disabled={pending}>
          {people.map((p, i) => (
            <option key={i} value={i}>
              {p.name}
              {p.title ? ` — ${p.title}` : ""}
              {p.email ? "" : " (no email)"}
            </option>
          ))}
        </Select>
        {noEmail && (
          <span className="text-[11px] text-flag-red">
            This person has no email — pick someone with an email to add them.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-bone-mute uppercase tracking-wide">Industry</span>
        <Select value={industry} onChange={(e) => setIndustry(e.target.value as Industry)} disabled={pending}>
          {Object.entries(industryLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-bone-mute uppercase tracking-wide">Lead owner</span>
        <Select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={pending}>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onAdd} disabled={pending || noEmail}>
          Add to pipeline
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowDecline((v) => !v)} disabled={pending}>
          Decline
        </Button>
      </div>

      {showDecline && (
        <div className="flex flex-col gap-2 border-t border-graphite pt-3">
          <span className="text-[11px] text-bone-mute uppercase tracking-wide">Reason (optional)</span>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why set this one aside?"
            disabled={pending}
          />
          <div>
            <Button variant="danger" size="sm" onClick={onDecline} disabled={pending}>
              Set aside
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1 pt-1">
        {lead.foundBy.map((s) => (
          <Badge key={s} tone="steel">
            {s}
          </Badge>
        ))}
      </div>
    </Card>
  );
}
