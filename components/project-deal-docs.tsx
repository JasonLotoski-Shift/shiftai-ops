"use client";

// Deal-stage documents dropdown — the artifacts created against the deal that
// convertDeal repointed to the client (not the project). These are the docs
// "sent before the project" (proposals, SOWs, decks from the pursuit). Sourced
// generically per client — any promoted deal carries them.
//
// Server page → small client child pattern (see discovery-survey-card.tsx):
// the detail page stays a server component; this is the only stateful bit
// (the open/closed toggle).

import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, Presentation, Mail } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ArtifactDeleteControl } from "@/components/artifact-delete-control";

export type DealDoc = {
  id: string;
  type: string; // ArtifactType
  title: string;
  driveUrl: string;
  createdAt: string | Date;
};

const docIcon: Record<string, typeof FileText> = {
  proposal: FileText,
  deck: Presentation,
  email: Mail,
  sow: FileText,
  invoice: FileText,
  report: FileText,
  other: FileText,
};

export function ProjectDealDocs({ docs }: { docs: DealDoc[] }) {
  const [open, setOpen] = useState(false);

  if (docs.length === 0) return null;

  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-row-hover)] transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <h2 className="title-md">Documents sent before project</h2>
          <span className="label">{docs.length}</span>
        </div>
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          className={`text-bone-mute transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="flex flex-col border-t border-graphite">
          {docs.map((d) => {
            const Icon = docIcon[d.type] ?? FileText;
            return (
              <div key={d.id} className="flex items-stretch group/doc">
              <a
                href={d.driveUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex-1 grid grid-cols-[28px_1fr_auto_20px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors group"
              >
                <div className="self-center text-bone-mute group-hover:text-track-gold transition-colors">
                  <Icon size={16} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex flex-col gap-1 self-center">
                  <div className="text-[14px] text-bone truncate">{d.title}</div>
                  <span className="mono uppercase tracking-[0.08em] text-[11px] text-bone-mute">{d.type}</span>
                </div>
                <div className="self-center flex items-center">
                  <Badge tone="bone">{formatDate(d.createdAt)}</Badge>
                </div>
                <div className="self-center text-bone-mute opacity-50 group-hover:opacity-100 transition-opacity">
                  <ExternalLink size={12} strokeWidth={1.5} />
                </div>
              </a>
              <ArtifactDeleteControl
                artifactId={d.id}
                className="self-center pl-3 pr-4 opacity-0 group-hover/doc:opacity-100 focus-within:opacity-100 transition-opacity"
              />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
