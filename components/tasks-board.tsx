"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Input, Textarea, Select, Avatar } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { createTask, updateTask, updateTaskStatus } from "@/app/(app)/tasks/actions";
import { createMilestone } from "@/app/(app)/projects/[id]/actions";
import { cn } from "@/lib/cn";
import { Plus, X } from "lucide-react";
import type {
  TaskModel as Task,
  PartnerModel as Partner,
} from "@/lib/generated/prisma/models";
import type { TaskStatus, WorkCategory } from "@/lib/generated/prisma/enums";

/* ──────────────────────────────────────────────────────────────────────
   Shapes — the board takes flat tasks plus the lookups it needs to render
   tags, run the create forms, and power client-side filters.
   ────────────────────────────────────────────────────────────────────── */

type MilestoneRef = { id: string; title: string; category: WorkCategory };

type TaskRow = Task & {
  owner: Partner;
  milestone: MilestoneRef | null;
  project: { id: string; name: string } | null;
  client: { id: string; company: string } | null;
};

type PartnerOption = Pick<Partner, "id" | "name" | "initials">;
type ProjectOption = { id: string; name: string };
type ClientOption = { id: string; company: string };

interface TasksBoardProps {
  tasks: TaskRow[];
  milestones: MilestoneRef[];
  partners: PartnerOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  currentPartnerId: string;
}

/* ──────────────────────────────────────────────────────────────────────
   Static maps
   ────────────────────────────────────────────────────────────────────── */

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
];

const CATEGORIES: WorkCategory[] = ["firm", "project", "pipeline", "other"];

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  firm: "Firm",
  project: "Projects",
  pipeline: "Pipeline",
  other: "Other",
};

// Category → calm token. firm gold · project steel · pipeline green · other muted.
const CATEGORY_BORDER: Record<WorkCategory, string> = {
  firm: "border-l-track-gold",
  project: "border-l-diagnostic-steel",
  pipeline: "border-l-signal-fresh",
  other: "border-l-bone-mute",
};

const CATEGORY_TEXT: Record<WorkCategory, string> = {
  firm: "text-track-gold",
  project: "text-diagnostic-steel",
  pipeline: "text-signal-fresh",
  other: "text-bone-mute",
};

const CATEGORY_DOT: Record<WorkCategory, string> = {
  firm: "bg-track-gold",
  project: "bg-diagnostic-steel",
  pipeline: "bg-signal-fresh",
  other: "bg-bone-mute",
};

const PRIORITIES = ["high", "medium", "low"] as const;

const MILESTONE_STATUSES = ["pending", "in_progress", "complete", "at_risk"] as const;

// Task.category is nullable in the schema; treat a null as "other" for display.
function cat(c: WorkCategory | null): WorkCategory {
  return c ?? "other";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dueISO(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

/* ──────────────────────────────────────────────────────────────────────
   Board
   ────────────────────────────────────────────────────────────────────── */

export function TasksBoard({
  tasks: initialTasks,
  milestones,
  partners,
  projects,
  clients,
  currentPartnerId,
}: TasksBoardProps) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);

  // Filters (client-side over the full set).
  const [filterOwner, setFilterOwner] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterMilestone, setFilterMilestone] = useState("");

  // Overlays.
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [creating, setCreating] = useState<null | "task" | "milestone">(null);

  // Resync when the server component re-renders (after a move revalidates).
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterOwner && t.ownerId !== filterOwner) return false;
      if (filterCategory && cat(t.category) !== filterCategory) return false;
      if (filterProject && t.projectId !== filterProject) return false;
      if (filterMilestone && t.milestoneId !== filterMilestone) return false;
      return true;
    });
  }, [tasks, filterOwner, filterCategory, filterProject, filterMilestone]);

  const anyFilter = filterOwner || filterCategory || filterProject || filterMilestone;

  function clearFilters() {
    setFilterOwner("");
    setFilterCategory("");
    setFilterProject("");
    setFilterMilestone("");
  }

  /* drag-drop — mirror pipeline-board: optimistic move, revert on error */

  function onDragStart(e: DragEvent, taskId: string) {
    setDraggingId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  async function onDrop(e: DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!taskId) return;

    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status, done: status === "done" } : t,
      ),
    );

    try {
      await updateTaskStatus(taskId, status);
      router.refresh();
    } catch (err) {
      console.error("updateTaskStatus failed:", err);
      setTasks(previous); // revert
    }
  }

  return (
    <>
      {/* Filters + create bar */}
      <div className="flex flex-wrap items-center gap-3 px-8 pt-6">
        <div className="w-[150px]">
          <Select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
            <option value="">All assignees</option>
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
        <div className="w-[170px]">
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
          <Button size="sm" variant="secondary" onClick={() => setCreating("task")}>
            <Plus size={13} strokeWidth={1.5} />
            Task
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto px-8 py-6">
        <div className="flex gap-5 items-start">
          {COLUMNS.map((col) => {
            const colTasks = filtered.filter((t) => t.status === col.key);
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
                className="w-[290px] shrink-0 flex flex-col"
              >
                <div className="sticky top-0 z-10 bg-bitumen/85 backdrop-blur px-1 pb-3 flex items-center gap-2">
                  <span className="text-[13px] text-bone">{col.label}</span>
                  <span className="text-[12px] text-bone-mute tabular-nums">{colTasks.length}</span>
                </div>

                <div className="flex flex-col gap-2">
                  {colTasks.map((t) => {
                    const dragging = draggingId === t.id;
                    const tie = t.project?.name ?? t.client?.company ?? null;
                    const tc = cat(t.category);
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, t.id)}
                        onDragEnd={onDragEnd}
                        onClick={() => setEditing(t)}
                        className={cn(
                          "block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 border-l-2 transition-all cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow)] hover:-translate-y-px",
                          CATEGORY_BORDER[tc],
                          dragging && "opacity-40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span
                            className={cn(
                              "text-[13px] leading-snug",
                              t.done ? "text-bone-mute line-through" : "text-bone",
                            )}
                          >
                            {t.title}
                          </span>
                          <Badge
                            tone={t.priority === "high" ? "red" : t.priority === "medium" ? "gold" : "neutral"}
                            className="shrink-0"
                          >
                            {t.priority}
                          </Badge>
                        </div>

                        {/* Tags row */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.06em] mono">
                            <span className={cn("w-1.5 h-1.5 rounded-full", CATEGORY_DOT[tc])} />
                            <span className={CATEGORY_TEXT[tc]}>{CATEGORY_LABEL[tc]}</span>
                            {t.categoryLabel && (
                              <span className="text-bone-mute normal-case tracking-normal">· {t.categoryLabel}</span>
                            )}
                          </span>
                          {t.milestone && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-pill)] bg-graphite text-bone-dim text-[10px] max-w-[140px] truncate">
                              {t.milestone.title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-[11px] text-bone-mute truncate">
                            {tie ?? <span className="text-bone-mute/60">—</span>}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(t.due)}</span>
                            <span title={t.owner.name} className="inline-flex">
                              <Avatar initials={t.owner.initials} size="sm" />
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div
                      className={cn(
                        "border border-dashed rounded py-8 text-center text-[12px] transition-colors",
                        isOver ? "border-track-gold/60 text-bone-dim" : "border-graphite text-bone-mute",
                      )}
                    >
                      Drop a task here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <EditTaskModal
          task={editing}
          partners={partners}
          milestones={milestones}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
          onSaved={(patch) => {
            setTasks((prev) => prev.map((t) => (t.id === editing.id ? { ...t, ...patch } : t)));
          }}
        />
      )}

      {creating === "task" && (
        <CreateTaskModal
          partners={partners}
          milestones={milestones}
          projects={projects}
          clients={clients}
          currentPartnerId={currentPartnerId}
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
    </>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Edit task — assignee / status / category / milestone / priority / due / title
   ────────────────────────────────────────────────────────────────────── */

function EditTaskModal({
  task,
  partners,
  milestones,
  currentPartnerId,
  onClose,
  onSaved,
}: {
  task: TaskRow;
  partners: PartnerOption[];
  milestones: MilestoneRef[];
  currentPartnerId: string;
  onClose: () => void;
  onSaved: (patch: Partial<TaskRow>) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [ownerId, setOwnerId] = useState(task.ownerId);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [category, setCategory] = useState<WorkCategory>(cat(task.category));
  const [categoryLabel, setCategoryLabel] = useState(task.categoryLabel ?? "");
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(
    task.priority as (typeof PRIORITIES)[number],
  );
  const [due, setDue] = useState(dueISO(task.due));
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
        ownerId,
        status,
        category,
        categoryLabel: categoryLabel.trim() || null,
        milestoneId: milestoneId || null,
        priority,
        due,
      });
      const owner = partners.find((p) => p.id === ownerId);
      const milestone = milestones.find((m) => m.id === milestoneId) ?? null;
      onSaved({
        title: title.trim(),
        ownerId,
        status,
        done: status === "done",
        category,
        categoryLabel: categoryLabel.trim() || null,
        milestoneId: milestoneId || null,
        milestone,
        priority,
        due: new Date(due),
        ...(owner
          ? { owner: { ...task.owner, id: owner.id, name: owner.name, initials: owner.initials } }
          : {}),
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
          <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
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

      <div className="flex flex-col gap-1.5">
        <Label>Milestone (optional)</Label>
        <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
          <option value="">No milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}
            </option>
          ))}
        </Select>
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
   Create task
   ────────────────────────────────────────────────────────────────────── */

// Derive a default category from what the task is tied to (mirrors the action).
function deriveCategory(projectId: string, clientId: string): WorkCategory {
  if (projectId) return "project";
  if (clientId) return "project";
  return "firm";
}

function CreateTaskModal({
  partners,
  milestones,
  projects,
  clients,
  currentPartnerId,
  onClose,
}: {
  partners: PartnerOption[];
  milestones: MilestoneRef[];
  projects: ProjectOption[];
  clients: ClientOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || partners[0]?.id || "");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [due, setDue] = useState(todayISO());
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [milestoneId, setMilestoneId] = useState("");
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-category from scope until the partner overrides it.
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
        ownerId,
        priority,
        due,
        status,
        category: effectiveCategory,
        categoryLabel: categoryLabel.trim() || undefined,
        projectId: projectId || undefined,
        clientId: clientId || undefined,
        milestoneId: milestoneId || undefined,
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

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Milestone (optional)</Label>
          <Select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            <option value="">No milestone</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
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
  const [ownerId, setOwnerId] = useState(currentPartnerId || partners[0]?.id || "");
  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [category, setCategory] = useState<WorkCategory>("firm");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [categoryLabel, setCategoryLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<(typeof MILESTONE_STATUSES)[number]>("pending");
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
