"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Input, Textarea, Select, Avatar, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toggleTaskDone } from "@/app/(app)/dashboard/actions";
import { createTask } from "@/app/(app)/tasks/actions";
import type {
  TaskModel as Task,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import { Check, Plus, X, ListChecks } from "lucide-react";

type TaskRow = Task & { owner: Partner; assignedBy: Partner | null };
type PartnerOption = Pick<Partner, "id" | "name" | "initials">;
type DeliverableOption = { id: string; title: string; projectId: string | null };
type ProjectOption = { id: string; name: string; artifacts: DeliverableOption[] };

interface TasksViewsProps {
  initialTasks: TaskRow[];
  partners: PartnerOption[];
  projects: ProjectOption[];
  currentPartnerId: string;
}

const PRIORITIES = ["high", "medium", "low"] as const;

// A starter scaffold so the context box is never blank — partners edit it,
// and (Phase 4+) agents read it. Manual today; AI-suggested when the Claude
// API wiring lands.
const CONTEXT_TEMPLATE =
  "Why this matters:\nWhat done looks like:\nLinks / references:";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function TasksViews({ initialTasks, partners, projects, currentPartnerId }: TasksViewsProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resync when the server component re-renders (after create/toggle revalidate).
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Form state
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || partners[0]?.id || "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [due, setDue] = useState(todayISO());
  const [relatedTo, setRelatedTo] = useState("");
  const [context, setContext] = useState("");
  const [projectId, setProjectId] = useState("");
  const [artifactId, setArtifactId] = useState("");

  // Deliverable options filter to the chosen project (and are optional).
  const deliverables = projectId
    ? projects.find((p) => p.id === projectId)?.artifacts ?? []
    : [];

  function resetForm() {
    setTitle("");
    setOwnerId(currentPartnerId || partners[0]?.id || "");
    setPriority("medium");
    setDue(todayISO());
    setRelatedTo("");
    setContext("");
    setProjectId("");
    setArtifactId("");
    setError(null);
  }

  // Changing the project clears any deliverable selection that no longer applies.
  function onProjectChange(next: string) {
    setProjectId(next);
    setArtifactId("");
  }

  // Optimistic flip — toggleTaskDone persists + writes the activity row.
  function toggleTask(id: string) {
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    startTransition(async () => {
      try {
        await toggleTaskDone(id);
      } catch (err) {
        console.error("toggleTaskDone failed:", err);
        setTasks(previous);
      }
    });
  }

  async function submit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTask({
        title,
        ownerId,
        priority,
        due,
        context: context.trim() || undefined,
        relatedTo: relatedTo.trim() || undefined,
        projectId: projectId || undefined,
        artifactId: artifactId || undefined,
      });
      resetForm();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      console.error("createTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <Label>All tasks</Label>
        <Button size="sm" variant={showForm ? "ghost" : "secondary"} onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X size={13} strokeWidth={1.5} /> : <Plus size={13} strokeWidth={1.5} />}
          {showForm ? "Cancel" : "New task"}
        </Button>
      </div>

      {/* Create / assign form */}
      {showForm && (
        <Card className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Task</Label>
            <Input
              placeholder="What needs doing?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
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
            <Label>Related to (optional)</Label>
            <Input
              placeholder="Client / project / contact"
              value={relatedTo}
              onChange={(e) => setRelatedTo(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Project (optional)</Label>
              <Select value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Deliverable (optional)</Label>
              <Select
                value={artifactId}
                onChange={(e) => setArtifactId(e.target.value)}
                disabled={!projectId || deliverables.length === 0}
              >
                <option value="">
                  {!projectId
                    ? "Choose a project first"
                    : deliverables.length === 0
                      ? "No deliverables"
                      : "No deliverable"}
                </option>
                {deliverables.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Context</Label>
              <button
                type="button"
                onClick={() => setContext(CONTEXT_TEMPLATE)}
                className="label text-[9px] text-track-gold hover:underline"
              >
                Insert template
              </button>
            </div>
            <Textarea
              rows={4}
              placeholder="Manual notes, links, or the why — what an agent would need to act on this."
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
              {saving ? "Saving…" : "Create task"}
            </Button>
          </div>
        </Card>
      )}

      {/* Task list */}
      <Card>
        {tasks.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={28} strokeWidth={1.5} />}
            title="No tasks yet"
            hint="Create a task to start tracking work."
          />
        ) : (
          tasks.map((t, i) => (
            <div
              key={t.id}
              className="grid grid-cols-[24px_1fr_120px_140px] gap-4 items-start px-5 py-4 hover:bg-[var(--color-row-hover)]"
            >
              <button
                onClick={() => toggleTask(t.id)}
                aria-label={t.done ? "Mark task open" : "Mark task done"}
                className={`mt-0.5 w-5 h-5 border rounded-[var(--radius-sm)] flex items-center justify-center transition-colors ${t.done ? "bg-diagnostic-steel/20 border-diagnostic-steel/50 text-diagnostic-steel" : "border-graphite-2 text-transparent hover:border-bone-mute"}`}
              >
                <Check size={12} strokeWidth={2.5} />
              </button>
              <div className="min-w-0 flex flex-col gap-1">
                <div className={`text-[14px] ${t.done ? "text-bone-mute line-through" : "text-bone"}`}>
                  {t.title}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {t.relatedTo && <span className="text-[11px] text-bone-mute">{t.relatedTo}</span>}
                  {t.assignedBy && (
                    <span className="label text-[9px]">assigned by {t.assignedBy.name.split(" ")[0]}</span>
                  )}
                </div>
                {t.context && (
                  <p className="text-[11px] text-bone-mute leading-snug whitespace-pre-line line-clamp-3 mt-0.5">
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
                <span title={t.owner.name} className="inline-flex">
                  <Avatar initials={t.owner.initials} size="sm" />
                </span>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
