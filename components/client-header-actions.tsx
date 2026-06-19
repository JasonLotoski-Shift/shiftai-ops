"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderOpen, Terminal, Check, Presentation, FileSignature, Stamp, Upload, FileInput } from "lucide-react";
import { ActionsPanel, type ActionBox } from "@/components/actions-panel";
import { DiscoveryReportModal } from "@/components/discovery-report-modal";
import { SowModal } from "@/components/sow-modal";
import { ContractModal } from "@/components/contract-modal";
import { UploadFileModal } from "@/components/upload-file-modal";

// The client's Actions panel (under the title). The header keeps the page's
// primary CTA (+ New project); everything else — Drive, workspace path, the doc
// generators, Upload, and Ingest — lives here as explainer boxes.
export function ClientActionsPanel({
  clientId,
  company,
  driveFolderUrl,
  workspacePath,
  ranAt = {},
  savedAt = {},
}: {
  clientId: string;
  company: string;
  driveFolderUrl: string;
  workspacePath: string;
  /** box key → last run date (green "last ran" state). */
  ranAt?: Record<string, Date | undefined>;
  /** box key → saved step-1 draft date (orange "step 1 of 2 saved" state). */
  savedAt?: Record<string, Date | undefined>;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<"discovery-report" | "sow" | "generate-contract" | "upload" | null>(null);
  // Which two-step box is being reopened from a saved draft.
  const [reopen, setReopen] = useState<Record<string, boolean>>({});

  // Auto-open from the dashboard Quick Action (routes here with ?qa=upload).
  const searchParams = useSearchParams();
  const qa = searchParams.get("qa");
  useEffect(() => {
    if (qa === "discovery-report" || qa === "sow" || qa === "generate-contract" || qa === "upload") setOpen(qa);
  }, [qa]);

  // Open a two-step box; if it has a saved draft, reopen the editor preloaded.
  function openBox(key: "discovery-report" | "sow" | "generate-contract") {
    if (savedAt[key]) setReopen((r) => ({ ...r, [key]: true }));
    setOpen(key);
  }

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
      key: "discovery-report",
      icon: Presentation,
      title: "Discovery report",
      description: "Draft the client-facing discovery deck: findings, build plan, time back.",
      onClick: () => openBox("discovery-report"),
      ranAt: ranAt["discovery-report"],
      stepOneSavedAt: savedAt["discovery-report"],
    },
    {
      key: "sow",
      icon: FileSignature,
      title: "Statement of Work",
      description: "Draft a contract-grade SOW as a Google Doc, for partner + counsel review.",
      onClick: () => openBox("sow"),
      ranAt: ranAt["sow"],
      stepOneSavedAt: savedAt["sow"],
    },
    {
      key: "generate-contract",
      icon: Stamp,
      title: "Generate contract",
      description: "Draft the standard agreement as a fillable HTML you export to PDF. SOW becomes Schedule A.",
      onClick: () => openBox("generate-contract"),
      ranAt: ranAt["generate-contract"],
      stepOneSavedAt: savedAt["generate-contract"],
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
        forceOpen={qa === "discovery-report" || qa === "sow" || qa === "generate-contract" || qa === "upload"}
      />

      {open === "discovery-report" && (
        <DiscoveryReportModal
          clientId={clientId}
          company={company}
          reopenDraft={!!reopen["discovery-report"]}
          onClose={() => {
            setOpen(null);
            setReopen((r) => ({ ...r, "discovery-report": false }));
          }}
        />
      )}
      {open === "sow" && (
        <SowModal
          clientId={clientId}
          company={company}
          reopenDraft={!!reopen["sow"]}
          onClose={() => {
            setOpen(null);
            setReopen((r) => ({ ...r, sow: false }));
          }}
        />
      )}
      {open === "generate-contract" && (
        <ContractModal
          clientId={clientId}
          company={company}
          reopenDraft={!!reopen["generate-contract"]}
          onClose={() => {
            setOpen(null);
            setReopen((r) => ({ ...r, "generate-contract": false }));
          }}
        />
      )}
      {open === "upload" && (
        <UploadFileModal clientId={clientId} company={company} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
