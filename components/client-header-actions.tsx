"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderOpen, Terminal, Check, ClipboardList, NotebookPen, Upload, FileInput } from "lucide-react";
import { ActionsPanel, type ActionBox } from "@/components/actions-panel";
import { ClientDocModal } from "@/components/client-doc-modal";
import { UploadFileModal } from "@/components/upload-file-modal";

// The client's Actions panel (under the title). The header keeps the page's
// primary CTA (+ New project); everything else — Drive, workspace path, the doc
// generators, Upload, and Ingest — lives here as explainer boxes.
export function ClientActionsPanel({
  clientId,
  company,
  driveFolderUrl,
  workspacePath,
}: {
  clientId: string;
  company: string;
  driveFolderUrl: string;
  workspacePath: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<"survey" | "discussion" | "upload" | null>(null);

  // Auto-open from the dashboard Quick Action (routes here with ?qa=survey|discussion|upload).
  const searchParams = useSearchParams();
  const qa = searchParams.get("qa");
  useEffect(() => {
    if (qa === "survey" || qa === "discussion" || qa === "upload") setOpen(qa);
  }, [qa]);

  async function copyWorkspacePath() {
    try {
      await navigator.clipboard.writeText(workspacePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied (rare on HTTPS) — fall back to a prompt
      // so the user can still grab the path manually.
      window.prompt("Workspace path (copy):", workspacePath);
    }
  }

  const actions: ActionBox[] = [
    {
      key: "drive",
      icon: FolderOpen,
      title: "Open Drive folder",
      description: "Open this client's Drive folder in a new tab.",
      onClick: () => window.open(driveFolderUrl, "_blank", "noopener"),
    },
    {
      key: "workspace",
      icon: copied ? Check : Terminal,
      title: copied ? "Copied!" : "Copy workspace path",
      description: copied ? "Path copied to your clipboard." : "Copy the local workspace path for Claude Code.",
      onClick: copyWorkspacePath,
    },
    {
      key: "survey",
      icon: ClipboardList,
      title: "Survey",
      description: "Draft a client survey for a pilot or check-in.",
      onClick: () => setOpen("survey"),
    },
    {
      key: "discussion",
      icon: NotebookPen,
      title: "Discussion doc",
      description: "Draft a discussion doc for the next conversation.",
      onClick: () => setOpen("discussion"),
    },
    {
      key: "upload",
      icon: Upload,
      title: "Upload files",
      description: "Add a file to this client's deliverables.",
      onClick: () => setOpen("upload"),
    },
    {
      key: "ingest",
      icon: FileInput,
      title: "Ingest",
      description: "Drop in notes or a transcript to file against this client.",
      href: `/ingest?focus=client:${clientId}`,
    },
  ];

  return (
    <>
      <ActionsPanel
        actions={actions}
        forceOpen={qa === "survey" || qa === "discussion" || qa === "upload"}
      />

      {open === "survey" && (
        <ClientDocModal
          clientId={clientId}
          company={company}
          skill="client-survey"
          title="Client survey"
          icon={ClipboardList}
          focusLabel="What should this survey find out?"
          focusPlaceholder="e.g. How the dispatch pilot is landing with the crew, and whether to expand to the second yard"
          onClose={() => setOpen(null)}
        />
      )}
      {open === "discussion" && (
        <ClientDocModal
          clientId={clientId}
          company={company}
          skill="discussion-doc"
          title="Discussion doc"
          icon={NotebookPen}
          focusLabel="What's this conversation for?"
          focusPlaceholder="e.g. Mid-Build check-in — confirm scope for the work-order module and surface blockers"
          onClose={() => setOpen(null)}
        />
      )}
      {open === "upload" && (
        <UploadFileModal clientId={clientId} company={company} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
