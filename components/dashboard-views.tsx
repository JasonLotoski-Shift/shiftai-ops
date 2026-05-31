"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Tabs, SearchInput, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type {
  ActivityModel as Activity,
  ClientModel as Client,
  NewsItemModel as NewsItem,
  ProjectModel as Project,
  TeamUpdateModel as TeamUpdate,
} from "@/lib/generated/prisma/models";
import {
  Mail,
  Sparkles,
  FileText,
  UserPlus,
  ClipboardList,
  NotebookPen,
  Upload,
  Bot,
  Newspaper,
  Megaphone,
  Activity as ActivityIcon,
  Briefcase,
  X,
} from "lucide-react";

// Each tile either navigates straight to a route (e.g. Add contact opens a
// create form) or picks a target record, then opens the real action on that
// record's page via a ?qa=<action> param the detail page auto-opens.
type QAType = "contact" | "deal" | "client" | "nav" | "soon";
type QuickAction = {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  hint: string;
  type: QAType;
  qa?: string; // query param the detail page reads to auto-open the modal
  route?: string; // for type "nav" — navigate straight here
};

const quickActions: QuickAction[] = [
  { icon: Mail, label: "Draft email", hint: "Pick a contact — Claude drafts the email, confirms missing facts first", type: "contact", qa: "email" },
  { icon: FileText, label: "Draft proposal", hint: "Pick a deal — scope → proposal draft for review", type: "deal", qa: "proposal" },
  { icon: ClipboardList, label: "Draft client survey", hint: "Pick a client — a tailored survey from the engagement context", type: "client", qa: "survey" },
  { icon: NotebookPen, label: "Draft discussion doc", hint: "Pick a client — agenda for an upcoming conversation", type: "client", qa: "discussion" },
  { icon: UserPlus, label: "Add contact", hint: "Capture an intro in under 30 seconds", type: "nav", route: "/contacts?qa=add" },
  { icon: Upload, label: "Upload client files", hint: "Pick a client — drop in meeting notes (e.g. Fireflies), filed and logged", type: "client", qa: "upload" },
  { icon: Sparkles, label: "Run an action", hint: "Pick a contact — Claude enriches the record from its interaction log", type: "contact", qa: "enrich" },
];

type ProjectWithClient = Project & { client: Client };
type PickRecord = { id: string; label: string; sub?: string };

interface DashboardViewsProps {
  activeProjects: ProjectWithClient[];
  activities: Activity[];
  teamUpdates: TeamUpdate[];
  news: NewsItem[];
  contacts: { id: string; name: string; company: string }[];
  deals: { id: string; company: string }[];
  clients: { id: string; company: string }[];
}

export function DashboardViews({
  activeProjects,
  activities,
  teamUpdates,
  news,
  contacts,
  deals,
  clients,
}: DashboardViewsProps) {
  const router = useRouter();
  const [tab, setTab] = useState("today");
  const [pick, setPick] = useState<QuickAction | null>(null);
  const [soon, setSoon] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Records to pick from, by the active tile's type.
  const pickRecords: PickRecord[] = useMemo(() => {
    if (pick?.type === "contact") return contacts.map((c) => ({ id: c.id, label: c.name, sub: c.company }));
    if (pick?.type === "deal") return deals.map((d) => ({ id: d.id, label: d.company }));
    if (pick?.type === "client") return clients.map((c) => ({ id: c.id, label: c.company }));
    return [];
  }, [pick, contacts, deals, clients]);

  const filtered = pickRecords.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q) || (r.sub?.toLowerCase().includes(q) ?? false);
  });

  function openPicker(a: QuickAction) {
    if (a.type === "soon") {
      setSoon(a.label);
      return;
    }
    if (a.type === "nav" && a.route) {
      router.push(a.route);
      return;
    }
    setSoon(null);
    setQuery("");
    setPick(a);
  }

  function choose(id: string) {
    if (!pick) return;
    const base = pick.type === "contact" ? "/contacts" : pick.type === "deal" ? "/pipeline" : "/clients";
    setPick(null);
    router.push(`${base}/${id}?qa=${pick.qa}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs
        tabs={[
          { key: "today", label: "Today" },
          { key: "firm", label: "The firm" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "today" ? (
        <div className="flex flex-col gap-10">
          {/* Quick actions */}
          <section className="flex flex-col gap-4">
            <h2 className="title-md">Quick actions</h2>
            {soon && (
              <div className="flex items-center gap-3 px-4 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)]">
                <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
                <span className="text-[13px] text-bone">
                  <span className="text-track-gold">{soon}</span> is coming soon — not wired up yet.
                </span>
                <button onClick={() => setSoon(null)} className="ml-auto text-bone-mute hover:text-bone">
                  <X size={13} strokeWidth={1.5} />
                </button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    onClick={() => openPicker(a)}
                    className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 text-left flex flex-col gap-2 hover:shadow-[var(--shadow)] hover:bg-[var(--color-row-hover)] transition-all group"
                  >
                    <Icon size={16} strokeWidth={1.5} className="text-track-gold" />
                    <span className="text-[14px] text-bone group-hover:text-bone">{a.label}</span>
                    <span className="text-[12px] text-bone-mute leading-snug">{a.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Record picker — choose the target, then land on its page with the action open */}
          {pick && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto"
              onClick={() => setPick(null)}
            >
              <div className="w-full max-w-[480px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4">
                  <Label gold>{pick.label} · pick a {pick.type}</Label>
                  <button onClick={() => setPick(null)} className="text-bone-mute hover:text-bone">
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="px-5 py-3">
                  <SearchInput autoFocus placeholder={`Search ${pick.type}s…`} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="max-h-[50vh] overflow-y-auto">
                  {filtered.length === 0 ? (
                    <EmptyState compact title={`No ${pick.type}s match`} />
                  ) : (
                    filtered.map((r, i) => (
                      <button
                        key={r.id}
                        onClick={() => choose(r.id)}
                        className="w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-[var(--color-row-hover)] transition-colors"
                      >
                        <span className="text-[14px] text-bone">{r.label}</span>
                        {r.sub && <span className="text-[12px] text-bone-mute">{r.sub}</span>}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: updates + engagements */}
          <div className="col-span-2 flex flex-col gap-6">
            {/* Team updates */}
            <section className="flex flex-col gap-4">
              <h2 className="title-md">Team updates</h2>
              <Card>
                {teamUpdates.length === 0 ? (
                  <EmptyState compact icon={<Megaphone size={22} strokeWidth={1.5} />} title="No team updates yet" />
                ) : (
                  teamUpdates.map((u, i) => (
                  <div key={u.id} className="px-5 py-4">
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
                  ))
                )}
              </Card>
            </section>

            {/* Engagements board (already filtered server-side to active) */}
            <section className="flex flex-col gap-4">
              <div className="flex items-end justify-between">
                <h2 className="title-md">Engagements</h2>
                <Link href="/projects" className="label-gold hover:underline">View all →</Link>
              </div>
              <Card>
                {activeProjects.length === 0 ? (
                  <EmptyState compact icon={<Briefcase size={22} strokeWidth={1.5} />} title="No active engagements" />
                ) : (
                <>
                <div className="grid grid-cols-[1fr_140px_120px] gap-4 px-5 py-3">
                  <span className="text-[11px] text-bone-dim">Project</span>
                  <span className="text-[11px] text-bone-dim">Phase</span>
                  <span className="text-[11px] text-bone-dim text-right">Status</span>
                </div>
                {activeProjects.map((p) => {
                  return (
                    <Link
                      href={`/projects/${p.id}`}
                      key={p.id}
                      className="grid grid-cols-[1fr_140px_120px] gap-4 px-5 py-4 hover:bg-[var(--color-row-hover)] transition-colors"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-[14px] text-bone truncate">{p.client.company}</span>
                        <span className="text-[12px] text-bone-mute truncate">{p.name.split("·")[1]?.trim() ?? p.name}</span>
                      </div>
                      <div>
                        <Badge tone={p.phase === "build" ? "gold" : p.phase === "run" ? "steel" : "bone"}>{p.phase}</Badge>
                      </div>
                      <div className="flex justify-end">
                        <Badge tone={p.status === "on_track" ? "steel" : p.status === "at_risk" ? "gold" : p.status === "blocked" ? "red" : "neutral"}>
                          {p.status.replace("_", "-")}
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
                </>
                )}
              </Card>
            </section>
          </div>

          {/* Right: news + activity */}
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Newspaper size={15} strokeWidth={1.5} className="text-bone-mute" />
                <h2 className="title-md">Industry news</h2>
              </div>
              <Card>
                {news.length === 0 ? (
                  <EmptyState compact icon={<Newspaper size={22} strokeWidth={1.5} />} title="No industry news yet" />
                ) : (
                  news.map((n, i) => (
                  <div key={n.id} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <Label>{n.source}</Label>
                      <span className="label text-[9px]">{formatDate(n.ts)}</span>
                    </div>
                    <p className="text-[13px] text-bone leading-snug">{n.headline}</p>
                    <p className="text-[11px] text-bone-mute mt-1 leading-snug">{n.why}</p>
                  </div>
                  ))
                )}
              </Card>
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="title-md">Activity · 48h</h2>
              <Card>
                {activities.length === 0 ? (
                  <EmptyState compact icon={<ActivityIcon size={22} strokeWidth={1.5} />} title="No activity in the last 48h" />
                ) : (
                activities.map((a, i) => {
                  const rowClass = `block px-5 py-3`;
                  const inner = (
                    <>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className={`label ${a.type === "ai" ? "label-gold" : ""}`}>{a.actor}</span>
                        <span className="label text-[9px]">
                          {new Date(a.ts).toLocaleString("en-CA", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-[13px] text-bone leading-snug">{a.detail}</p>
                      <p className="text-[11px] text-bone-mute mt-1">{a.target}</p>
                    </>
                  );
                  return a.link ? (
                    <Link key={a.id} href={a.link} className={`${rowClass} hover:bg-[var(--color-row-hover)] transition-colors`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={a.id} className={rowClass}>
                      {inner}
                    </div>
                  );
                })
                )}
              </Card>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
