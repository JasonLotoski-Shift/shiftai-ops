"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Bot,
  Plug,
  Plus,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  FileCode,
  Trash2,
  Pencil,
} from "lucide-react";
import { Card, Label, Badge, Button, Input, Textarea, Tabs, Select, EmptyState } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import {
  createAgentPlan,
  updateAgentPlan,
  setAgentPlanStatus,
  deleteAgentPlan,
} from "@/app/(app)/agents/actions";

type PlanStatus = "idea" | "active" | "paused" | "done";
type PlanKind = "agent" | "mcp";

type PlanProp = {
  id: string;
  name: string;
  goal: string;
  keyTasks: string[];
  notes: string | null;
  status: PlanStatus;
  kind: PlanKind;
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

// Per-kind copy so one set of CRUD components serves both tabs.
const KIND_COPY: Record<PlanKind, { tasksLabel: string; tasksPlaceholder: string; newLabel: string; one: string }> = {
  agent: {
    tasksLabel: "Key tasks (one per line)",
    tasksPlaceholder: "Pull deals stale 14d+\nDraft a summary\nPost to #pipeline",
    newLabel: "New plan",
    one: "agent plan",
  },
  mcp: {
    tasksLabel: "Tools / capabilities (one per line)",
    tasksPlaceholder: "get_client(id)\nlist_pipeline(filters)\nlog_hours(project_id, hours, …)",
    newLabel: "New MCP plan",
    one: "MCP plan",
  },
};

// The MCP surface the ops tool exposes to Claude Code workspaces and scheduled
// agents — kept in sync with the live server at mcp/server.ts and the contract
// at docs/mcp-contract.md. The read/write tools are SHIPPED (stdio transport);
// the event stream is the next piece, still to build. This is also the "here"
// the team copies a good MCP plan into.
type McpStatus = "live" | "planned";
const MCP_SURFACE: { name: string; status: McpStatus; purpose: string; tools: string[] }[] = [
  {
    name: "Ops MCP server — read tools",
    status: "live",
    purpose: "How Claude pulls firm state from inside a workspace or a scheduled run.",
    tools: [
      "get_client(id)",
      "get_project(id)",
      "get_contact(id)",
      "list_pipeline(stage?)",
      "list_active_engagements()",
      "list_contacts(query?)",
      "list_artifacts(scope)",
    ],
  },
  {
    name: "Ops MCP server — write tools",
    status: "live",
    purpose: "How Claude updates firm state — each wrapped by the audit ledger, tagged AGENT · MCP.",
    tools: [
      "create_artifact(type, title, driveUrl, scope, …)",
      "create_task(title, ownerId, due, …)",
      "log_interaction(contactId, type, date, summary)",
      "update_project_status(projectId, status, notes?)",
    ],
  },
  {
    name: "Event stream",
    status: "planned",
    purpose: "Events Claude will listen for (webhooks or polling) to fire a skill — next to build.",
    tools: [
      "engagement.created → /onboard-client",
      "engagement.closed → /harvest-engagement",
      "proposal.requested → /scope",
    ],
  },
];

const MCP_STATUS_TONE: Record<McpStatus, "gold" | "neutral"> = {
  live: "gold",
  planned: "neutral",
};

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
  // null = closed; otherwise the kind we're drafting.
  const [creating, setCreating] = useState<PlanKind | null>(null);

  const agentPlans = useMemo(() => plans.filter((p) => p.kind === "agent"), [plans]);
  const mcpPlans = useMemo(() => plans.filter((p) => p.kind === "mcp"), [plans]);

  return (
    <div className="px-8 py-8 flex flex-col gap-8">
      <Tabs
        tabs={[
          { key: "plans", label: "Agent plans", count: agentPlans.length },
          { key: "live", label: "Agent (skills)", count: skills.length },
          { key: "mcps", label: "MCPs", count: MCP_SURFACE.length + mcpPlans.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "plans" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
              Draft what an agent <span className="text-bone">should</span> do — its goal and key tasks — before any skill or
              scheduled run exists. A planning surface, not a deploy. Promote a plan to a real skill when it&apos;s ready.
            </p>
            <Button variant="primary" size="sm" onClick={() => setCreating("agent")}>
              <Plus size={13} strokeWidth={1.5} />
              New plan
            </Button>
          </div>

          {agentPlans.length === 0 ? (
            <EmptyState
              icon={<Bot size={28} strokeWidth={1.5} />}
              title="No agent plans yet"
              hint="Draft the first one."
              action={
                <Button variant="primary" size="sm" onClick={() => setCreating("agent")}>
                  <Plus size={13} strokeWidth={1.5} />
                  New plan
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {agentPlans.map((p) => (
                <PlanCard key={p.id} plan={p} onEdit={() => setEditing(p)} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "live" && <LiveSkills skills={skills} firmContext={firmContext} />}

      {tab === "mcps" && (
        <McpsTab plans={mcpPlans} onNew={() => setCreating("mcp")} onEdit={(p) => setEditing(p)} />
      )}

      {creating && <PlanModal kind={creating} onClose={() => setCreating(null)} />}
      {editing && <PlanModal plan={editing} kind={editing.kind} onClose={() => setEditing(null)} />}
    </div>
  );
}

function McpsTab({
  plans,
  onNew,
  onEdit,
}: {
  plans: PlanProp[];
  onNew: () => void;
  onEdit: (p: PlanProp) => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-6">
        <p className="text-[13px] text-bone-mute max-w-[640px] leading-relaxed">
          The MCP server is how Claude Code workspaces and scheduled agents read and write firm state — same Prisma
          client, same Postgres as this UI. It&apos;s <span className="text-bone">live over stdio</span>: a workspace
          registers it in <span className="mono text-[11px] text-bone">.claude/settings.json</span> and calls these
          tools. Every write lands an <span className="text-bone">AuditLog</span> row + a feed entry, tagged{" "}
          <span className="mono text-[11px] text-bone">AGENT · MCP</span>. The team can draft MCP plans of their own,
          and a good one gets copied up to the surface.
        </p>
        <Button variant="primary" size="sm" onClick={onNew}>
          <Plus size={13} strokeWidth={1.5} />
          New MCP plan
        </Button>
      </div>

      {/* The MCP surface — live read/write tools + the planned event stream (read-only). */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Label gold>MCP surface</Label>
          <span className="text-[11px] text-bone-mute">— live server (mcp/server.ts) + what&apos;s next</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {MCP_SURFACE.map((m) => (
            <Card key={m.name} className="flex flex-col">
              <div className="px-5 py-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Plug size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
                  <span className="title-md truncate">{m.name}</span>
                </div>
                <Badge tone={MCP_STATUS_TONE[m.status]}>{m.status}</Badge>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3 flex-1">
                <p className="text-[13px] text-bone-dim leading-relaxed">{m.purpose}</p>
                <ul className="flex flex-col gap-1">
                  {m.tools.map((t, i) => (
                    <li key={i} className="text-[12px] text-bone-dim flex items-start gap-2">
                      <span className="text-track-gold mt-0.5">·</span>
                      <span className="mono text-[11px]">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Team MCP plans — drafts the team proposes (DB-backed). */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Label>Team MCP plans</Label>
          <span className="text-[11px] text-bone-mute">— proposed by the team; promote a good one to the plan above</span>
        </div>
        {plans.length === 0 ? (
          <EmptyState
            icon={<Plug size={28} strokeWidth={1.5} />}
            title="No MCP plans yet"
            hint="Draft a tool or server the firm should expose."
            action={
              <Button variant="primary" size="sm" onClick={onNew}>
                <Plus size={13} strokeWidth={1.5} />
                New MCP plan
              </Button>
            }
            compact
          />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {plans.map((p) => (
              <PlanCard key={p.id} plan={p} onEdit={() => onEdit(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({ plan, onEdit }: { plan: PlanProp; onEdit: () => void }) {
  const [isPending, startTransition] = useTransition();
  const copy = KIND_COPY[plan.kind];
  const Icon = plan.kind === "mcp" ? Plug : Bot;

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
    if (!confirm(`Delete the "${plan.name}" ${copy.one}?`)) return;
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
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={15} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <span className="title-md truncate">{plan.name}</span>
        </div>
        <Badge tone={STATUS_TONE[plan.status]}>{plan.status}</Badge>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4 flex-1">
        <p className="text-[13px] text-bone-dim leading-relaxed">{plan.goal}</p>
        {plan.keyTasks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label>{plan.kind === "mcp" ? "Tools / capabilities" : "Key tasks"}</Label>
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
        {plan.notes && <p className="text-[12px] text-bone-mute leading-snug">{plan.notes}</p>}
      </div>
      <div className="px-5 py-3 flex items-center justify-between gap-2">
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

function PlanModal({ plan, kind, onClose }: { plan?: PlanProp; kind: PlanKind; onClose: () => void }) {
  const copy = KIND_COPY[kind];
  const [name, setName] = useState(plan?.name ?? "");
  const [goal, setGoal] = useState(plan?.goal ?? "");
  const [keyTasks, setKeyTasks] = useState(plan?.keyTasks.join("\n") ?? "");
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [status, setStatus] = useState<PlanStatus>(plan?.status ?? "idea");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const Icon = kind === "mcp" ? Plug : Bot;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const payload = { name, goal, keyTasks, notes, status, kind };
        if (plan) await updateAgentPlan(plan.id, payload);
        else await createAgentPlan(payload);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save plan");
      }
    });
  }

  const title = plan
    ? kind === "mcp" ? "Edit MCP plan" : "Edit agent plan"
    : kind === "mcp" ? "New MCP plan" : "New agent plan";

  return (
    <ModalShell onClose={onClose} positionClassName="items-start justify-center pt-20 px-4">
      <div className="w-full max-w-[600px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Icon size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>{title}</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Name <span className="text-flag-red">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "mcp" ? "e.g. log_hours write tool" : "e.g. Weekly pipeline review"}
              required
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Goal <span className="text-flag-red">*</span></Label>
            <Textarea
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={kind === "mcp" ? "What should this MCP tool / server let Claude do?" : "What should this agent accomplish?"}
              required
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>{copy.tasksLabel}</Label>
            <Textarea rows={4} value={keyTasks} onChange={(e) => setKeyTasks(e.target.value)} placeholder={copy.tasksPlaceholder} disabled={isPending} />
          </div>
          <div className="grid grid-cols-[1fr_160px] gap-4">
            <div className="flex flex-col gap-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanStatus)}
                disabled={isPending}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
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
              {isPending ? "Saving…" : plan ? "Save changes" : kind === "mcp" ? "Create MCP plan" : "Create plan"}
            </Button>
          </div>
        </form>
      </div>
    </ModalShell>
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
        <EmptyState icon={<FileCode size={28} strokeWidth={1.5} />} title="No skills found on disk" />
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
      <button onClick={() => setOpen((o) => !o)} className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-[var(--color-row-hover)] transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={15} strokeWidth={1.5} className="text-track-gold shrink-0" /> : <ChevronRight size={15} strokeWidth={1.5} className="text-bone-mute shrink-0" />}
          <FileCode size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
          <div className="min-w-0">
            <span className="title-md">{title}</span>
            {subtitle && <p className="text-[11px] text-bone-mute leading-snug">{subtitle}</p>}
          </div>
        </div>
        <span className="mono text-[10px] text-bone-mute shrink-0">skills/{name}/</span>
      </button>
      {open && (
        <div className="px-5 pb-4">
          <pre className="text-[12px] text-bone-dim leading-relaxed whitespace-pre-wrap font-mono overflow-x-auto">{body}</pre>
        </div>
      )}
    </Card>
  );
}
