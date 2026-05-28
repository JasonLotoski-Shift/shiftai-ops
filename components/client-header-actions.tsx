"use client";

import { useState } from "react";
import { FolderOpen, Terminal, Check } from "lucide-react";
import { Button } from "@/components/ui";

export function ClientHeaderActions({
  driveFolderUrl,
  workspacePath,
}: {
  driveFolderUrl: string;
  workspacePath: string;
}) {
  const [copied, setCopied] = useState(false);

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
    </>
  );
}
