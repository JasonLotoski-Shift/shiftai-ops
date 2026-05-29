"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderOpen, Terminal, Check, ClipboardList, NotebookPen, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { ClientDocModal } from "@/components/client-doc-modal";
import { UploadFileModal } from "@/components/upload-file-modal";

export function ClientHeaderActions({
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
  useEffect(() => {
    const qa = searchParams.get("qa");
    if (qa === "survey" || qa === "discussion" || qa === "upload") setOpen(qa);
  }, [searchParams]);

  async function copyWorkspacePath() {
    try {
      await navigator.clipboard.writeText(workspacePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied (rare on HTTPS) — fall back to alert
      // so the user can still grab the path manually.
      window.prompt("Workspace path (copy):", workspacePath);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => window.open(driveFolderUrl, "_blank", "noopener")}>
        <FolderOpen size={13} strokeWidth={1.5} />
        Open Drive folder
      </Button>
      <Button variant="secondary" size="sm" onClick={copyWorkspacePath}>
        {copied ? <Check size={13} strokeWidth={1.5} /> : <Terminal size={13} strokeWidth={1.5} />}
        {copied ? "Copied!" : "Copy workspace path"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("survey")}>
        <ClipboardList size={13} strokeWidth={1.5} />
        Survey
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("discussion")}>
        <NotebookPen size={13} strokeWidth={1.5} />
        Discussion doc
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen("upload")}>
        <Upload size={13} strokeWidth={1.5} />
        Upload files
      </Button>

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
