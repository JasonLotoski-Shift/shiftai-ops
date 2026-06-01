"use client";

// Milestone epic card — an assignable parent ("epic") with its sub-tasks.
// Mirrors components/deliverable-tasks.tsx for the task rows + inline "+ task"
// form, and components/project-fee-edit.tsx for the inline pencil editor.
//
// The card is expandable: header (status icon · title · category tag · owner ·
// due · chevron); expanded body lists sub-tasks (with toggleTaskDone optimistic
// flip) and the add-task form. A pencil opens an inline editor for the
// milestone's title / status / owner / date.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Label, Button, Input, Textarea, Select, Avatar, Badge } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { toggleTaskDone } from "@/app/(app)/dashboard/actions";
import {
  createMilestoneTask,
  updateMilestone,
} from "@/app/(app)/projects/[id]/actions";
import { cn } from "@/lib/cn";
import {
  Check,
  Plus,
  X,
  Pencil,
  ChevronRight,
  AlertTriangle,
  Circle,
  Link2,
} from "lucide-react";

const PRIORITIES = ["high", "medium", "low"] as const;
const STATUSES = ["pending", "in_progress", "complete", "at_risk"] as const;
const CATEGORIES = ["firm", "project", "pipeline", "other"] as const;

// Category → calm token tint (see CLAUDE category colours).
//   firm → track-gold · project → diagnostic-steel ·
//   pipeline → signal-fresh (calm green) · other → bone-mute
const CATEGORY_TONE: Record<string, "gold" | "steel" | "neutral" | "bone"> = {
  firm: "gold",
  project: "steel",
  pipeline: "neutral",
  other: "bone",
};
const CATEGORY_DOT: Record<string, string> = {
  firm: "bg-track-gold",
  project: "bg-diagnostic-steel",
  pipeline: "bg-signal-fresh",
  other: "bg-bone-mute",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// A date (string | Date) → "YYYY-MM-DD" for <input type="date">.
function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

type EpicTask = {
  id: string;
  title: string;
  context?: string | null;
  priority: string;
  status: string;
  done: boolean;
  due: string | Date;
  owner: { name: string; initials: string } | null;
};

type PartnerOption = { id: string; name: string; initials: string };

interface MilestoneEpicProps {
  milestone: {
    id: string;
    title: string;
    status: string;
    dueDate: string | Date | null;
    ownerId: string | null;
    owner?: { name: string; initials: string } | null;
    category: string;
    categoryLabel?: string | null;
    tasks: EpicTask[];
  };
  projectId: string;
  partners: PartnerOption[];
  currentPartnerId: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "complete") {
    return (
      <div className="w-6 h-6 bg-diagnostic-steel/20 border border-diagnostic-steel/50 rounded-[var(--radius-sm)] flex items-center justify-center">
        <Check size={12} strokeWidth={2} className="text-diagnostic-steel" />
      </div>
    );
  }
  if (status === "at_risk") {
    return (
      <div className="w-6 h-6 bg-flag-red/20 border border-flag-red/50 rounded-[var(--radius-sm)] flex items-center justify-center">
        <AlertTriangle size={12} strokeWidth={2} className="text-flag-red" />
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div className="w-6 h-6 bg-track-gold-dim/30 border border-track-gold rounded-[var(--radius-sm)] flex items-center justify-center">
        <Circle size={8} strokeWidth={3} className="text-track-gold animate-pulse" fill="currentColor" />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 border border-graphite-2 rounded-[var(--radius-sm)] flex items-center justify-center">
      <Circle size={8} strokeWidth={1.5} className="text-bone-mute" />
    </div>
  );
}

export function MilestoneEpic({
  milestone,
  projectId,
  partners,
  currentPartnerId,
}: MilestoneEpicProps) {
  const router = useRouter();

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  // Add-task form state (mirrors deliverable-tasks).
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState(currentPartnerId || partners[0]?.id || "");
  const [taskPriority, setTaskPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [taskDue, setTaskDue] = useState(todayISO());
  const [taskContext, setTaskContext] = useState("");

  // Inline-edit form state.
  const [editTitle, setEditTitle] = useState(milestone.title);
  const [editStatus, setEditStatus] = useState<(typeof STATUSES)[number]>(
    (STATUSES.includes(milestone.status as (typeof STATUSES)[number])
      ? milestone.status
      : "pending") as (typeof STATUSES)[number],
  );
  const [editOwnerId, setEditOwnerId] = useState(milestone.ownerId ?? "");
  const [editDate, setEditDate] = useState(toDateInput(milestone.dueDate));
  const [editCategory, setEditCategory] = useState<(typeof CATEGORIES)[number]>(
    (CATEGORIES.includes(milestone.category as (typeof CATEGORIES)[number])
      ? milestone.category
      : "firm") as (typeof CATEGORIES)[number],
  );
  const [editCategoryLabel, setEditCategoryLabel] = useState(milestone.categoryLabel ?? "");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const categoryTone = CATEGORY_TONE[milestone.category] ?? "neutral";
  const categoryDot = CATEGORY_DOT[milestone.category] ?? "bg-bone-mute";

  function resetTaskForm() {
    setTaskTitle("");
    setTaskOwnerId(currentPartnerId || partners[0]?.id || "");
    setTaskPriority("medium");
    setTaskDue(todayISO());
    setTaskContext("");
    setTaskError(null);
  }

  function openEdit() {
    setEditTitle(milestone.title);
    setEditStatus(
      (STATUSES.includes(milestone.status as (typeof STATUSES)[number])
        ? milestone.status
        : "pending") as (typeof STATUSES)[number],
    );
    setEditOwnerId(milestone.ownerId ?? "");
    setEditDate(toDateInput(milestone.dueDate));
    setEditCategory(
      (CATEGORIES.includes(milestone.category as (typeof CATEGORIES)[number])
        ? milestone.category
        : "firm") as (typeof CATEGORIES)[number],
    );
    setEditCategoryLabel(milestone.categoryLabel ?? "");
    setEditError(null);
    setEditing(true);
    setExpanded(true);
  }

  // Optimistic flip — toggleTaskDone persists + writes the activity row, then
  // router.refresh re-pulls server data.
  function toggleTask(id: string) {
    toggleTaskDone(id)
      .then(() => router.refresh())
      .catch((err) => console.error("toggleTaskDone failed:", err));
  }

  async function submitTask() {
    if (!taskTitle.trim()) {
      setTaskError("Title is required");
      return;
    }
    setTaskSaving(true);
    setTaskError(null);
    try {
      await createMilestoneTask({
        milestoneId: milestone.id,
        title: taskTitle,
        ownerId: taskOwnerId,
        priority: taskPriority,
        due: taskDue,
        context: taskContext.trim() || undefined,
      });
      resetTaskForm();
      setShowTaskForm(false);
      router.refresh();
    } catch (err) {
      console.error("createMilestoneTask failed:", err);
      setTaskError(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setTaskSaving(false);
    }
  }

  async function saveEdit() {
    if (!editTitle.trim()) {
      setEditError("Title is required");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await updateMilestone(milestone.id, {
        title: editTitle.trim(),
        status: editStatus,
        ownerId: editOwnerId || null,
        dueDate: editDate || null,
        category: editCategory,
        categoryLabel: editCategoryLabel.trim() || null,
      });
      setEditing(false);
      router.refresh();
    } catch (err) {
      console.error("updateMilestone failed:", err);
      setEditError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setEditSaving(false);
    }
  }

  async function clearDate() {
    setEditDate("");
    setEditSaving(true);
    setEditError(null);
    try {
      await updateMilestone(milestone.id, { dueDate: null });
      router.refresh();
    } catch (err) {
      console.error("updateMilestone (clear date) failed:", err);
      setEditError(err instanceof Error ? err.message : "Failed to clear date");
    } finally {
      setEditSaving(false);
    }
  }

  const taskCount = milestone.tasks.length;
  const doneCount = milestone.tasks.filter((t) => t.done).length;

  return (
    <div className="border-b border-graphite last:border-b-0">
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse milestone" : "Expand milestone"}
          className="shrink-0 text-bone-mute hover:text-bone transition-transform"
        >
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            className={cn("transition-transform", expanded && "rotate-90")}
          />
        </button>

        <div className="shrink-0">
          <StatusIcon status={milestone.status} />
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-bone truncate">{milestone.title}</span>
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full", categoryDot)} />
              <Badge tone={categoryTone}>
                {milestone.categoryLabel?.trim() || milestone.category.replace("_", "-")}
              </Badge>
            </span>
          </div>
          <div className="label mt-0.5 flex items-center gap-2">
            <span>{milestone.dueDate ? `Due ${formatDate(milestone.dueDate)}` : "No date"}</span>
            {taskCount > 0 && (
              <span className="text-bone-mute tabular-nums">
                · {doneCount}/{taskCount} tasks
              </span>
            )}
          </div>
        </button>

        {/* This milestone also lives on the Task Board — jump to it. */}
        <Link
          href="/tasks"
          onClick={(e) => e.stopPropagation()}
          title="On the Task Board"
          className="text-bone-mute hover:text-track-gold shrink-0"
        >
          <Link2 size={13} strokeWidth={1.5} />
        </Link>

        {milestone.owner ? (
          <span title={milestone.owner.name} className="inline-flex shrink-0">
            <Avatar initials={milestone.owner.initials} size="sm" />
          </span>
        ) : (
          <span className="label text-[10px] text-bone-mute shrink-0">Unassigned</span>
        )}

        <Badge
          tone={
            milestone.status === "complete"
              ? "steel"
              : milestone.status === "at_risk"
                ? "red"
                : milestone.status === "in_progress"
                  ? "gold"
                  : "neutral"
          }
        >
          {milestone.status.replace("_", "-")}
        </Badge>

        <button
          onClick={openEdit}
          className="shrink-0 text-bone-mute hover:text-track-gold transition-colors"
          title="Edit milestone"
        >
          <Pencil size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-4 pl-[60px] flex flex-col gap-4">
          {/* Inline editor */}
          {editing && (
            <div className="flex flex-col gap-3 bg-bitumen rounded-[var(--radius)] p-4">
              <div className="flex items-center justify-between">
                <Label>Edit milestone</Label>
                <button
                  onClick={() => setEditing(false)}
                  className="flex items-center gap-1 text-[11px] text-bone-mute hover:text-bone"
                >
                  <X size={12} strokeWidth={1.5} />
                  Cancel
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as (typeof STATUSES)[number])}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace("_", "-")}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Owner</Label>
                  <Select value={editOwnerId} onChange={(e) => setEditOwnerId(e.target.value)}>
                    <option value="">Unassigned</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.id === currentPartnerId ? " (you)" : ""}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Due date</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    disabled={editSaving}
                  />
                  <button
                    onClick={clearDate}
                    disabled={editSaving || !editDate}
                    className="shrink-0 text-[11px] text-bone-mute hover:text-bone disabled:opacity-40"
                    title="Clear date"
                  >
                    Clear date
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Category</Label>
                  <Select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as (typeof CATEGORIES)[number])}
                    className="capitalize"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Category label (optional)</Label>
                  <Input
                    placeholder="Override the tag, e.g. “Q3 planning”"
                    value={editCategoryLabel}
                    onChange={(e) => setEditCategoryLabel(e.target.value)}
                  />
                </div>
              </div>

              {editError && <p className="text-[12px] text-flag-red">{editError}</p>}

              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={editSaving}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          )}

          {/* Sub-tasks (mirrors deliverable-tasks task rows) */}
          {milestone.tasks.length > 0 && (
            <div className="flex flex-col">
              {milestone.tasks.map((t) => (
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
                    <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(t.due)}</span>
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
          {!showTaskForm ? (
            <button
              onClick={() => setShowTaskForm(true)}
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
                  onClick={() => {
                    resetTaskForm();
                    setShowTaskForm(false);
                  }}
                  className="flex items-center gap-1 text-[11px] text-bone-mute hover:text-bone"
                >
                  <X size={12} strokeWidth={1.5} />
                  Cancel
                </button>
              </div>

              <Input
                placeholder="What needs doing?"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                autoFocus
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Assign to</Label>
                  <Select value={taskOwnerId} onChange={(e) => setTaskOwnerId(e.target.value)}>
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
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as (typeof PRIORITIES)[number])}
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
                  <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Context (optional)</Label>
                <Textarea
                  rows={3}
                  placeholder="Notes, links, or the why — what an agent would need to act on this."
                  value={taskContext}
                  onChange={(e) => setTaskContext(e.target.value)}
                />
              </div>

              {taskError && <p className="text-[12px] text-flag-red">{taskError}</p>}

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    resetTaskForm();
                    setShowTaskForm(false);
                  }}
                  disabled={taskSaving}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={submitTask} disabled={taskSaving}>
                  {taskSaving ? "Saving…" : "Add task"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
