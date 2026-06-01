"use client";

// Feature 6 — inline "add milestone" form. Manual partner entry: calls
// createMilestone, which creates the row live (no approval queue).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Button, Input, Select } from "@/components/ui";
import { createMilestone } from "@/app/(app)/projects/[id]/actions";
import { Plus, X } from "lucide-react";

const STATUSES = ["pending", "in_progress", "complete", "at_risk"] as const;

type PartnerOption = { id: string; name: string; initials: string };

export function ManualMilestoneForm({
  projectId,
  partners,
  currentPartnerId,
}: {
  projectId: string;
  partners: PartnerOption[];
  currentPartnerId?: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  // Date is optional — blank means an undated milestone (off the timeline).
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [ownerId, setOwnerId] = useState(currentPartnerId ?? "");

  function resetForm() {
    setTitle("");
    setDueDate("");
    setStatus("pending");
    setOwnerId(currentPartnerId ?? "");
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
      // category auto-defaults to "project" server-side (scope-derived) — don't set it.
      await createMilestone({
        projectId,
        title,
        dueDate: dueDate || null,
        status,
        ownerId: ownerId || null,
      });
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      console.error("createMilestone failed:", err);
      setError(err instanceof Error ? err.message : "Failed to add milestone");
    } finally {
      setSaving(false);
    }
  }

  if (!showForm) {
    return (
      <div className="px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
          <Plus size={13} strokeWidth={1.5} />
          Add milestone
        </Button>
      </div>
    );
  }

  return (
    <Card className="m-5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Label>New milestone</Label>
        <Button size="sm" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }}>
          <X size={13} strokeWidth={1.5} />
          Cancel
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Title</Label>
        <Input
          placeholder="What's the milestone?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Owner</Label>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === currentPartnerId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Due (optional)</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", "-")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Add milestone"}
        </Button>
      </div>
    </Card>
  );
}
