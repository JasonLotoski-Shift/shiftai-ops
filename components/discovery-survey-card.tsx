"use client";

// Discovery questionnaire status card — shown on the deal (and, after
// conversion, the client) page. Sent: the form link + "waiting". Responded:
// respondent + answers preview + Drive copy + a "Build discovery report" CTA.

import { useState } from "react";
import { Copy, ExternalLink, FileQuestion, Sparkles } from "lucide-react";
import { Card, CardBody, Badge, Button } from "@/components/ui";
import { DiscoveryReportDealModal } from "@/components/discovery-report-deal-modal";

export type SurveyCardData = {
  status: "draft" | "sent" | "responded";
  title: string;
  tallyFormUrl: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
  submittedAt: string | null; // ISO
  driveUrl: string | null;
  answers: { label: string; value: string }[] | null;
};

export function DiscoverySurveyCard({
  survey,
  dealId,
  company,
  reportDraftSaved = false,
}: {
  survey: SurveyCardData;
  dealId: string | null; // the survey's deal (retained after conversion) — gates the report build
  company: string;
  /** A step-1 discovery-report draft is parked for this deal — reopen preloaded. */
  reportDraftSaved?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const tone = survey.status === "responded" ? "gold" : survey.status === "sent" ? "steel" : "neutral";
  const answers = survey.answers ?? [];

  return (
    <Card>
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileQuestion size={14} strokeWidth={1.5} className="text-track-gold" />
          <span className="title-md">Discovery questionnaire</span>
        </div>
        <Badge tone={tone}>{survey.status === "responded" ? "responded" : survey.status === "sent" ? "sent" : "draft"}</Badge>
      </div>
      <CardBody className="flex flex-col gap-3 pt-0">
        {survey.status === "sent" && (
          <>
            <p className="text-[12px] text-bone-dim">Sent — waiting for the client to fill it in. It lands here automatically when they do.</p>
            {survey.tallyFormUrl && (
              <div className="flex items-center gap-2">
                <a href={survey.tallyFormUrl} target="_blank" rel="noreferrer" className="text-[12px] text-track-gold hover:underline truncate flex items-center gap-1">
                  <ExternalLink size={12} strokeWidth={1.5} className="shrink-0" />
                  {survey.tallyFormUrl}
                </a>
                <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard?.writeText(survey.tallyFormUrl!); setCopied(true); }}>
                  <Copy size={12} strokeWidth={1.5} />{copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
          </>
        )}

        {survey.status === "responded" && (
          <>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-bone-dim">
                {survey.respondentName || survey.respondentEmail || "Client"}
                {survey.submittedAt ? ` · ${new Date(survey.submittedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}` : ""}
              </span>
              {survey.driveUrl && (
                <a href={survey.driveUrl} target="_blank" rel="noreferrer" className="text-track-gold hover:underline flex items-center gap-1">
                  <ExternalLink size={12} strokeWidth={1.5} />Drive
                </a>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-graphite/40 pt-3">
              {answers.slice(0, 4).map((a, i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-bone-mute">{a.label}</span>
                  <span className="text-[12px] text-bone-dim line-clamp-2">{a.value || "—"}</span>
                </div>
              ))}
              {answers.length > 4 && <span className="text-[11px] text-bone-mute">+ {answers.length - 4} more answers</span>}
            </div>

            {dealId && (
              <div className="pt-1 flex items-center gap-3">
                <Button variant="primary" size="sm" onClick={() => setReportOpen(true)}>
                  <Sparkles size={13} strokeWidth={1.5} />
                  {reportDraftSaved ? "Finish discovery report" : "Build discovery report"}
                </Button>
                {reportDraftSaved && (
                  <span className="text-[11px] text-signal-warming">Step 1 of 2 saved</span>
                )}
              </div>
            )}
          </>
        )}
      </CardBody>

      {reportOpen && dealId && (
        <DiscoveryReportDealModal
          dealId={dealId}
          company={company}
          reopenDraft={reportDraftSaved}
          onClose={() => setReportOpen(false)}
        />
      )}
    </Card>
  );
}
