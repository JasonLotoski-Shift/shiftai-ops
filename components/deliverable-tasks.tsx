"use client";

// Feature deliverable→task — the tasks attached to a single deliverable
// (Artifact), plus an inline "add task" form with a partner-assignment
// dropdown. Mirrors the task-row styling in components/tasks-views.tsx and
// reuses the assign-to-partner behavior via createDeliverableTask.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Label, Button, Input, Textarea, Select, Avatar, Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toggleTaskDone } from "@/app/(app)/dashboard/actions";
import { createDeliverableTask } from "@/app/(app)/projects/[id]/actions";
import type {
  TaskModel as Task,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import { Check, Plus, X } from "lucide-react";

type DeliverableTask = Task & { owner: Partner | null };
type PartnerOption = Pick<Partner, "id" | "name" | "initials">;

interface DeliverableTasksProps {
  artifactId: string;
  projectId: string;
  tasks: DeliverableTask[];
  partners: PartnerOption[];
  currentPartnerId: string;
}

const PRIORITIES = ["high", "medium", "low"] as const;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function DeliverableTasks({
  artifactId,
  projectId,
  tasks,
  partners,
  currentPartnerId,
}: DeliverableTasksProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || partners[0]?.id || "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [due, setDue] = useState(todayISO());
  const [context, setContext] = useState("");

  function resetForm() {
    setTitle("");
    setOwnerId(currentPartnerId || partners[0]?.id || "");
    setPriority("medium");
    setDue(todayISO());
    setContext("");
    setError(null);
  }

  // Optimistic flip — toggleTaskDone persists + writes the activity row, then
  // router.refresh re-pulls the server data.
  function toggleTask(id: string) {
    toggleTaskDone(id)
      .then(() => router.refresh())
      .catch((err) => console.error("toggleTaskDone failed:", err));
  }

  async function submit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createDeliverableTask({
        artifactId,
        projectId,
        title,
        ownerId,
        priority,
        due,
        context: context.trim() || undefined,
      });
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      console.error("createDeliverableTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Existing tasks */}
      {tasks.length > 0 && (
        <div className="flex flex-col">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[20px_1fr_90px_110px] gap-3 items-start py-2"
            >
              <button
                onClick={() => toggleTask(t.id)}
                aria-label={t.done ? "Mark task open" : "Mark task done"}
                className={`mt-0.5 w-4 h-4 border rounded-[var(--radius-sm)] flex items-center justify-center transition-colors ${t.done ? "bg-diagnostic-steel/20 border-diagnostic-steel/50 text-diagnostic-steel" : "border-graphite-2 text-transparent hover:border-bone-mute"}`}
              >
                <Check size={10} strokeWidth={2.5} />
              </button>
              <div className="min-w-0 flex flex-col gap-1">
                <div className={`text-[13px] ${t.done ? "text-bone-mute line-through" : "text-bone"}`}>
                  {t.title}
                </div>
                {t.context && (
                  <p className="text-[11px] text-bone-mute leading-snug whitespace-pre-line line-clamp-2">
                    {t.context}
                  </p>
                )}
              </div>
              <div className="pt-0.5">
                <Badge tone={t.priority === "high" ? "red" : t.priority === "medium" ? "gold" : "neutral"}>
                  {t.priority}
                </Badge>
              </div>
              <div className="flex items-center justify-end gap-2 pt-0.5">
                <span className="mono text-[11px] text-bone-mute tabular-nums">{t.due ? formatDate(t.due) : "No date"}</span>
                {t.owner ? (
                  <span title={t.owner.name} className="inline-flex">
                    <Avatar initials={t.owner.initials} size="sm" />
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-full border border-dashed border-bone-mute/50 inline-flex items-center justify-center text-[9px] text-bone-mute shrink-0" title="Unassigned">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add-task form / trigger */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-[12px] text-bone-dim hover:text-bone w-fit"
        >
          <Plus size={12} strokeWidth={1.5} />
          Add task
        </button>
      ) : (
        <div className="flex flex-col gap-3 border-t border-graphite pt-3 mt-1">
          <div className="flex items-center justify-between">
            <Label>New task</Label>
            <button
              onClick={() => { resetForm(); setShowForm(false); }}
              className="flex items-center gap-1 text-[11px] text-bone-mute hover:text-bone"
            >
              <X size={12} strokeWidth={1.5} />
              Cancel
            </button>
          </div>

          <Input
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Assign to</Label>
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === currentPartnerId ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Priority</Label>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
                className="capitalize"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Due</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Context (optional)</Label>
            <Textarea
              rows={3}
              placeholder="Notes, links, or the why — what an agent would need to act on this."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>

          {error && <p className="text-[12px] text-flag-red">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { resetForm(); setShowForm(false); }} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
              {saving ? "Saving…" : "Add task"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
