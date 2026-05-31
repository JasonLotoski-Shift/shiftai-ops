"use client";

import { useState, useTransition } from "react";
import {
  Bot,
  Plus,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  FileCode,
  Trash2,
  Pencil,
} from "lucide-react";
import { Card, Label, Badge, Button, Input, Textarea, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  createAgentPlan,
  updateAgentPlan,
  setAgentPlanStatus,
  deleteAgentPlan,
} from "@/app/(app)/agents/actions";

type PlanStatus = "idea" | "active" | "paused" | "done";

type PlanProp = {
  id: string;
  name: string;
  goal: string;
  keyTasks: string[];
  notes: string | null;
  status: PlanStatus;
  createdByName: string;
  updatedAt: string;
};

type SkillDoc = { name: string; title: string; body: string };

const STATUS_TONE: Record<PlanStatus, "neutral" | "gold" | "steel" | "bone"> = {
  idea: "bone",
  active: "gold",
  paused: "neutral",
  done: "steel",
};

const STATUSES: PlanStatus[] = ["idea", "active", "paused", "done"];

export function AgentsViews({
  plans,
  skills,
  firmContext,
}: {
  plans: PlanProp[];
  skills: SkillDoc[];
  firmContext: string | null;
}) {
  const [tab, setTab] = useState("plans");
  const [editing, setEditing] = useState<PlanProp | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="px-8 py-8 flex flex-col gap-6">
      <Tabs
        tabs={[
          { key: "plans", label: "Agent plans", count: plans.length },
          { key: "live", label: "Live skills", count: skills.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "plans" ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
              Draft what an agent <span className="text-bone">should</span> do — its goal and key tasks — before any skill or
              scheduled run exists. A planning surface, not a deploy. Promote a plan to a real skill when it&apos;s ready.
            </p>
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus size={13} strokeWidth={1.5} />
              New plan
            </Button>
          </div>

          {plans.length === 0 ? (
            <Card className="px-5 py-12 text-center">
              <Bot size={22} strokeWidth={1.5} className="text-bone-mute mx-auto mb-3" />
              <p className="text-[13px] text-bone-dim">No agent plans yet. Draft the first one.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <LiveSkills skills={skills} firmContext={firmContext} />
      )}

      {creating && <PlanModal onClose={() => setCreating(false)} />}
      {editing && <PlanModal plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlanProp; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();

  function cycleStatus(next: PlanStatus) {
    startTransition(async () => {
      try {
        await setAgentPlanStatus(plan.id, next);
      } catch {
        /* surfaced on reload */
      }
    });
  }

  function remove() {
    if (!confirm(`Delete the "${plan.name}" plan?`)) return;
    startTransition(async () => {
      try {
        await deleteAgentPlan(plan.id);
      } catch {
        /* surfaced on reload */
      }
    });
  }

  return (
    <Card className={cn("flex flex-col", isPending && "opacity-60")}>
      <div className="px-5 py-4 border-b border-graphite flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Bot size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <span className="text-[14px] text-bone truncate">{plan.name}</span>
        </div>
        <Badge tone={STATUS_TONE[plan.status]}>{plan.status}</Badge>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4 flex-1">
        <p className="text-[13px] text-bone-dim leading-relaxed">{plan.goal}</p>
        {plan.keyTasks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>— Key tasks</Label>
            <ul className="flex flex-col gap-1">
              {plan.keyTasks.map((t, i) => (
                <li key={i} className="text-[12px] text-bone-dim flex items-start gap-2">
                  <span className="text-track-gold mono text-[10px] mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {plan.notes && <p className="text-[12px] text-bone-mute leading-snug border-l-2 border-graphite pl-3">{plan.notes}</p>}
      </div>
      <div className="px-5 py-3 border-t border-graphite flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => cycleStatus(s)}
              disabled={isPending || s === plan.status}
              className={cn(
                "mono text-[9px] uppercase tracking-[0.1em] px-2 py-1 border rounded-[var(--radius-sm)] transition-colors",
                s === plan.status
                  ? "border-track-gold/40 text-track-gold bg-track-gold-dim/10"
                  : "border-graphite text-bone-mute hover:text-bone hover:border-bone-mute",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} disabled={isPending} className="text-bone-mute hover:text-bone" title="Edit">
            <Pencil size={13} strokeWidth={1.5} />
          </button>
          <button onClick={remove} disabled={isPending} className="text-bone-mute hover:text-flag-red" title="Delete">
            <Trash2 size={13} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function PlanModal({ plan, onClose }: { plan?: PlanProp; onClose: () => void }) {
  const [name, setName] = useState(plan?.name ?? "");
  const [goal, setGoal] = useState(plan?.goal ?? "");
  const [keyTasks, setKeyTasks] = useState(plan?.keyTasks.join("\n") ?? "");
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? "idea");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const payload = { name, goal, keyTasks, notes, status };
        if (plan) await updateAgentPlan(plan.id, payload);
        else await createAgentPlan(payload);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save plan");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-[600px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <Bot size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— {plan ? "Edit agent plan" : "New agent plan"}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Name <span className="text-flag-red">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly pipeline review" required disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Goal <span className="text-flag-red">*</span></Label>
            <Textarea rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="What should this agent accomplish?" required disabled={isPending} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Key tasks (one per line)</Label>
            <Textarea rows={4} value={keyTasks} onChange={(e) => setKeyTasks(e.target.value)} placeholder={"Pull deals stale 14d+\nDraft a summary\nPost to #pipeline"} disabled={isPending} />
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-4">
            <div className="flex flex-col gap-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanStatus)}
                disabled={isPending}
                className="h-9 px-3 bg-bitumen border border-graphite rounded-[var(--radius)] text-bone text-[14px] focus:border-track-gold focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !name.trim() || !goal.trim()}>
              {isPending ? "Saving…" : plan ? "Save changes" : "Create plan"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LiveSkills({ skills, firmContext }: { skills: SkillDoc[]; firmContext: string | null }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-bone-mute max-w-[680px] leading-relaxed">
        Every skill the ops tool ships, read straight off disk — the exact instructions each Quick Action and agent runs.
        No hidden prompts: this is how the firm&apos;s agents think.
      </p>

      {firmContext && (
        <SkillBlock
          name="_firm"
          title="Firm brain — shared house style"
          body={firmContext}
          subtitle="Prepended to every skill. Sets voice, identity, and the hard rules."
          defaultOpen={false}
        />
      )}

      {skills.length === 0 ? (
        <Card className="px-5 py-12 text-center">
          <FileCode size={22} strokeWidth={1.5} className="text-bone-mute mx-auto mb-3" />
          <p className="text-[13px] text-bone-dim">No skills found on disk.</p>
        </Card>
      ) : (
        skills.map((s) => <SkillBlock key={s.name} name={s.name} title={s.title} body={s.body} defaultOpen={false} />)
      )}
    </div>
  );
}

function SkillBlock({
  name,
  title,
  body,
  subtitle,
  defaultOpen,
}: {
  name: string;
  title: string;
  body: string;
  subtitle?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Card>
      <button onClick={() => setOpen((o) => !o)} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-graphite/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" /> : <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />}
          <FileCode size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <div className="min-w-0">
            <span className="text-[14px] text-bone">{title}</span>
            {subtitle && <p className="text-[11px] text-bone-mute leading-snug">{subtitle}</p>}
          </div>
        </div>
        <span className="mono text-[10px] text-bone-mute shrink-0">skills/{name}/</span>
      </button>
      {open && (
        <div className="px-5 py-4 border-t border-graphite">
          <pre className="text-[12px] text-bone-dim leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">{body}</pre>
        </div>
      )}
    </Card>
  );
}
