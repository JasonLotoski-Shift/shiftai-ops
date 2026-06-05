"use client";

// MilestoneDetailModal — opened from a milestone card on the Task Board.
//
// Shows the milestone's fields with inline pencil edits (Title / Owner /
// Category + sub-tag / Stage / Date), a progress bar over its sub-tasks, the
// sub-task list (each row with an assignee Select + a stage dropdown), and an
// "+ Add sub-task" form. Sub-tasks change stage HERE — they don't drag on the
// board. Reuses the visual language of components/milestone-epic.tsx.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Label, Badge, Button, Input, Select, Avatar } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { updateTask, updateTaskStatus } from "@/app/(app)/tasks/actions";
import {
  createMilestoneTask,
  updateMilestone,
  updateMilestoneBoardStatus,
  setMilestoneArchived,
} from "@/app/(app)/projects/[id]/actions";
import { cn } from "@/lib/cn";
import { Plus, X, Pencil, Check, Link2, Flag, Archive } from "lucide-react";
import { SubtaskDeleteControl } from "@/components/subtask-delete";
import type {
  BoardMilestone,
  PartnerOption,
  StatusKey,
} from "@/components/tasks-board";
import {
  COLUMNS,
  CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_TEXT,
  CATEGORY_DOT,
  STATUS_LABEL,
  PRIORITIES,
  milestoneLink,
  todayISO,
  toDateInput,
} from "@/components/tasks-board";
import type { WorkCategory } from "@/lib/generated/prisma/enums";

/* Owner avatar (or dashed "Unassigned" placeholder). */
function OwnerChip({
  owner,
}: {
  owner: { name: string; initials: string } | null;
}) {
  if (owner) {
    return (
      <span title={owner.name} className="inline-flex items-center gap-1.5">
        <Avatar initials={owner.initials} size="sm" />
        <span className="text-[12px] text-bone-dim">{owner.name}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-5 h-5 rounded-[var(--radius-pill)] border border-dashed border-bone-mute/50 inline-flex items-center justify-center text-[9px] text-bone-mute">
        —
      </span>
      <span className="text-[12px] text-bone-mute">Unassigned</span>
    </span>
  );
}

export function MilestoneDetailModal({
  milestone,
  partners,
  currentPartnerId,
  onClose,
}: {
  milestone: BoardMilestone;
  partners: PartnerOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  const router = useRouter();

  // Which field is in edit mode (only one at a time).
  const [editField, setEditField] = useState<
    null | "title" | "owner" | "category" | "stage" | "date"
  >(null);
  const [busy, setBusy] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field draft state.
  const [title, setTitle] = useState(milestone.title);
  const [ownerId, setOwnerId] = useState(milestone.ownerId ?? "");
  const [category, setCategory] = useState<WorkCategory>(milestone.category);
  const [categoryLabel, setCategoryLabel] = useState(milestone.categoryLabel ?? "");
  const [stage, setStage] = useState<StatusKey>(milestone.boardStatus);
  const [date, setDate] = useState(toDateInput(milestone.dueDate));

  // Add sub-task form.
  const [showAdd, setShowAdd] = useState(false);
  const [stTitle, setStTitle] = useState("");
  const [stOwnerId, setStOwnerId] = useState("");
  const [stPriority, setStPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [stDue, setStDue] = useState(todayISO());

  const link = milestoneLink(milestone);
  const tasks = milestone.tasks;
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditField(null);
      router.refresh();
    } catch (err) {
      console.error("milestone update failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function saveTitle() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    run(() => updateMilestone(milestone.id, { title: title.trim() }));
  }
  function saveOwner() {
    run(() => updateMilestone(milestone.id, { ownerId: ownerId || null }));
  }
  function saveCategory() {
    run(() =>
      updateMilestone(milestone.id, {
        category,
        categoryLabel: categoryLabel.trim() || null,
      }),
    );
  }
  function saveStage() {
    run(() => updateMilestoneBoardStatus(milestone.id, stage));
  }
  function saveDate() {
    run(() => updateMilestone(milestone.id, { dueDate: date || null }));
  }

  async function toggleArchive() {
    setArchiving(true);
    setError(null);
    try {
      await setMilestoneArchived(milestone.id, !milestone.archivedAt);
      onClose(); // parent refreshes the board
    } catch (err) {
      console.error("setMilestoneArchived failed:", err);
      setError(err instanceof Error ? err.message : "Failed to update archive");
      setArchiving(false);
    }
  }

  async function addSubtask() {
    if (!stTitle.trim()) {
      setError("Sub-task title is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createMilestoneTask({
        milestoneId: milestone.id,
        title: stTitle.trim(),
        ownerId: stOwnerId || undefined,
        priority: stPriority,
        due: stDue,
      });
      setStTitle("");
      setStOwnerId("");
      setStPriority("medium");
      setStDue(todayISO());
      setShowAdd(false);
      router.refresh();
    } catch (err) {
      console.error("createMilestoneTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to add sub-task");
    } finally {
      setBusy(false);
    }
  }

  function changeSubtaskOwner(taskId: string, next: string) {
    updateTask(taskId, { ownerId: next || null })
      .then(() => router.refresh())
      .catch((err) => console.error("updateTask (owner) failed:", err));
  }
  function changeSubtaskStage(taskId: string, next: StatusKey) {
    updateTaskStatus(taskId, next)
      .then(() => router.refresh())
      .catch((err) => console.error("updateTaskStatus failed:", err));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1 min-w-0">
            <Label gold>Milestone</Label>
            {editField === "title" ? (
              <div className="flex items-center gap-2">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                <Button size="sm" variant="primary" onClick={saveTitle} disabled={busy}>
                  Save
                </Button>
                <button
                  onClick={() => {
                    setTitle(milestone.title);
                    setEditField(null);
                  }}
                  className="text-bone-mute hover:text-bone"
                  aria-label="Cancel"
                >
                  <X size={16} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Flag size={15} strokeWidth={1.5} className={CATEGORY_TEXT[milestone.category]} />
                <h2 className="text-[18px] text-bone truncate">{milestone.title}</h2>
                <button
                  onClick={() => {
                    setTitle(milestone.title);
                    setEditField("title");
                  }}
                  className="text-bone-mute hover:text-track-gold shrink-0"
                  title="Edit title"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                </button>
              </div>
            )}
            {link && (
              <Link
                href={link.href}
                className="inline-flex items-center gap-1.5 text-[12px] text-diagnostic-steel hover:underline w-fit mt-0.5"
              >
                <Link2 size={12} strokeWidth={1.5} />
                {link.label}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={toggleArchive}
              disabled={archiving}
              title={milestone.archivedAt ? "Restore from archive" : "Move to Archive"}
              className="inline-flex items-center gap-1 text-[11px] text-bone-mute hover:text-bone disabled:opacity-50"
            >
              <Archive size={12} strokeWidth={1.5} />
              {archiving ? "…" : milestone.archivedAt ? "Restore" : "Archive"}
            </button>
            <button onClick={onClose} aria-label="Close" className="text-bone-mute hover:text-bone">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Fields grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Owner */}
          <FieldRow
            label="Owner"
            editing={editField === "owner"}
            onEdit={() => {
              setOwnerId(milestone.ownerId ?? "");
              setEditField("owner");
            }}
            onCancel={() => setEditField(null)}
            onSave={saveOwner}
            busy={busy}
            display={<OwnerChip owner={milestone.owner} />}
          >
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === currentPartnerId ? " (you)" : ""}
                </option>
              ))}
            </Select>
          </FieldRow>

          {/* Stage (boardStatus) */}
          <FieldRow
            label="Stage"
            editing={editField === "stage"}
            onEdit={() => {
              setStage(milestone.boardStatus);
              setEditField("stage");
            }}
            onCancel={() => setEditField(null)}
            onSave={saveStage}
            busy={busy}
            display={<Badge tone="gold">{STATUS_LABEL[milestone.boardStatus]}</Badge>}
          >
            <Select value={stage} onChange={(e) => setStage(e.target.value as StatusKey)}>
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FieldRow>

          {/* Category + sub-tag */}
          <FieldRow
            label="Category"
            editing={editField === "category"}
            onEdit={() => {
              setCategory(milestone.category);
              setCategoryLabel(milestone.categoryLabel ?? "");
              setEditField("category");
            }}
            onCancel={() => setEditField(null)}
            onSave={saveCategory}
            busy={busy}
            display={
              <span className="inline-flex items-center gap-1.5 text-[12px]">
                <span className={cn("w-1.5 h-1.5 rounded-full", CATEGORY_DOT[milestone.category])} />
                <span className={CATEGORY_TEXT[milestone.category]}>
                  {CATEGORY_LABEL[milestone.category]}
                </span>
                {milestone.categoryLabel && (
                  <span className="text-bone-mute">· {milestone.categoryLabel}</span>
                )}
              </span>
            }
          >
            <div className="flex flex-col gap-2">
              <Select value={category} onChange={(e) => setCategory(e.target.value as WorkCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
              <Input
                placeholder="Sub-tag (e.g. BD, Admin)"
                value={categoryLabel}
                onChange={(e) => setCategoryLabel(e.target.value)}
              />
            </div>
          </FieldRow>

          {/* Date */}
          <FieldRow
            label="Date"
            editing={editField === "date"}
            onEdit={() => {
              setDate(toDateInput(milestone.dueDate));
              setEditField("date");
            }}
            onCancel={() => setEditField(null)}
            onSave={saveDate}
            busy={busy}
            display={
              <span className="text-[12px] text-bone-dim">
                {milestone.dueDate ? formatDate(milestone.dueDate) : "No date"}
              </span>
            }
          >
            <div className="flex items-center gap-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              {date && (
                <button
                  onClick={() => setDate("")}
                  className="shrink-0 text-[11px] text-bone-mute hover:text-bone"
                  title="Clear date"
                >
                  Clear
                </button>
              )}
            </div>
          </FieldRow>
        </div>

        {/* Progress / tracking bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>Progress</Label>
            <span className="mono text-[11px] text-bone-mute tabular-nums">
              {done}/{total} done · {pct}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-graphite rounded-[var(--radius-pill)] overflow-hidden">
            <div
              className="h-full bg-signal-fresh transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {error && <p className="text-[12px] text-flag-red">{error}</p>}

        {/* Sub-tasks */}
        <div className="flex flex-col gap-2">
          <Label>Sub-tasks</Label>
          {tasks.length === 0 && (
            <p className="text-[12px] text-bone-mute">No sub-tasks yet.</p>
          )}
          {tasks.map((t) => (
            <div
              key={t.id}
              className="group grid grid-cols-[16px_1fr_150px_140px_24px] gap-3 items-center py-1.5 border-b border-graphite last:border-b-0"
            >
              <span
                className={cn(
                  "w-4 h-4 rounded-[var(--radius-sm)] border flex items-center justify-center",
                  t.done
                    ? "bg-diagnostic-steel/20 border-diagnostic-steel/50 text-diagnostic-steel"
                    : "border-graphite-2 text-transparent",
                )}
              >
                <Check size={10} strokeWidth={2.5} />
              </span>
              <span className={cn("text-[13px] truncate", t.done ? "text-bone-mute line-through" : "text-bone")}>
                {t.title}
              </span>
              <Select
                value={t.ownerId ?? ""}
                onChange={(e) => changeSubtaskOwner(t.id, e.target.value)}
                className="h-7 text-[12px]"
              >
                <option value="">Unassigned</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === currentPartnerId ? " (you)" : ""}
                  </option>
                ))}
              </Select>
              <Select
                value={t.status}
                onChange={(e) => changeSubtaskStage(t.id, e.target.value as StatusKey)}
                className="h-7 text-[12px]"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <div className="flex justify-end opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <SubtaskDeleteControl taskId={t.id} />
              </div>
            </div>
          ))}

          {/* Add sub-task */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-[12px] text-bone-dim hover:text-bone w-fit mt-1"
            >
              <Plus size={12} strokeWidth={1.5} />
              Add sub-task
            </button>
          ) : (
            <div className="flex flex-col gap-3 border-t border-graphite pt-3 mt-1">
              <Input
                placeholder="What needs doing?"
                value={stTitle}
                onChange={(e) => setStTitle(e.target.value)}
                autoFocus
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Assign to</Label>
                  <Select value={stOwnerId} onChange={(e) => setStOwnerId(e.target.value)}>
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
                  <Label>Priority</Label>
                  <Select
                    value={stPriority}
                    onChange={(e) => setStPriority(e.target.value as (typeof PRIORITIES)[number])}
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
                  <Input type="date" value={stDue} onChange={(e) => setStDue(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAdd(false);
                    setStTitle("");
                  }}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={addSubtask} disabled={busy}>
                  {busy ? "Saving…" : "Add sub-task"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

/* A labelled field row with an inline pencil → editor → save/cancel. */
function FieldRow({
  label,
  display,
  editing,
  onEdit,
  onCancel,
  onSave,
  busy,
  children,
}: {
  label: string;
  display: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {editing ? (
        <div className="flex flex-col gap-2">
          {children}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={onSave} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 min-h-[28px]">
          {display}
          <button
            onClick={onEdit}
            className="text-bone-mute hover:text-track-gold shrink-0"
            title={`Edit ${label.toLowerCase()}`}
          >
            <Pencil size={12} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
