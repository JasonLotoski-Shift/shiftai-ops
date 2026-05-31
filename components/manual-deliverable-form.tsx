"use client";

// Feature 6 — inline "add deliverable" form. Manual partner entry: calls
// createDeliverable, which creates an Artifact scoped to the project (live,
// no approval queue). Drive URL + file name are optional (partners may add a
// deliverable record before the file exists, or paste a Drive link later).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Button, Input, Select } from "@/components/ui";
import { createDeliverable } from "@/app/(app)/projects/[id]/actions";
import { Plus, X } from "lucide-react";

const TYPES = ["proposal", "deck", "email", "sow", "invoice", "report", "other"] as const;

export function ManualDeliverableForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<(typeof TYPES)[number]>("report");
  const [title, setTitle] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [fileName, setFileName] = useState("");

  function resetForm() {
    setType("report");
    setTitle("");
    setDriveUrl("");
    setFileName("");
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDeliverable(projectId, {
        type,
        title,
        driveUrl: driveUrl.trim() || undefined,
        fileName: fileName.trim() || undefined,
      });
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      console.error("createDeliverable failed:", err);
      setError(err instanceof Error ? err.message : "Failed to add deliverable");
    } finally {
      setSaving(false);
    }
  }

  if (!showForm) {
    return (
      <div className="px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
          <Plus size={13} strokeWidth={1.5} />
          Add deliverable
        </Button>
      </div>
    );
  }

  return (
    <Card className="m-5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>New deliverable</Label>
        <Button size="sm" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>
          <X size={13} strokeWidth={1.5} />
          Cancel
        </Button>
      </div>

      <div className="grid grid-cols-[140px_1fr] gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Type</Label>
          <Select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
            className="capitalize"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Title</Label>
          <Input
            placeholder="Deliverable title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Drive URL (optional)</Label>
        <Input
          placeholder="https://drive.google.com/…"
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>File name (optional)</Label>
        <Input
          placeholder="2026-05-31-scope.pdf"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Add deliverable"}
        </Button>
      </div>
    </Card>
  );
}
