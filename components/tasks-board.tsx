"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Input, Textarea, Select, Avatar } from "@/components/ui";
import { ModalShell as GuardedModalShell } from "@/components/modal-shell";
import { formatDate } from "@/lib/format";
import { createTask, updateTask, updateTaskStatus } from "@/app/(app)/tasks/actions";
import { createMilestone, updateMilestoneBoardStatus, setMilestoneArchived } from "@/app/(app)/projects/[id]/actions";
import { MilestoneDetailModal } from "@/components/milestone-detail-modal";
import { cn } from "@/lib/cn";
import { Plus, X, Flag, Link2, AlertTriangle, Archive } from "lucide-react";
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

type OwnerRef = { id: string; name: string; initials: string } | null;

export type BoardSubTask = {
  id: string;
  title: string;
  status: StatusKey;
  done: boolean;
  priority: string;
  due: string;
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
  projectId: string | null;
  clientId: string | null;
  dealId: string | null;
  project: { id: string; name: string } | null;
  client: { id: string; company: string } | null;
  deal: { id: string; company: string } | null;
  tasks: BoardSubTask[];
};

export type BoardOrphanTask = {
  id: string;
  title: string;
  status: StatusKey;
  done: boolean;
  priority: string;
  due: string;
  context: string | null;
  category: WorkCategory;
  categoryLabel: string | null;
  ownerId: string | null;
  owner: OwnerRef;
  projectId: string | null;
  clientId: string | null;
  project: { id: string; name: string } | null;
  client: { id: string; company: string } | null;
};

interface TasksBoardProps {
  milestones: BoardMilestone[];
  orphanTasks: BoardOrphanTask[];
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  deals: DealOption[];
  currentPartnerId: string;
}

export const COLUMNS: { key: StatusKey; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
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
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
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

// The record a milestone is tied to → a click-through link.
export function milestoneLink(
  m: Pick<BoardMilestone, "project" | "client" | "deal" | "projectId" | "clientId" | "dealId">,
): { href: string; label: string } | null {
  if (m.project) return { href: `/projects/${m.project.id}`, label: m.project.name };
  if (m.client) return { href: `/clients/${m.client.id}`, label: m.client.company };
  if (m.deal) return { href: `/pipeline/${m.deal.id}`, label: m.deal.company };
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
  currentPartnerId,
}: TasksBoardProps) {
  const router = useRouter();
  const [milestones, setMilestones] = useState(initialMilestones);
  const [orphans, setOrphans] = useState(initialOrphans);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BoardColumnKey | null>(null);

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
      // Archive into its current column still needs to un-archive).
      if (m.boardStatus === status && !m.archivedAt) return;
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
    } else {
      // Orphan tasks don't archive — ignore a drop on the Archive column.
      if (status === "archive") return;
      const t = orphans.find((x) => x.id === id);
      if (!t || t.status === status) return;
      const prev = orphans;
      setOrphans((cur) =>
        cur.map((x) => (x.id === id ? { ...x, status, done: status === "done" } : x)),
      );
      try {
        await updateTaskStatus(id, status);
        router.refresh();
      } catch (err) {
        console.error("updateTaskStatus failed:", err);
        setOrphans(prev);
      }
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

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-8 py-6">
        <div className="flex gap-5 items-start">
          {BOARD_COLUMNS.map((col) => {
            const isArchive = col.key === "archive";
            const colMilestones = isArchive
              ? filteredMilestones.filter((m) => m.archivedAt)
              : filteredMilestones.filter((m) => !m.archivedAt && m.boardStatus === col.key);
            const colTasks = isArchive ? [] : filteredOrphans.filter((t) => t.status === col.key);
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

                <div className="flex flex-col gap-2">
                  {colMilestones.map((m) => (
                    <MilestoneCard
                      key={m.id}
                      milestone={m}
                      dragging={draggingId === m.id}
                      onDragStart={(e) => onDragStart(e, "m", m.id)}
                      onDragEnd={onDragEnd}
                      onOpen={() => setDetailMilestone(m)}
                      onNavigate={(href) => router.push(href)}
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
                    />
                  ))}

                  {isArchive ? (
                    /* Archive is a drop target only — no add-task. The note doubles
                       as the drop affordance and explains the 7-day auto-hide. */
                    <div
                      className={cn(
                        "border border-dashed rounded-[var(--radius)] py-2.5 px-2 text-center text-[11px] leading-snug transition-colors",
                        isOver
                          ? "border-track-gold/60 text-bone-dim"
                          : "border-graphite text-bone-mute",
                      )}
                    >
                      {isOver ? "Drop to archive" : `Drag milestones here · hidden after ${ARCHIVE_HIDE_DAYS} days`}
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
          deals={deals}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setCreating(null);
            router.refresh();
          }}
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
}: {
  milestone: BoardMilestone;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onNavigate: (href: string) => void;
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
        "block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
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
}: {
  task: BoardOrphanTask;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onNavigate: (href: string) => void;
}) {
  const link = t.project
    ? { href: `/projects/${t.project.id}`, label: t.project.name }
    : t.client
      ? { href: `/clients/${t.client.id}`, label: t.client.company }
      : null;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={cn(
        "block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 border-l-2 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
        CATEGORY_BORDER[t.category],
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className={cn("text-[13px] leading-snug", t.done ? "text-bone-mute line-through" : "text-bone")}>
          {t.title}
        </span>
        <Badge
          tone={t.priority === "high" ? "red" : t.priority === "medium" ? "gold" : "neutral"}
          className="shrink-0"
        >
          {t.priority}
        </Badge>
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
        <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(t.due)}</span>
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
  currentPartnerId,
  onClose,
}: {
  task: BoardOrphanTask;
  partners: PartnerOption[];
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
  const [due, setDue] = useState(dueISO(task.due));
  const [context, setContext] = useState(task.context ?? "");
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

function deriveCategory(projectId: string, clientId: string): WorkCategory {
  if (projectId) return "project";
  if (clientId) return "project";
  return "firm";
}

function CreateTaskModal({
  partners,
  projects,
  clients,
  currentPartnerId,
  initialStatus,
  onClose,
}: {
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
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
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoCategory = deriveCategory(projectId, clientId);
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
  deals,
  currentPartnerId,
  onClose,
}: {
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  deals: DealOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || ""); // "" = Unassigned
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [dealId, setDealId] = useState("");
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<(typeof MILESTONE_STATUSES)[number]>("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoCategory: WorkCategory = projectId
    ? "project"
    : dealId
      ? "pipeline"
      : clientId
        ? "project"
        : "firm";
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
        dealId: dealId || null,
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

      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Project</Label>
          <Select
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              if (e.target.value) {
                setClientId("");
                setDealId("");
              }
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
              if (e.target.value) {
                setProjectId("");
                setDealId("");
              }
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
        <div className="flex flex-col gap-1.5">
          <Label>Deal</Label>
          <Select
            value={dealId}
            onChange={(e) => {
              setDealId(e.target.value);
              if (e.target.value) {
                setProjectId("");
                setClientId("");
              }
            }}
          >
            <option value="">None</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.company}
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
