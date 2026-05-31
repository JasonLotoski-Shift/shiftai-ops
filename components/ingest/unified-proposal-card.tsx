"use client";

// Unified review card — renders ONE v2 (UnifiedProposal) proposal for partner
// review. Propose-never-auto-write: every ADD is a checkbox the partner opts
// into; every OVERWRITE shows the existing value struck-through next to the
// proposed value (before→after). Only checked items round-trip into
// approveUnified. Mirrors the visual language of the legacy ProposalCard /
// ProjectProposalCard in components/ingest-view.tsx.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Check,
  ShieldAlert,
  Sparkles,
  User,
  Building2,
  FolderOpen,
  GitBranch,
  ListChecks,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import { Card, Label, Badge, Button, Textarea, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  approveUnified,
  rejectUnified,
} from "@/app/(app)/ingest/composer-actions";
import type {
  IngestType,
  IngestTargetKind,
  UnifiedProposal,
  RecordProposal,
  FieldChange,
  ProposedInteraction,
  ProposedMilestone,
  ProposedDeliverable,
  ApproveUnifiedSelections,
  ApprovedRecord,
  ApprovedTask,
} from "@/lib/ingest/types";

// ── Display maps ──────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  // contact scalars
  persona: "Persona",
  communicationStyle: "Communication style",
  background: "Background",
  title: "Title",
  company: "Company",
  phone: "Phone",
  notes: "Notes",
  // contact lists
  keyFacts: "Key facts",
  hobbies: "Hobbies",
  networkAffiliations: "Network affiliations",
  // client scalars
  description: "Description",
  headquarters: "HQ",
  founded: "Founded",
  website: "Website",
  ownership: "Ownership",
  companySize: "Company size",
  logoMonogram: "Logo monogram",
  revenue: "Revenue",
  paymentTerms: "Payment terms",
  // client lists
  companyKeyFacts: "Company key facts",
  brandColors: "Brand colors",
  // project scalars
  phase: "Phase",
  status: "Status",
};

const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

const KIND_ICON: Record<IngestTargetKind, typeof User> = {
  contact: User,
  client: Building2,
  project: FolderOpen,
  deal: GitBranch,
};

const TYPE_TONE: Record<IngestType, "gold" | "steel" | "bone" | "neutral"> = {
  meeting: "gold",
  email: "steel",
  document: "bone",
  interaction: "neutral",
};

const PRIORITY_OPTS = ["high", "medium", "low"] as const;
const M_STATUS_OPTS = ["pending", "in-progress", "complete", "at-risk"] as const;

// human display for @map'd enum strings (underscored TS → hyphenated label)
const disp = (v: string) => v.replace(/_/g, "-");

// ── Local editable state shapes ─────────────────────────────────────────────

type FieldState = { keep: boolean };
type ListState = { keep: boolean };
type InteractionState = { keep: boolean };
type MilestoneState = { keep: boolean; status: string };
type DeliverableState = { keep: boolean };

type RecordState = {
  fieldChanges: FieldState[];
  listAdditions: ListState[];
  interactions: InteractionState[];
  milestones: MilestoneState[];
  deliverables: DeliverableState[];
  applyStage: boolean; // deal stage-move toggle
};

type TaskState = {
  keep: boolean;
  ownerId: string;
};

// ── Props (cross-agent contract) ────────────────────────────────────────────

export type UnifiedProposalCardProps = {
  proposal: {
    id: string;
    title: string;
    ingestType: IngestType;
    summary: string;
    createdBy: string;
    matchedContactId: string | null;
    matchedClientId: string | null;
    matchedProjectId: string | null;
    matchedDealId: string | null;
    data: UnifiedProposal;
  };
  partners: { id: string; name: string; initials?: string }[];
  contacts: { id: string; name: string; company: string }[];
  clients: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  currentPartnerId: string;
};

export default function UnifiedProposalCard({
  proposal,
  partners,
  currentPartnerId,
}: UnifiedProposalCardProps) {
  const router = useRouter();
  const data = proposal.data;

  const [open, setOpen] = useState(true);
  const [summary, setSummary] = useState(proposal.summary || data.summary || "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Resolve an ownerHint name → a partner id (first/full-name match), else current.
  const resolveOwner = useMemo(
    () => (hint: string | null): string => {
      if (hint) {
        const h = hint.trim().toLowerCase();
        const exact = partners.find((p) => p.name.toLowerCase() === h);
        if (exact) return exact.id;
        const first = partners.find(
          (p) => p.name.split(" ")[0].toLowerCase() === h || p.name.toLowerCase().startsWith(h),
        );
        if (first) return first.id;
      }
      return currentPartnerId || partners[0]?.id || "";
    },
    [partners, currentPartnerId],
  );

  // Per-record selection state (default: every item checked).
  const [records, setRecords] = useState<RecordState[]>(() =>
    data.records.map((r) => ({
      fieldChanges: r.fieldChanges.map(() => ({ keep: true })),
      listAdditions: r.listAdditions.map(() => ({ keep: true })),
      interactions: (r.interactions ?? []).map(() => ({ keep: true })),
      milestones: (r.milestones ?? []).map((m) => ({ keep: true, status: m.status || "pending" })),
      deliverables: (r.deliverables ?? []).map(() => ({ keep: true })),
      applyStage: true,
    })),
  );

  // Per-task selection + resolved owner (default: checked, owner from hint).
  const [tasks, setTasks] = useState<TaskState[]>(() =>
    data.tasks.map((t) => ({ keep: true, ownerId: resolveOwner(t.ownerHint) })),
  );

  // ── counts for the header ────────────────────────────────────────────────
  const counts = useMemo(() => {
    let adds = 0;
    let overwrites = 0;
    for (const r of data.records) {
      for (const fc of r.fieldChanges) (fc.op === "replace" ? overwrites++ : adds++);
      adds += r.listAdditions.length;
      adds += r.interactions?.length ?? 0;
      adds += r.milestones?.length ?? 0;
      adds += r.deliverables?.length ?? 0;
    }
    return { records: data.records.length, adds, overwrites, tasks: data.tasks.length };
  }, [data]);

  // ── mutation helpers ─────────────────────────────────────────────────────
  function patchRecord(ri: number, patch: (s: RecordState) => RecordState) {
    setRecords((prev) => prev.map((r, i) => (i === ri ? patch(r) : r)));
  }
  function patchTask(ti: number, patch: (s: TaskState) => TaskState) {
    setTasks((prev) => prev.map((t, i) => (i === ti ? patch(t) : t)));
  }

  // ── build approval payload from ONLY checked items ───────────────────────
  function buildSelections(): ApproveUnifiedSelections {
    const approvedRecords: ApprovedRecord[] = data.records.map((r, ri) => {
      const st = records[ri];
      const fieldChanges: FieldChange[] = r.fieldChanges.filter((_, i) => st.fieldChanges[i]?.keep);
      const listAdditions = r.listAdditions.filter((_, i) => st.listAdditions[i]?.keep);
      const interactions: ProposedInteraction[] = (r.interactions ?? []).filter(
        (_, i) => st.interactions[i]?.keep,
      );
      const milestones: ProposedMilestone[] = (r.milestones ?? [])
        .filter((_, i) => st.milestones[i]?.keep)
        .map((m, i) => ({ ...m, status: st.milestones[i]?.status ?? m.status }));
      const deliverables: ProposedDeliverable[] = (r.deliverables ?? []).filter(
        (_, i) => st.deliverables[i]?.keep,
      );

      const out: ApprovedRecord = {
        kind: r.kind,
        recordId: r.recordId,
        fieldChanges,
        listAdditions,
      };
      if (interactions.length) out.interactions = interactions;
      if (r.projectNotes != null) out.projectNotes = r.projectNotes;
      if (milestones.length) out.milestones = milestones;
      if (deliverables.length) out.deliverables = deliverables;
      if (r.kind === "deal" && r.stageSignal) {
        out.applyStage = st.applyStage;
        out.stageSuggestion = r.stageSignal.suggestion;
      }
      return out;
    });

    const approvedTasks: ApprovedTask[] = data.tasks
      .map((t, ti) => ({ t, st: tasks[ti] }))
      .filter(({ st }) => st?.keep && st.ownerId)
      .map(({ t, st }) => ({
        title: t.title,
        context: t.context,
        priority: t.priority,
        due: t.due,
        ownerId: st.ownerId,
        clientId: t.clientId,
        projectId: t.projectId,
        reassignTaskId: t.reassignTaskId,
      }));

    return { records: approvedRecords, tasks: approvedTasks };
  }

  function approve() {
    setError(null);
    const selections = buildSelections();
    startTransition(async () => {
      try {
        await approveUnified(proposal.id, selections);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve");
      }
    });
  }

  function reject() {
    if (!confirm("Reject this proposal? Nothing will be written.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await rejectUnified(proposal.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject");
      }
    });
  }

  const partnerName = (id: string) => partners.find((p) => p.id === id)?.name ?? id;

  return (
    <Card className={cn(isPending && "opacity-60")}>
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {open ? (
            <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
          ) : (
            <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />
          )}
          <Sparkles size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <div className="min-w-0">
            <span className="text-[14px] text-bone truncate">{proposal.title}</span>
            <p className="text-[11px] text-bone-mute truncate">
              {counts.records} record(s) · {counts.adds} add(s) · {counts.overwrites} overwrite(s) ·{" "}
              {counts.tasks} task(s) · {proposal.createdBy}
            </p>
          </div>
        </div>
        <Badge tone={TYPE_TONE[proposal.ingestType]}>{proposal.ingestType}</Badge>
      </button>

      {open && (
        <div className="px-5 py-5 flex flex-col gap-6">
          {/* Summary (editable) */}
          <div className="flex flex-col gap-2">
            <Label gold>Summary</Label>
            <Textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* Key points (read-only) */}
          {data.keyPoints.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Key points</Label>
              <ul className="flex flex-col gap-1">
                {data.keyPoints.map((k, i) => (
                  <li key={i} className="text-[12px] text-bone-dim flex items-start gap-2">
                    <span className="text-track-gold mt-0.5">·</span>
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Records */}
          {data.records.map((r, ri) => (
            <RecordSection
              key={`${r.kind}-${r.recordId ?? "new"}-${ri}`}
              record={r}
              state={records[ri]}
              disabled={isPending}
              onToggleField={(i) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  fieldChanges: s.fieldChanges.map((x, j) => (j === i ? { keep: !x.keep } : x)),
                }))
              }
              onToggleList={(i) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  listAdditions: s.listAdditions.map((x, j) => (j === i ? { keep: !x.keep } : x)),
                }))
              }
              onToggleInteraction={(i) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  interactions: s.interactions.map((x, j) => (j === i ? { keep: !x.keep } : x)),
                }))
              }
              onToggleMilestone={(i) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  milestones: s.milestones.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)),
                }))
              }
              onMilestoneStatus={(i, status) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  milestones: s.milestones.map((x, j) => (j === i ? { ...x, status } : x)),
                }))
              }
              onToggleDeliverable={(i) =>
                patchRecord(ri, (s) => ({
                  ...s,
                  deliverables: s.deliverables.map((x, j) => (j === i ? { keep: !x.keep } : x)),
                }))
              }
              onToggleStage={() =>
                patchRecord(ri, (s) => ({ ...s, applyStage: !s.applyStage }))
              }
            />
          ))}

          {/* Tasks */}
          {data.tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label gold>
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks size={12} strokeWidth={1.5} />
                  Tasks ({tasks.filter((t) => t.keep).length} kept)
                </span>
              </Label>
              <div className="flex flex-col gap-2">
                {data.tasks.map((t, ti) => {
                  const st = tasks[ti];
                  const reassign = !!t.reassignTaskId;
                  return (
                    <div
                      key={ti}
                      className={cn(
                        "bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2",
                        !st.keep && "opacity-50",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={st.keep}
                          onChange={() => patchTask(ti, (s) => ({ ...s, keep: !s.keep }))}
                          disabled={isPending}
                          className="mt-1 accent-track-gold"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] text-bone leading-snug">{t.title}</span>
                            {reassign ? (
                              <Badge tone="steel">reassign</Badge>
                            ) : (
                              <Badge tone="neutral">new task</Badge>
                            )}
                          </div>
                          {t.context && (
                            <p className="text-[12px] text-bone-dim mt-0.5 leading-snug">{t.context}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-bone-mute">
                            <span className="inline-flex items-center gap-1">
                              priority <span className="text-bone-dim">{disp(t.priority)}</span>
                            </span>
                            {t.due && (
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock size={11} strokeWidth={1.5} />
                                {t.due}
                              </span>
                            )}
                          </div>
                          {reassign && (
                            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-bone-dim">
                              <span className="text-bone-mute">Reassign existing task</span>
                              <ArrowRight size={11} strokeWidth={1.5} className="text-track-gold" />
                              <span className="text-track-gold">{partnerName(st.ownerId)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-[120px] gap-3 pl-7">
                        <Select
                          value={st.ownerId}
                          onChange={(e) => patchTask(ti, (s) => ({ ...s, ownerId: e.target.value }))}
                          disabled={isPending}
                          className="h-8 text-[12px]"
                        >
                          {partners.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name.split(" ")[0]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Guard note */}
          <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
            <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <span className="text-[12px] text-bone-dim">
              Only checked items are written. Overwrites replace the current value; unchecked rows
              are left untouched.
            </span>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <Button variant="ghost" size="sm" onClick={reject} disabled={isPending}>
              Reject
            </Button>
            <Button variant="primary" size="sm" onClick={approve} disabled={isPending}>
              <Check size={13} strokeWidth={1.5} />
              {isPending ? "Writing…" : "Approve & write"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Record sub-section ──────────────────────────────────────────────────────

function RecordSection({
  record,
  state,
  disabled,
  onToggleField,
  onToggleList,
  onToggleInteraction,
  onToggleMilestone,
  onMilestoneStatus,
  onToggleDeliverable,
  onToggleStage,
}: {
  record: RecordProposal;
  state: RecordState;
  disabled?: boolean;
  onToggleField: (i: number) => void;
  onToggleList: (i: number) => void;
  onToggleInteraction: (i: number) => void;
  onToggleMilestone: (i: number) => void;
  onMilestoneStatus: (i: number, status: string) => void;
  onToggleDeliverable: (i: number) => void;
  onToggleStage: () => void;
}) {
  const Icon = KIND_ICON[record.kind];
  const isNew = record.recordId === null;
  const milestones = record.milestones ?? [];
  const interactions = record.interactions ?? [];
  const deliverables = record.deliverables ?? [];

  const empty =
    record.fieldChanges.length === 0 &&
    record.listAdditions.length === 0 &&
    interactions.length === 0 &&
    milestones.length === 0 &&
    deliverables.length === 0 &&
    !record.stageSignal &&
    !record.projectNotes;

  return (
    <div className="flex flex-col gap-3 border-l-2 border-graphite pl-4">
      {/* Record header */}
      <div className="flex items-center gap-2 -ml-[18px]">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-[var(--radius-pill)] bg-asphalt">
          <Icon size={12} strokeWidth={1.5} className="text-track-gold" />
        </span>
        <span className="text-[13px] text-bone">{record.label}</span>
        <Badge tone="neutral">{record.kind}</Badge>
        {isNew && <Badge tone="gold">new</Badge>}
      </div>

      {empty && (
        <p className="text-[12px] text-bone-mute">No changes proposed for this record.</p>
      )}

      {/* Scalar field changes — add vs replace */}
      {record.fieldChanges.length > 0 && (
        <div className="bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
          {record.fieldChanges.map((fc, i) => {
            const keep = state.fieldChanges[i]?.keep ?? false;
            return (
              <label
                key={i}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-row-hover)] transition-colors",
                  !keep && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={keep}
                  disabled={disabled}
                  onChange={() => onToggleField(i)}
                  className="mt-1 accent-track-gold"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="label">{fieldLabel(fc.field)}</span>
                    {fc.op === "replace" ? (
                      <Badge tone="red">overwrite</Badge>
                    ) : (
                      <Badge tone="gold">add</Badge>
                    )}
                  </span>
                  {fc.op === "replace" ? (
                    <span className="mt-0.5 flex flex-col gap-0.5">
                      {fc.existing != null && fc.existing !== "" && (
                        <span className="text-[12px] text-bone-mute line-through leading-snug">
                          {fc.existing}
                        </span>
                      )}
                      <span className="text-[13px] text-bone leading-snug inline-flex items-start gap-1.5">
                        <ArrowRight
                          size={12}
                          strokeWidth={1.5}
                          className="text-track-gold mt-0.5 shrink-0"
                        />
                        {fc.field === "phase" || fc.field === "status" ? disp(fc.proposed) : fc.proposed}
                      </span>
                    </span>
                  ) : (
                    <p className="text-[13px] text-bone mt-0.5 leading-snug">
                      {fc.field === "phase" || fc.field === "status" ? disp(fc.proposed) : fc.proposed}
                    </p>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* List additions (append-only) */}
      {record.listAdditions.length > 0 && (
        <div className="bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
          {record.listAdditions.map((la, i) => {
            const keep = state.listAdditions[i]?.keep ?? false;
            return (
              <label
                key={i}
                className={cn(
                  "flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-row-hover)] transition-colors",
                  !keep && "opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={keep}
                  disabled={disabled}
                  onChange={() => onToggleList(i)}
                  className="mt-1 accent-track-gold"
                />
                <span className="min-w-0">
                  <span className="label">{fieldLabel(la.field)}</span>
                  <p className="text-[13px] text-bone mt-0.5 leading-snug">{la.value}</p>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {/* Project notes (append-only, read-only display) */}
      {record.projectNotes && (
        <div className="flex flex-col gap-1">
          <Label>Project notes (appended)</Label>
          <p className="text-[12px] text-bone-dim leading-snug bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-2.5">
            {record.projectNotes}
          </p>
        </div>
      )}

      {/* Interactions */}
      {interactions.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Interactions → logged on the contact</Label>
          <div className="flex flex-col gap-2">
            {interactions.map((it: ProposedInteraction, i) => {
              const keep = state.interactions[i]?.keep ?? false;
              return (
                <div
                  key={i}
                  className={cn(
                    "bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex items-start gap-3",
                    !keep && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={keep}
                    disabled={disabled}
                    onChange={() => onToggleInteraction(i)}
                    className="mt-1 accent-track-gold"
                  />
                  <span className="text-[13px] text-bone leading-snug min-w-0">
                    {it.summary}{" "}
                    <span className="text-bone-mute">
                      · {disp(it.type)}
                      {it.date ? ` · ${it.date}` : ""}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Milestones</Label>
          <div className="flex flex-col gap-2">
            {milestones.map((m: ProposedMilestone, i) => {
              const ms = state.milestones[i];
              const keep = ms?.keep ?? false;
              return (
                <div
                  key={i}
                  className={cn(
                    "bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex flex-col gap-2",
                    !keep && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={keep}
                      disabled={disabled}
                      onChange={() => onToggleMilestone(i)}
                      className="accent-track-gold"
                    />
                    <span className="text-[13px] text-bone leading-snug flex-1 min-w-0">{m.title}</span>
                  </div>
                  <div className="grid grid-cols-[160px_1fr] gap-3 pl-7 items-center">
                    <span className="text-[11px] text-bone-mute">
                      {m.dueDate ? m.dueDate : "no due date"}
                    </span>
                    <Select
                      value={ms?.status ?? m.status}
                      onChange={(e) => onMilestoneStatus(i, e.target.value)}
                      disabled={disabled}
                      className="h-8 text-[12px]"
                    >
                      {M_STATUS_OPTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deliverables */}
      {deliverables.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label>Deliverables → artifacts</Label>
          <div className="bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden">
            {deliverables.map((d: ProposedDeliverable, i) => {
              const keep = state.deliverables[i]?.keep ?? false;
              return (
                <label
                  key={i}
                  className={cn(
                    "flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--color-row-hover)] transition-colors",
                    !keep && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={keep}
                    disabled={disabled}
                    onChange={() => onToggleDeliverable(i)}
                    className="mt-1 accent-track-gold"
                  />
                  <span className="text-[13px] text-bone leading-snug">
                    {d.title} <span className="text-bone-mute">· {disp(d.type)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Deal stage signal — single apply toggle */}
      {record.stageSignal && (
        <label
          className={cn(
            "flex items-start gap-3 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] cursor-pointer",
            !state.applyStage && "opacity-50",
          )}
        >
          <input
            type="checkbox"
            checked={state.applyStage}
            disabled={disabled}
            onChange={onToggleStage}
            className="mt-1 accent-track-gold"
          />
          <span className="text-[12px] text-bone-dim min-w-0">
            <span className="text-bone">Apply this stage move:</span>{" "}
            <span className="text-track-gold">{disp(record.stageSignal.suggestion)}</span>
            <span className="text-bone-mute"> — {record.stageSignal.rationale}</span>
          </span>
        </label>
      )}
    </div>
  );
}
