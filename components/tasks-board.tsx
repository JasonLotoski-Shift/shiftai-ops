"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Input, Textarea, Select, Avatar } from "@/components/ui";
import { ModalShell as GuardedModalShell } from "@/components/modal-shell";
import { formatDate } from "@/lib/format";
import {
  createTask,
  updateTask,
  updateTaskStatus,
  archiveTask,
  deleteTask,
  promoteTaskToMilestone,
} from "@/app/(app)/tasks/actions";
import {
  createMilestone,
  updateMilestoneBoardStatus,
  setMilestoneArchived,
  deleteMilestone,
  demoteMilestoneToTask,
} from "@/app/(app)/projects/[id]/actions";
import { MilestoneDetailModal } from "@/components/milestone-detail-modal";
import { cn } from "@/lib/cn";
import {
  Plus,
  X,
  Flag,
  Link2,
  AlertTriangle,
  Archive,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
} from "lucide-react";
import type { PartnerModel as Partner } from "@/lib/generated/prisma/models";
import type { TaskStatus, WorkCategory } from "@/lib/generated/prisma/enums";

/* ──────────────────────────────────────────────────────────────────────
   Shared shapes + maps (exported — the detail modal imports them).
   ────────────────────────────────────────────────────────────────────── */

export type StatusKey = TaskStatus;

export type PartnerOption = Pick<Partner, "id" | "name" | "initials">;
export type ProjectOption = { id: string; name: string };
export type ClientOption = { id: string; company: string };
export type DealOption = { id: string; company: string };
export type ContactOption = { id: string; name: string; company: string };

type OwnerRef = { id: string; name: string; initials: string } | null;

export type BoardSubTask = {
  id: string;
  title: string;
  status: StatusKey;
  done: boolean;
  priority: string;
  due: string | null;
  context: string | null;
  ownerId: string | null;
  owner: OwnerRef;
};

export type BoardMilestone = {
  id: string;
  title: string;
  boardStatus: StatusKey;
  status: string;
  ownerId: string | null;
  owner: OwnerRef;
  category: WorkCategory;
  categoryLabel: string | null;
  dueDate: string | null;
  /** ISO timestamp when archived (in the Archive column), else null. */
  archivedAt: string | null;
  // Milestones tag client/project only (2c) — no deal scope.
  projectId: string | null;
  clientId: string | null;
  project: { id: string; name: string } | null;
  client: { id: string; company: string } | null;
  tasks: BoardSubTask[];
};

export type BoardOrphanTask = {
  id: string;
  title: string;
  status: StatusKey;
  done: boolean;
  priority: string;
  due: string | null;
  context: string | null;
  category: WorkCategory;
  categoryLabel: string | null;
  /** ISO timestamp when archived (in the Archive column), else null. */
  archivedAt: string | null;
  ownerId: string | null;
  owner: OwnerRef;
  projectId: string | null;
  clientId: string | null;
  dealId: string | null;
  contactId: string | null;
  project: { id: string; name: string } | null;
  client: { id: string; company: string } | null;
  deal: { id: string; company: string } | null;
  contact: { id: string; name: string } | null;
};

interface TasksBoardProps {
  milestones: BoardMilestone[];
  orphanTasks: BoardOrphanTask[];
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  deals: DealOption[];
  contacts: ContactOption[];
  currentPartnerId: string;
}

export const COLUMNS: { key: StatusKey; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To Do" },
  { key: "todo_priority", label: "To Do Priority" },
  { key: "staging", label: "Staging" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

// The board renders the 4 status columns plus a terminal Archive column.
// Archive isn't a TaskStatus — a milestone is "in Archive" iff archivedAt is set
// (drag it there); the server hides anything archived more than 7 days ago. Only
// milestones archive; orphan tasks can't be dropped into Archive.
export type BoardColumnKey = StatusKey | "archive";
export const ARCHIVE_HIDE_DAYS = 7;
export const BOARD_COLUMNS: { key: BoardColumnKey; label: string }[] = [
  ...COLUMNS,
  { key: "archive", label: "Archive" },
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  backlog: "Backlog",
  todo: "To Do",
  todo_priority: "To Do Priority",
  staging: "Staging",
  in_progress: "In Progress",
  done: "Done",
};

export const CATEGORIES: WorkCategory[] = ["firm", "project", "pipeline", "other"];

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
  firm: "Firm",
  project: "Projects",
  pipeline: "Pipeline",
  other: "Other",
};

export const CATEGORY_BORDER: Record<WorkCategory, string> = {
  firm: "border-l-track-gold",
  project: "border-l-diagnostic-steel",
  pipeline: "border-l-signal-fresh",
  other: "border-l-bone-mute",
};

export const CATEGORY_TEXT: Record<WorkCategory, string> = {
  firm: "text-track-gold",
  project: "text-diagnostic-steel",
  pipeline: "text-signal-fresh",
  other: "text-bone-mute",
};

export const CATEGORY_DOT: Record<WorkCategory, string> = {
  firm: "bg-track-gold",
  project: "bg-diagnostic-steel",
  pipeline: "bg-signal-fresh",
  other: "bg-bone-mute",
};

export const PRIORITIES = ["high", "medium", "low"] as const;

const MILESTONE_STATUSES = ["pending", "in_progress", "complete", "at_risk"] as const;

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dueISO(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

export function toDateInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

// The record a milestone is tied to → a click-through link. Milestones tag
// client/project only (2c).
export function milestoneLink(
  m: Pick<BoardMilestone, "project" | "client" | "projectId" | "clientId">,
): { href: string; label: string } | null {
  if (m.project) return { href: `/projects/${m.project.id}`, label: m.project.name };
  if (m.client) return { href: `/clients/${m.client.id}`, label: m.client.company };
  return null;
}

/* ──────────────────────────────────────────────────────────────────────
   Board
   ────────────────────────────────────────────────────────────────────── */

export function TasksBoard({
  milestones: initialMilestones,
  orphanTasks: initialOrphans,
  partners,
  projects,
  clients,
  deals,
  contacts,
  currentPartnerId,
}: TasksBoardProps) {
  const router = useRouter();
  const [milestones, setMilestones] = useState(initialMilestones);
  const [orphans, setOrphans] = useState(initialOrphans);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BoardColumnKey | null>(null);

  // 2e — warn-before-delete. Holds the card pending deletion (task or milestone)
  // until the confirm modal resolves.
  const [deleting, setDeleting] = useState<
    | { kind: "m" | "t"; id: string; title: string }
    | null
  >(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Filters.
  const [filterOwner, setFilterOwner] = useState(""); // "" all · "__unassigned__" · partnerId
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterMilestone, setFilterMilestone] = useState("");

  // Overlays.
  const [detailMilestone, setDetailMilestone] = useState<BoardMilestone | null>(null);
  const [editing, setEditing] = useState<BoardOrphanTask | null>(null);
  const [creating, setCreating] = useState<null | "milestone" | { task: StatusKey }>(null);

  useEffect(() => setMilestones(initialMilestones), [initialMilestones]);
  useEffect(() => setOrphans(initialOrphans), [initialOrphans]);

  const UNASSIGNED = "__unassigned__";

  // Keep the detail modal's data fresh after a refresh.
  useEffect(() => {
    if (detailMilestone) {
      const next = initialMilestones.find((m) => m.id === detailMilestone.id);
      if (next) setDetailMilestone(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMilestones]);

  const filteredMilestones = useMemo(() => {
    return milestones.filter((m) => {
      if (filterMilestone && m.id !== filterMilestone) return false;
      if (filterCategory && m.category !== filterCategory) return false;
      if (filterProject && m.projectId !== filterProject) return false;
      if (filterOwner) {
        if (filterOwner === UNASSIGNED) {
          // Show milestones that are unowned OR have any unassigned sub-task.
          const needs = !m.ownerId || m.tasks.some((t) => !t.ownerId);
          if (!needs) return false;
        } else if (m.ownerId !== filterOwner && !m.tasks.some((t) => t.ownerId === filterOwner)) {
          return false;
        }
      }
      return true;
    });
  }, [milestones, filterMilestone, filterCategory, filterProject, filterOwner]);

  const filteredOrphans = useMemo(() => {
    // A milestone filter hides all orphans (they have no milestone).
    if (filterMilestone) return [];
    return orphans.filter((t) => {
      if (filterCategory && t.category !== filterCategory) return false;
      if (filterProject && t.projectId !== filterProject) return false;
      if (filterOwner) {
        if (filterOwner === UNASSIGNED) {
          if (t.ownerId) return false;
        } else if (t.ownerId !== filterOwner) return false;
      }
      return true;
    });
  }, [orphans, filterMilestone, filterCategory, filterProject, filterOwner]);

  const anyFilter = filterOwner || filterCategory || filterProject || filterMilestone;
  function clearFilters() {
    setFilterOwner("");
    setFilterCategory("");
    setFilterProject("");
    setFilterMilestone("");
  }

  /* drag-drop — a dragged id can be a milestone or an orphan task; we resolve
     which on drop. Mirror pipeline-board: optimistic move, revert on error. */

  function onDragStart(e: DragEvent, kind: "m" | "t", id: string) {
    setDraggingId(id);
    e.dataTransfer.setData("text/plain", `${kind}:${id}`);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  // Commit a milestone move into a real board column (optimistic; reverts on
  // error). Shared by a plain drop and the reviewer-picker confirm (2h).
  async function commitMilestoneMove(id: string, status: StatusKey) {
    const prev = milestones;
    setMilestones((cur) =>
      cur.map((x) => (x.id === id ? { ...x, boardStatus: status, archivedAt: null } : x)),
    );
    try {
      await updateMilestoneBoardStatus(id, status);
      router.refresh();
    } catch (err) {
      console.error("updateMilestoneBoardStatus failed:", err);
      setMilestones(prev);
    }
  }

  // Commit an orphan-task move into a real board column.
  async function commitTaskMove(id: string, status: StatusKey) {
    const prev = orphans;
    setOrphans((cur) =>
      cur.map((x) => (x.id === id ? { ...x, status, done: status === "done", archivedAt: null } : x)),
    );
    try {
      await updateTaskStatus(id, status);
      router.refresh();
    } catch (err) {
      console.error("updateTaskStatus failed:", err);
      setOrphans(prev);
    }
  }

  // 2a — promote an orphan task to a milestone (the task row is consumed).
  // Optimistic: drop it from the board, then refresh to pull in the new card.
  async function promote(id: string) {
    const prev = orphans;
    setOrphans((cur) => cur.filter((x) => x.id !== id));
    try {
      await promoteTaskToMilestone(id);
      router.refresh();
    } catch (err) {
      console.error("promoteTaskToMilestone failed:", err);
      setOrphans(prev);
    }
  }

  // 2a — demote a milestone to a standalone task (the milestone row is consumed).
  async function demote(id: string) {
    const prev = milestones;
    setMilestones((cur) => cur.filter((x) => x.id !== id));
    try {
      await demoteMilestoneToTask(id);
      router.refresh();
    } catch (err) {
      console.error("demoteMilestoneToTask failed:", err);
      setMilestones(prev);
    }
  }

  // 2e — confirmed delete. A milestone delete frees its child tasks to standalone
  // (server SET NULL), so we refresh rather than guessing the new orphan rows.
  async function confirmDelete() {
    if (!deleting) return;
    setActionBusy(true);
    const { kind, id } = deleting;
    const prevM = milestones;
    const prevO = orphans;
    if (kind === "m") setMilestones((cur) => cur.filter((x) => x.id !== id));
    else setOrphans((cur) => cur.filter((x) => x.id !== id));
    try {
      if (kind === "m") await deleteMilestone(id);
      else await deleteTask(id);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      console.error("delete failed:", err);
      if (kind === "m") setMilestones(prevM);
      else setOrphans(prevO);
    } finally {
      setActionBusy(false);
    }
  }

  async function onDrop(e: DragEvent, status: BoardColumnKey) {
    e.preventDefault();
    setDragOverCol(null);
    const payload = e.dataTransfer.getData("text/plain");
    setDraggingId(null);
    if (!payload) return;
    const [kind, id] = payload.split(":");
    if (!id) return;

    if (kind === "m") {
      const m = milestones.find((x) => x.id === id);
      if (!m) return;

      if (status === "archive") {
        if (m.archivedAt) return; // already archived
        const prev = milestones;
        const nowIso = new Date().toISOString();
        setMilestones((cur) => cur.map((x) => (x.id === id ? { ...x, archivedAt: nowIso } : x)));
        try {
          await setMilestoneArchived(id, true);
          router.refresh();
        } catch (err) {
          console.error("setMilestoneArchived failed:", err);
          setMilestones(prev);
        }
        return;
      }

      // Real column: no-op only if already there AND not archived (a drag out of
      // Archive into its current column still needs to un-archive). Milestones
      // have no reviewer, so In Review is a plain move for them (only tasks get
      // the reviewer-picker, 2h).
      if (m.boardStatus === status && !m.archivedAt) return;

      await commitMilestoneMove(id, status);
    } else {
      const t = orphans.find((x) => x.id === id);
      if (!t) return;

      // 2g — orphan tasks archive too. Optimistic move; revert on error.
      if (status === "archive") {
        if (t.archivedAt) return; // already archived
        const prev = orphans;
        const nowIso = new Date().toISOString();
        setOrphans((cur) => cur.map((x) => (x.id === id ? { ...x, archivedAt: nowIso } : x)));
        try {
          await archiveTask(id);
          router.refresh();
        } catch (err) {
          console.error("archiveTask failed:", err);
          setOrphans(prev);
        }
        return;
      }

      // No-op only if already in this column AND not archived (a drag out of
      // Archive into its current column still needs to un-archive).
      if (t.status === status && !t.archivedAt) return;

      await commitTaskMove(id, status);
    }
  }

  return (
    <>
      {/* Filters + create bar */}
      <div className="flex flex-wrap items-center gap-3 px-8 pt-6">
        <div className="w-[160px]">
          <Select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
            <option value="">All assignees</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === currentPartnerId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[140px]">
          <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[170px]">
          <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[180px]">
          <Select value={filterMilestone} onChange={(e) => setFilterMilestone(e.target.value)}>
            <option value="">All milestones</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
        {anyFilter && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setCreating("milestone")}>
            <Plus size={13} strokeWidth={1.5} />
            Milestone
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCreating({ task: "todo" })}>
            <Plus size={13} strokeWidth={1.5} />
            Task
          </Button>
        </div>
      </div>

      {/* Board — its own bounded-height vertical scroll container so the sticky
          column headers have something to stick to (the app shell scrolls the
          document otherwise). Scoped here only; other routes are untouched. */}
      <div className="flex-1 min-h-0 overflow-auto px-8 py-6">
        <div className="flex gap-5 items-start min-h-full">
          {BOARD_COLUMNS.map((col) => {
            const isArchive = col.key === "archive";
            const colMilestones = isArchive
              ? filteredMilestones.filter((m) => m.archivedAt)
              : filteredMilestones.filter((m) => !m.archivedAt && m.boardStatus === col.key);
            const colTasks = isArchive
              ? filteredOrphans.filter((t) => t.archivedAt)
              : filteredOrphans.filter((t) => !t.archivedAt && t.status === col.key);
            const count = colMilestones.length + colTasks.length;
            const isOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverCol !== col.key) setDragOverCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverCol((s) => (s === col.key ? null : s));
                  }
                }}
                onDrop={(e) => onDrop(e, col.key)}
                className={cn("w-[300px] shrink-0 flex flex-col", isArchive && "opacity-90")}
              >
                <div className="sticky top-0 z-10 bg-bitumen/85 backdrop-blur px-1 pb-3 flex items-center gap-2">
                  <span className={cn("text-[13px]", isArchive ? "text-bone-mute" : "text-bone")}>{col.label}</span>
                  <span className="text-[12px] text-bone-mute tabular-nums">{count}</span>
                </div>

                {/* The card list owns the full column height (min-h-full) so the
                    whole empty area below the cards is a drop target, plus a
                    column-level drag-over highlight so a drop over empty space
                    reads as responsive (2f). */}
                <div
                  className={cn(
                    "flex flex-col gap-2 flex-1 min-h-[60vh] rounded-[var(--radius-lg)] transition-colors",
                    isOver && "bg-track-gold-dim/5 outline outline-1 outline-track-gold/30",
                  )}
                >
                  {colMilestones.map((m) => (
                    <MilestoneCard
                      key={m.id}
                      milestone={m}
                      dragging={draggingId === m.id}
                      onDragStart={(e) => onDragStart(e, "m", m.id)}
                      onDragEnd={onDragEnd}
                      onOpen={() => setDetailMilestone(m)}
                      onNavigate={(href) => router.push(href)}
                      onPromptDelete={() => setDeleting({ kind: "m", id: m.id, title: m.title })}
                      onDemote={() => demote(m.id)}
                    />
                  ))}

                  {colTasks.map((t) => (
                    <OrphanTaskCard
                      key={t.id}
                      task={t}
                      dragging={draggingId === t.id}
                      onDragStart={(e) => onDragStart(e, "t", t.id)}
                      onDragEnd={onDragEnd}
                      onOpen={() => setEditing(t)}
                      onNavigate={(href) => router.push(href)}
                      onPromptDelete={() => setDeleting({ kind: "t", id: t.id, title: t.title })}
                      onPromote={() => promote(t.id)}
                    />
                  ))}

                  {isArchive ? (
                    /* Archive is a drop target only — no add. The note doubles
                       as the drop affordance and explains the 7-day auto-hide. */
                    <div
                      className={cn(
                        "border border-dashed rounded-[var(--radius)] py-2.5 px-2 text-center text-[11px] leading-snug transition-colors",
                        isOver
                          ? "border-track-gold/60 text-bone-dim"
                          : "border-graphite text-bone-mute",
                      )}
                    >
                      {isOver ? "Drop to archive" : `Drag cards here · hidden after ${ARCHIVE_HIDE_DAYS} days`}
                    </div>
                  ) : (
                    /* Persistent bottom add — also the drop target affordance. */
                    <button
                      onClick={() => setCreating({ task: col.key as StatusKey })}
                      className={cn(
                        "border border-dashed rounded-[var(--radius)] py-2.5 text-center text-[12px] transition-colors flex items-center justify-center gap-1.5",
                        isOver
                          ? "border-track-gold/60 text-bone-dim"
                          : "border-graphite text-bone-mute hover:border-bone-mute hover:text-bone-dim",
                      )}
                    >
                      <Plus size={12} strokeWidth={1.5} />
                      {isOver ? "Drop here" : "Add task"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {detailMilestone && (
        <MilestoneDetailModal
          milestone={detailMilestone}
          partners={partners}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setDetailMilestone(null);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <EditTaskModal
          task={editing}
          partners={partners}
          milestones={milestones}
          deals={deals}
          contacts={contacts}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      {creating && typeof creating === "object" && "task" in creating && (
        <CreateTaskModal
          partners={partners}
          projects={projects}
          clients={clients}
          deals={deals}
          contacts={contacts}
          currentPartnerId={currentPartnerId}
          initialStatus={creating.task}
          onClose={() => {
            setCreating(null);
            router.refresh();
          }}
        />
      )}

      {creating === "milestone" && (
        <CreateMilestoneModal
          partners={partners}
          projects={projects}
          clients={clients}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setCreating(null);
            router.refresh();
          }}
        />
      )}

      {/* 2e — warn-before-delete for a task or milestone card. */}
      {deleting && (
        <DeleteConfirmModal
          kind={deleting.kind}
          title={deleting.title}
          busy={actionBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Milestone card
   ────────────────────────────────────────────────────────────────────── */

function MilestoneCard({
  milestone: m,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onNavigate,
  onPromptDelete,
  onDemote,
}: {
  milestone: BoardMilestone;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onNavigate: (href: string) => void;
  onPromptDelete: () => void;
  onDemote: () => void;
}) {
  const total = m.tasks.length;
  const done = m.tasks.filter((t) => t.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const unassignedCount = m.tasks.filter((t) => !t.ownerId).length;

  // Shading: red if the milestone has no owner; amber if any sub-task is
  // unassigned; otherwise a calm category left-border.
  const needsOwner = !m.ownerId;
  const hasUnassigned = unassignedCount > 0;

  const link = milestoneLink(m);

  const shellClass = needsOwner
    ? "border border-flag-red bg-flag-red/5"
    : hasUnassigned
      ? "border border-signal-warming bg-signal-warming/5"
      : cn("border-l-2", CATEGORY_BORDER[m.category]);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "group block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
        shellClass,
        m.archivedAt && "opacity-75",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="flex items-start gap-1.5 min-w-0">
          <Flag
            size={13}
            strokeWidth={1.5}
            className={cn("mt-0.5 shrink-0", CATEGORY_TEXT[m.category])}
          />
          <span className="text-[13px] leading-snug text-bone">{m.title}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Hover controls — demote to a standalone task / delete (2a, 2e). */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDemote();
            }}
            title="Demote to a standalone task"
            aria-label="Demote milestone to task"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-track-gold"
          >
            <ArrowDownToLine size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPromptDelete();
            }}
            title="Delete milestone"
            aria-label="Delete milestone"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-flag-red"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
          {link && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(link.href);
              }}
              title={`Open ${link.label}`}
              className="text-bone-mute hover:text-diagnostic-steel"
            >
              <Link2 size={13} strokeWidth={1.5} />
            </button>
          )}
          {m.owner ? (
            <span title={m.owner.name} className="inline-flex">
              <Avatar initials={m.owner.initials} size="sm" />
            </span>
          ) : (
            <span className="w-5 h-5 rounded-[var(--radius-pill)] border border-dashed border-flag-red/60 inline-flex items-center justify-center text-[9px] text-flag-red">
              —
            </span>
          )}
        </div>
      </div>

      {/* Category tag + owner/assignment note */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] mono">
          <span className={cn("w-1.5 h-1.5 rounded-full", CATEGORY_DOT[m.category])} />
          <span className={CATEGORY_TEXT[m.category]}>{CATEGORY_LABEL[m.category]}</span>
          {m.categoryLabel && (
            <span className="text-bone-mute normal-case tracking-normal">· {m.categoryLabel}</span>
          )}
        </span>
        {needsOwner ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-flag-red">
            <AlertTriangle size={10} strokeWidth={2} />
            Needs owner
          </span>
        ) : hasUnassigned ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-signal-warming">
            <AlertTriangle size={10} strokeWidth={2} />
            {unassignedCount} unassigned
          </span>
        ) : null}
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 pt-1">
        <div className="h-1.5 flex-1 bg-graphite rounded-[var(--radius-pill)] overflow-hidden">
          <div className="h-full bg-signal-fresh transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="mono text-[11px] text-bone-mute tabular-nums shrink-0">
          {done}/{total}
        </span>
      </div>

      {/* Archived footer — when + how long until the 7-day auto-hide. */}
      {m.archivedAt && (
        <div className="mt-2 pt-2 border-t border-graphite/60 flex items-center gap-1.5 text-[10px] text-bone-mute">
          <Archive size={10} strokeWidth={1.5} />
          <span>Archived {formatDate(m.archivedAt)}</span>
          <span className="ml-auto tabular-nums">
            {(() => {
              const left = ARCHIVE_HIDE_DAYS - Math.floor((Date.now() - new Date(m.archivedAt).getTime()) / 86_400_000);
              return left <= 0 ? "hides today" : `${left}d left`;
            })()}
          </span>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Orphan task card
   ────────────────────────────────────────────────────────────────────── */

function OrphanTaskCard({
  task: t,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onNavigate,
  onPromptDelete,
  onPromote,
}: {
  task: BoardOrphanTask;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onNavigate: (href: string) => void;
  onPromptDelete: () => void;
  onPromote: () => void;
}) {
  // The card's click-through, preferring the most specific scope.
  const link = t.project
    ? { href: `/projects/${t.project.id}`, label: t.project.name }
    : t.client
      ? { href: `/clients/${t.client.id}`, label: t.client.company }
      : t.deal
        ? { href: `/pipeline/${t.deal.id}`, label: t.deal.company }
        : t.contact
          ? { href: `/contacts/${t.contact.id}`, label: t.contact.name }
          : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "group block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 border-l-2 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
        CATEGORY_BORDER[t.category],
        t.archivedAt && "opacity-75",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={cn("text-[13px] leading-snug", t.done ? "text-bone-mute line-through" : "text-bone")}>
          {t.title}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Hover controls — promote to a milestone / delete (2a, 2e). */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPromote();
            }}
            title="Promote to a milestone"
            aria-label="Promote task to milestone"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-track-gold"
          >
            <ArrowUpToLine size={13} strokeWidth={1.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPromptDelete();
            }}
            title="Delete task"
            aria-label="Delete task"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-flag-red"
          >
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
          <Badge
            tone={t.priority === "high" ? "red" : t.priority === "medium" ? "gold" : "neutral"}
          >
            {t.priority}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] mono">
          <span className={cn("w-1.5 h-1.5 rounded-full", CATEGORY_DOT[t.category])} />
          <span className={CATEGORY_TEXT[t.category]}>{CATEGORY_LABEL[t.category]}</span>
          {t.categoryLabel && (
            <span className="text-bone-mute normal-case tracking-normal">· {t.categoryLabel}</span>
          )}
        </span>
        {link && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(link.href);
            }}
            title={`Open ${link.label}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-pill)] bg-graphite text-bone-dim text-[10px] max-w-[150px] truncate hover:text-bone"
          >
            <Link2 size={10} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">{link.label}</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="mono text-[11px] text-bone-mute tabular-nums">{t.due ? formatDate(t.due) : "No date"}</span>
        {t.owner ? (
          <span title={t.owner.name} className="inline-flex">
            <Avatar initials={t.owner.initials} size="sm" />
          </span>
        ) : (
          <span
            title="Unassigned"
            className="w-5 h-5 rounded-[var(--radius-pill)] border border-dashed border-bone-mute/50 inline-flex items-center justify-center text-[9px] text-bone-mute"
          >
            —
          </span>
        )}
      </div>

      {/* Archived footer — when + how long until the 7-day auto-hide (2g). */}
      {t.archivedAt && (
        <div className="mt-2 pt-2 border-t border-graphite/60 flex items-center gap-1.5 text-[10px] text-bone-mute">
          <Archive size={10} strokeWidth={1.5} />
          <span>Archived {formatDate(t.archivedAt)}</span>
          <span className="ml-auto tabular-nums">
            {(() => {
              const left = ARCHIVE_HIDE_DAYS - Math.floor((Date.now() - new Date(t.archivedAt).getTime()) / 86_400_000);
              return left <= 0 ? "hides today" : `${left}d left`;
            })()}
          </span>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Modal shell
   ────────────────────────────────────────────────────────────────────── */

function ModalShell({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <GuardedModalShell onClose={onClose} positionClassName="items-center justify-center p-6" scroll={false}>
      <Card
        className="w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label gold>{eyebrow}</Label>
            <h2 className="text-[18px] text-bone">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-bone-mute hover:text-bone">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </Card>
    </GuardedModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Edit orphan task
   ────────────────────────────────────────────────────────────────────── */

function EditTaskModal({
  task,
  partners,
  milestones,
  deals,
  contacts,
  currentPartnerId,
  onClose,
}: {
  task: BoardOrphanTask;
  partners: PartnerOption[];
  milestones: BoardMilestone[];
  deals: DealOption[];
  contacts: ContactOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [ownerId, setOwnerId] = useState(task.ownerId ?? "");
  const [status, setStatus] = useState<StatusKey>(task.status);
  const [category, setCategory] = useState<WorkCategory>(task.category);
  const [categoryLabel, setCategoryLabel] = useState(task.categoryLabel ?? "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    task.priority as (typeof PRIORITIES)[number],
  );
  const [due, setDue] = useState(task.due ? dueISO(task.due) : "");
  const [context, setContext] = useState(task.context ?? "");
  // 2a — re-parent to a milestone (moves the card off the board into the epic).
  const [milestoneId, setMilestoneId] = useState("");
  // 2b — deal / contact tags.
  const [dealId, setDealId] = useState(task.dealId ?? "");
  const [contactId, setContactId] = useState(task.contactId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTask(task.id, {
        title,
        ownerId: ownerId || null,
        status,
        category,
        categoryLabel: categoryLabel.trim() || null,
        priority,
        due,
        context: context.trim() || null,
        // Only send milestoneId when the partner picked one (re-parenting is a
        // deliberate move; an empty pick leaves the task standalone).
        ...(milestoneId ? { milestoneId } : {}),
        dealId: dealId || null,
        contactId: contactId || null,
      });
      onClose();
    } catch (err) {
      console.error("updateTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  return (
    <ModalShell eyebrow="Task" title="Edit task" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Assignee</Label>
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
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StatusKey)}>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value as WorkCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Sub-tag (optional)</Label>
          <Input
            placeholder="e.g. BD, Admin"
            value={categoryLabel}
            onChange={(e) => setCategoryLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      {/* 2b — deal / contact tags. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Deal (optional)</Label>
          <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">No deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Contact (optional)</Label>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 2a — re-parent into a milestone. Picking one moves this card off the
          board and into that milestone as a sub-task. */}
      <div className="flex flex-col gap-1.5">
        <Label>Move into milestone (optional)</Label>
        <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
          <option value="">Keep as a standalone task</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Context (optional)</Label>
        <Textarea
          rows={3}
          placeholder="The why, links, or what an agent would need to act on this."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Create task — pre-set to a column's status. Allows an Unassigned assignee.
   ────────────────────────────────────────────────────────────────────── */

function deriveCategory(scope: {
  projectId: string;
  clientId: string;
  dealId: string;
}): WorkCategory {
  if (scope.projectId) return "project";
  if (scope.dealId) return "pipeline";
  if (scope.clientId) return "project";
  return "firm";
}

function CreateTaskModal({
  partners,
  projects,
  clients,
  deals,
  contacts,
  currentPartnerId,
  initialStatus,
  onClose,
}: {
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  deals: DealOption[];
  contacts: ContactOption[];
  currentPartnerId: string;
  initialStatus: StatusKey;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || ""); // "" = Unassigned
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [due, setDue] = useState(todayISO());
  const [status, setStatus] = useState<StatusKey>(initialStatus);
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  // 2b — deal / contact tags. Deal and contact are independent of project/client
  // (a task can hang off any of them); a deal tags the card as pipeline work.
  const [dealId, setDealId] = useState("");
  const [contactId, setContactId] = useState("");
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoCategory = deriveCategory({ projectId, clientId, dealId });
  const effectiveCategory = categoryTouched ? category : autoCategory;

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
        ownerId: ownerId || undefined,
        priority,
        due,
        status,
        category: effectiveCategory,
        categoryLabel: categoryLabel.trim() || undefined,
        projectId: projectId || undefined,
        clientId: clientId || undefined,
        dealId: dealId || undefined,
        contactId: contactId || undefined,
        context: context.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error("createTask failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create task");
      setSaving(false);
    }
  }

  return (
    <ModalShell eyebrow="New" title="Create task" onClose={onClose}>
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
          <Label>Assignee</Label>
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

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Project (optional)</Label>
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (e.target.value) setClientId("");
            }}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Client (optional)</Label>
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              if (e.target.value) setProjectId("");
            }}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 2b — deal / contact tags (independent of project/client). */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Deal (optional)</Label>
          <Select value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">No deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Contact (optional)</Label>
          <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <Select
            value={effectiveCategory}
            onChange={(e) => {
              setCategory(e.target.value as WorkCategory);
              setCategoryTouched(true);
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Sub-tag (optional)</Label>
          <Input
            placeholder="e.g. BD, Admin"
            value={categoryLabel}
            onChange={(e) => setCategoryLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Status</Label>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusKey)}>
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Context (optional)</Label>
        <Textarea
          rows={3}
          placeholder="The why, links, or what an agent would need to act on this."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Create task"}
        </Button>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Create milestone — firm-level epics (BD/Admin) can be created right here.
   ────────────────────────────────────────────────────────────────────── */

function CreateMilestoneModal({
  partners,
  projects,
  clients,
  currentPartnerId,
  onClose,
}: {
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || ""); // "" = Unassigned
  // 2c — milestones tag client/project only (no deal). Pipeline work is a task.
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<(typeof MILESTONE_STATUSES)[number]>("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoCategory: WorkCategory = projectId || clientId ? "project" : "firm";
  const effectiveCategory = categoryTouched ? category : autoCategory;

  async function submit() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createMilestone({
        title,
        status,
        dueDate: dueDate || null,
        ownerId: ownerId || null,
        category: effectiveCategory,
        categoryLabel: categoryLabel.trim() || null,
        projectId: projectId || null,
        clientId: clientId || null,
      });
      onClose();
    } catch (err) {
      console.error("createMilestone failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create milestone");
      setSaving(false);
    }
  }

  return (
    <ModalShell eyebrow="New" title="Create milestone" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <Label>Milestone</Label>
        <Input
          placeholder="A unit of work — e.g. Q3 BD push"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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
          <Label>Status</Label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as (typeof MILESTONE_STATUSES)[number])}
          >
            {MILESTONE_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.replace("_", "-")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* 2c — client / project only; pipeline (deal) work belongs on a task. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Project</Label>
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (e.target.value) setClientId("");
            }}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Client</Label>
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              if (e.target.value) setProjectId("");
            }}
          >
            <option value="">None</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <Select
            value={effectiveCategory}
            onChange={(e) => {
              setCategory(e.target.value as WorkCategory);
              setCategoryTouched(true);
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Sub-tag (optional)</Label>
          <Input
            placeholder="e.g. BD, Admin"
            value={categoryLabel}
            onChange={(e) => setCategoryLabel(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Date (optional)</Label>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <span className="label text-[9px] text-bone-mute">Undated milestones stay off the timeline.</span>
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Create milestone"}
        </Button>
      </div>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Delete confirm (2e) — warn before deleting a task or milestone card. A
   milestone delete keeps its child tasks as standalone tasks (server SET
   NULL); the copy says so. guard={false} so cancel/click-out is a clean no-op.
   ────────────────────────────────────────────────────────────────────── */

function DeleteConfirmModal({
  kind,
  title,
  busy,
  onCancel,
  onConfirm,
}: {
  kind: "m" | "t";
  title: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const isMilestone = kind === "m";
  return (
    <GuardedModalShell
      onClose={onCancel}
      guard={false}
      positionClassName="items-center justify-center p-6"
      scroll={false}
    >
      <Card
        className="w-full max-w-md p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[14px] text-bone font-medium">
              Delete {isMilestone ? "milestone" : "task"}?
            </span>
            <span className="text-[12px] text-bone-dim leading-relaxed">
              <span className="text-bone">{title}</span> will be removed.{" "}
              {isMilestone
                ? "Its sub-tasks are kept as standalone tasks on the board."
                : "This can't be undone."}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={13} strokeWidth={1.5} />
            {busy ? "Deleting…" : `Delete ${isMilestone ? "milestone" : "task"}`}
          </Button>
        </div>
      </Card>
    </GuardedModalShell>
  );
}
