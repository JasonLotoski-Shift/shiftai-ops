"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardBody, Label, Badge, Tabs, Hairline } from "@/components/ui";
import {
  projects,
  clientById,
  partnerById,
  activities,
  tasks as seedTasks,
  teamUpdates,
  news,
  formatDate,
} from "@/lib/data/seed";
import {
  Mail,
  Sparkles,
  Clock,
  FileText,
  UserPlus,
  RefreshCw,
  Bot,
  Newspaper,
  Check,
} from "lucide-react";

const quickActions = [
  { icon: Mail, label: "Draft email", hint: "Claude drafts to a contact — confirms any missing facts first" },
  { icon: Sparkles, label: "Run an action", hint: "Enrich a contact, generate a brief, run a health check" },
  { icon: Clock, label: "Log hours", hint: "15-second time entry against a project" },
  { icon: FileText, label: "Draft proposal", hint: "Scope → SOW draft for partner review" },
  { icon: UserPlus, label: "Add contact", hint: "Capture an intro in under 30 seconds" },
  { icon: RefreshCw, label: "Re-engage stale", hint: "3 leads cold 30d+ — draft outreach" },
] as const;

export function DashboardViews() {
  const [tab, setTab] = useState("today");
  const [launched, setLaunched] = useState<string | null>(null);
  const [tasks, setTasks] = useState(seedTasks);

  const openTasks = tasks.filter((t) => !t.done);

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        tabs={[
          { key: "today", label: "Today", count: openTasks.length },
          { key: "firm", label: "The firm" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "today" ? (
        <div className="flex flex-col gap-10">
          {/* Quick actions */}
          <section className="flex flex-col gap-4">
            <Label>— Quick actions</Label>
            {launched && (
              <div className="flex items-center gap-3 px-4 py-2 border border-track-gold/40 bg-track-gold-dim/10">
                <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
                <span className="text-[13px] text-bone">
                  Prototype — <span className="text-track-gold">{launched}</span> would open here.
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-px bg-graphite border border-graphite">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    onClick={() => setLaunched(a.label)}
                    className="bg-asphalt p-5 text-left flex flex-col gap-2 hover:bg-graphite/40 transition-colors group"
                  >
                    <Icon size={16} strokeWidth={1.5} className="text-track-gold" />
                    <span className="text-[14px] text-bone group-hover:text-bone">{a.label}</span>
                    <span className="text-[12px] text-bone-mute leading-snug">{a.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Task list */}
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <Label>— Your tasks</Label>
              <span className="label">{openTasks.length} open</span>
            </div>
            <Card>
              {tasks.map((t, i) => {
                const owner = partnerById(t.ownerId);
                return (
                  <div
                    key={t.id}
                    className={`grid grid-cols-[24px_1fr_120px_110px] gap-4 items-center px-5 py-3 ${i < tasks.length - 1 ? "border-b border-graphite" : ""}`}
                  >
                    <button
                      onClick={() => toggleTask(t.id)}
                      aria-label={t.done ? "Mark task open" : "Mark task done"}
                      className={`w-5 h-5 border flex items-center justify-center transition-colors ${t.done ? "bg-diagnostic-steel/20 border-diagnostic-steel/50 text-diagnostic-steel" : "border-graphite-2 text-transparent hover:border-bone-mute"}`}
                    >
                      <Check size={12} strokeWidth={2.5} />
                    </button>
                    <div className="min-w-0">
                      <div className={`text-[14px] truncate ${t.done ? "text-bone-mute line-through" : "text-bone"}`}>
                        {t.title}
                      </div>
                      {t.relatedTo && <div className="text-[11px] text-bone-mute truncate">{t.relatedTo}</div>}
                    </div>
                    <div>
                      <Badge tone={t.priority === "high" ? "red" : t.priority === "medium" ? "gold" : "neutral"}>
                        {t.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(t.due)}</span>
                      <div className="w-5 h-5 bg-graphite-2 flex items-center justify-center mono text-[9px] text-bone-dim">
                        {owner?.initials}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: updates + engagements */}
          <div className="col-span-2 flex flex-col gap-6">
            {/* Team updates */}
            <section className="flex flex-col gap-4">
              <Label>— Team updates</Label>
              <Card>
                {teamUpdates.map((u, i) => (
                  <div key={u.id} className={`px-5 py-4 ${i < teamUpdates.length - 1 ? "border-b border-graphite" : ""}`}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`label ${u.author.startsWith("AGENT") ? "label-gold" : ""}`}>{u.author}</span>
                        {u.author.startsWith("AGENT") && <Bot size={11} strokeWidth={1.5} className="text-track-gold" />}
                        <Badge tone={u.cadence === "weekly" ? "gold" : "neutral"}>{u.cadence}</Badge>
                      </div>
                      <span className="label text-[9px]">
                        {new Date(u.ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-[13px] text-bone leading-relaxed">{u.body}</p>
                  </div>
                ))}
              </Card>
            </section>

            {/* Engagements board */}
            <section className="flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <Label>— Engagements</Label>
                <Link href="/projects" className="label-gold hover:underline">View all →</Link>
              </div>
              <Card>
                <div className="grid grid-cols-[1fr_120px_140px_120px] gap-4 px-5 py-3 border-b border-graphite">
                  <span className="label">Project</span>
                  <span className="label">Phase</span>
                  <span className="label">Hours · budget</span>
                  <span className="label text-right">Status</span>
                </div>
                {projects.filter((p) => p.status !== "closed").map((p) => {
                  const client = clientById(p.clientId);
                  const burn = (p.hoursLogged / p.budgetHours) * 100;
                  const overBudget = burn > 90;
                  return (
                    <Link
                      href={`/projects/${p.id}`}
                      key={p.id}
                      className="grid grid-cols-[1fr_120px_140px_120px] gap-4 px-5 py-4 border-b border-graphite last:border-0 hover:bg-graphite/40 transition-colors"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-[14px] text-bone truncate">{client?.company}</span>
                        <span className="text-[12px] text-bone-mute truncate">{p.name.split("·")[1]?.trim() ?? p.name}</span>
                      </div>
                      <div>
                        <Badge tone={p.phase === "build" ? "gold" : p.phase === "run" ? "steel" : "bone"}>{p.phase}</Badge>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={`mono text-[13px] ${overBudget ? "text-flag-red" : "text-bone"}`}>
                          {p.hoursLogged} / {p.budgetHours}
                        </span>
                        <div className="h-[2px] bg-graphite w-full">
                          <div
                            className={`h-full ${overBudget ? "bg-flag-red" : burn > 75 ? "bg-track-gold" : "bg-diagnostic-steel"}`}
                            style={{ width: `${Math.min(burn, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Badge tone={p.status === "on-track" ? "steel" : p.status === "at-risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                          {p.status}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </Card>
            </section>
          </div>

          {/* Right: news + activity */}
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Newspaper size={13} strokeWidth={1.5} className="text-bone-mute" />
                <Label>— Industry news</Label>
              </div>
              <Card>
                {news.map((n, i) => (
                  <div key={n.id} className={`px-5 py-4 ${i < news.length - 1 ? "border-b border-graphite" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <Label>{n.source}</Label>
                      <span className="label text-[9px]">{formatDate(n.ts)}</span>
                    </div>
                    <p className="text-[13px] text-bone leading-snug">{n.headline}</p>
                    <p className="text-[11px] text-bone-mute mt-1 leading-snug">{n.why}</p>
                  </div>
                ))}
              </Card>
            </section>

            <section className="flex flex-col gap-4">
              <Label>— Activity · 48h</Label>
              <Card>
                {activities.map((a, i) => (
                  <div key={a.id} className={`px-5 py-3 ${i < activities.length - 1 ? "border-b border-graphite" : ""}`}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className={`label ${a.type === "ai" ? "label-gold" : ""}`}>{a.actor}</span>
                      <span className="label text-[9px]">
                        {new Date(a.ts).toLocaleString("en-CA", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-[13px] text-bone leading-snug">{a.detail}</p>
                    <p className="text-[11px] text-bone-mute mt-1">{a.target}</p>
                  </div>
                ))}
              </Card>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
