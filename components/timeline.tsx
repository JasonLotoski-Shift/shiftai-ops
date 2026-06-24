"use client";

// Merged comms + documents timeline for a client or deal. Comms rows (emails,
// meetings, calls, notes) show the summary with an expand toggle revealing the
// full original body (the in-app "go back and read the exact words" surface).
// Document rows link out to the filed file. Pure render — the server page loads
// + serializes the rows; nothing here touches Prisma.

import { useState } from "react";
import {
  Mail,
  Phone,
  Users,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export type TimelineComm = {
  id: string;
  date: string; // ISO
  type: string; // InteractionType (underscored)
  summary: string;
  body: string | null;
  subject: string | null;
  loggedBy: string;
  contactName: string | null;
};

export type TimelineDoc = {
  id: string;
  date: string; // ISO (createdAt)
  title: string;
  type: string; // ArtifactType
  driveUrl: string;
  createdBy: string;
  generatedFromSkill: string | null;
};

const COMM_ICON: Record<string, typeof Mail> = {
  email_sent: Mail,
  email_received: Mail,
  call: Phone,
  meeting: Users,
  other: MessageSquare,
};

const disp = (v: string) => v.replace(/_/g, " ");

type Row =
  | ({ kind: "comm" } & TimelineComm)
  | ({ kind: "doc" } & TimelineDoc);

export function Timeline({
  comms,
  docs,
}: {
  comms: TimelineComm[];
  docs: TimelineDoc[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const rows: Row[] = [
    ...comms.map((c) => ({ kind: "comm" as const, ...c })),
    ...docs.map((d) => ({ kind: "doc" as const, ...d })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    return (
      <Card>
        <div className="px-5 py-8 text-center text-[12px] text-bone-mute">
          No emails, meetings, notes, or documents on file yet.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="px-5 pt-4 pb-2">
        <span className="title-md">Timeline</span>
        <p className="text-[11px] text-bone-mute mt-0.5">
          Everything logged here + everything they sent us, newest first.
        </p>
      </div>
      <div className="flex flex-col divide-y divide-graphite">
        {rows.map((r) =>
          r.kind === "comm" ? (
            <CommRow key={`comm-${r.id}`} comm={r} open={expanded.has(r.id)} onToggle={() => toggle(r.id)} />
          ) : (
            <DocRow key={`doc-${r.id}`} doc={r} />
          ),
        )}
      </div>
    </Card>
  );
}

function CommRow({ comm, open, onToggle }: { comm: TimelineComm; open: boolean; onToggle: () => void }) {
  const Icon = COMM_ICON[comm.type] ?? MessageSquare;
  const hasBody = !!comm.body && comm.body.trim().length > 0;
  return (
    <div className="px-5 py-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-pill)] bg-asphalt shrink-0 mt-0.5">
          <Icon size={12} strokeWidth={1.5} className="text-track-gold" />
        </span>
        <button
          type="button"
          onClick={hasBody ? onToggle : undefined}
          className={cn("min-w-0 flex-1 text-left", hasBody && "cursor-pointer")}
        >
          <div className="flex items-center gap-2 flex-wrap">
            {comm.subject && <span className="text-[13px] text-bone leading-snug">{comm.subject}</span>}
            <span className="text-[11px] text-bone-mute">{disp(comm.type)}</span>
            {hasBody &&
              (open ? (
                <ChevronDown size={12} strokeWidth={1.5} className="text-bone-mute" />
              ) : (
                <ChevronRight size={12} strokeWidth={1.5} className="text-bone-mute" />
              ))}
          </div>
          <p className="text-[12px] text-bone-dim mt-0.5 leading-snug">{comm.summary}</p>
          <p className="text-[11px] text-bone-mute mt-0.5">
            {formatDate(comm.date)} · {comm.loggedBy}
            {comm.contactName ? ` · ${comm.contactName}` : ""}
          </p>
        </button>
      </div>
      {open && hasBody && (
        <pre className="mt-2 ml-8 whitespace-pre-wrap break-words text-[12px] text-bone-dim leading-relaxed bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 max-h-[420px] overflow-auto font-sans">
          {comm.body}
        </pre>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: TimelineDoc }) {
  return (
    <a
      href={doc.driveUrl}
      target="_blank"
      rel="noreferrer"
      className="px-5 py-3 flex items-start gap-3 hover:bg-[var(--color-row-hover)] transition-colors"
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-[var(--radius-pill)] bg-asphalt shrink-0 mt-0.5">
        <FileText size={12} strokeWidth={1.5} className="text-bone-mute" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] text-bone leading-snug">{doc.title}</span>
          <span className="text-[11px] text-bone-mute">{disp(doc.type)}</span>
          <ExternalLink size={11} strokeWidth={1.5} className="text-bone-mute" />
        </div>
        <p className="text-[11px] text-bone-mute mt-0.5">
          {formatDate(doc.date)} · {doc.createdBy}
          {doc.generatedFromSkill ? ` · ${doc.generatedFromSkill}` : ""}
        </p>
      </div>
    </a>
  );
}
