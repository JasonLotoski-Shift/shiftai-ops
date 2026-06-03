"use client";

import { useState, type ReactNode } from "react";
import { Card, CardBody, Label, Badge, Tabs } from "@/components/ui";
import {
  Database,
  FolderOpen,
  Bot,
  ShieldCheck,
  ArrowRight,
  MousePointerClick,
  Sparkles,
  Eye,
  FileCheck2,
  Mic,
  FileUp,
  GitBranch,
  UserPlus,
  Mail,
  Search,
  Receipt,
  ListTodo,
  KanbanSquare,
  Flag,
  Calculator,
  Crosshair,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────
   How it works — two-tab reference.
   1. How it's built — condensed plain-English architecture.
   2. What happens when I do X — visual process maps for each flow.
   ────────────────────────────────────────────────────────────────────── */

export function HowItWorksView() {
  const [tab, setTab] = useState("built");

  return (
    <div className="flex flex-col gap-8">
      <Tabs
        tabs={[
          { key: "built", label: "How it's built" },
          { key: "flows", label: "What happens when I do X" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "built" && <HowItsBuilt />}
      {tab === "flows" && <ProcessMaps />}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Tab A — How it's built
   ────────────────────────────────────────────────────────────────────── */

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label gold>{eyebrow}</Label>
      <span className="title-lg">{title}</span>
    </div>
  );
}

function HowItsBuilt() {
  return (
    <div className="flex flex-col gap-10 max-w-[920px]">
      {/* TL;DR */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="In one line" title="One source of truth, four ways in." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          The ops tool is the firm's system of record. Every piece of work — a logged call, a
          logged hour, a sent email, a saved deliverable — writes one row to Postgres and one row
          to the audit log. <span className="text-bone">Nothing happens silently.</span> If it
          isn't tracked in the tool, it didn't happen.
        </p>
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Files live in a single Google Shared Drive — one folder per client. Claude shows up in
          three spots: <span className="text-bone">Quick Actions</span> inside the tool,{" "}
          <span className="text-bone">Claude Code</span> at the per-client folder for heavy work,
          and <span className="text-bone">scheduled agents</span> reaching the same database.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardBody className="flex flex-col gap-2">
              <Label gold>Stack</Label>
              <p className="text-[13px] text-bone-dim leading-relaxed">
                Next.js 15 (App Router) · Auth.js v5 single sign-on · Prisma 7 · Supabase Postgres ·
                Vercel · Tailwind v4 · Google Drive API · Claude API.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-col gap-2">
              <Label gold>Where it lives</Label>
              <p className="text-[13px] text-bone-dim leading-relaxed">
                <span className="mono text-bone">ops.shiftai.partners</span> — Google sign-in,
                restricted to firm emails. First sign-in creates your Partner record automatically.
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Data model */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="The data model" title="Pipeline → engagement → tracking." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          The spine is simple. A <span className="text-bone">Contact</span> is a person. A{" "}
          <span className="text-bone">Deal</span> is that contact in motion toward a contract. When
          the deal signs, it becomes a <span className="text-bone">Client</span> with a starter{" "}
          <span className="text-bone">Project</span>. The Client carries the engagement — revenue,
          Drive folder, workspace path; Projects break it into phases.
        </p>

        {/* spine */}
        <Card>
          <CardBody>
            <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
              <SpineNode label="Contact" sub="person" />
              <SpineArrow caption="has" />
              <SpineNode label="Deal" sub="pipeline" />
              <SpineArrow caption="signs" />
              <SpineNode label="Client" sub="signed" gold />
              <SpineArrow caption="scopes" />
              <SpineNode label="Project" sub="phase" />
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <ModelGroup
            label="Pipeline"
            models="Contact, Deal"
            note="The pre-signed relationship and the sales motion."
          />
          <ModelGroup
            label="Engagement"
            models="Client, Project, Milestone, Invoice"
            note="Post-signed: the actual work, billed and tracked."
          />
          <ModelGroup
            label="Tracking"
            models="Interaction, HoursEntry, Task, Artifact"
            note="The four channels that round-trip every action into the database."
          />
          <ModelGroup
            label="Audit"
            models="AuditLog"
            note="Every mutation writes one row. The diligence trail — never written without an actor."
          />
        </div>
      </section>

      {/* Four channels */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="Tracking" title="Four channels that round-trip back." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Every place work happens — a partner typing in the UI, a Quick Action running, a Claude
          Code session, a scheduled agent — round-trips a row into the tool. These are the four.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <ChannelCard
            icon={<Mic size={15} strokeWidth={1.5} />}
            title="Calls, meetings, emails"
            model="Interaction"
            note="Manual form, a Quick Action tagged AGENT · CLAUDE, or Gmail/Calendar ingest."
          />
          <ChannelCard
            icon={<ListTodo size={15} strokeWidth={1.5} />}
            title="To-dos"
            model="Task"
            note="Manual form, kickoff tasks from a deal convert, or a Quick Action suggestion."
          />
          <ChannelCard
            icon={<Database size={15} strokeWidth={1.5} />}
            title="Hours"
            model="HoursEntry"
            note="Manual form, or a Claude Code session-end hook logging time back."
          />
          <ChannelCard
            icon={<FolderOpen size={15} strokeWidth={1.5} />}
            title="Deliverables"
            model="Artifact"
            note="Quick Action output, a manual upload, or the Drive change watcher."
          />
        </div>

        <Card className="border border-track-gold/40 bg-track-gold-dim/5">
          <CardBody className="flex items-start gap-3">
            <ShieldCheck size={16} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <p className="text-[13px] text-bone leading-relaxed">
              The rule: if you do something and it doesn't write to one of those four channels, the
              firm has no record of it. That's the exact failure the architecture exists to prevent.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Persistence recipe */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="Persistence recipe" title="How an AI deliverable is saved." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Every Quick Action and every agent follows the same shape — no exceptions. It's what
          makes the AI surfaces feel native to the tool instead of bolted on.
        </p>

        <Card>
          <div className="flex flex-col">
            <RecipeStep
              n="01"
              title="Check the inputs"
              body="Any blank that Claude wasn't given stays as an explicit [NEEDS INPUT] marker. If one is still there, the action refuses to save. Claude never invents a price, a role, or a date."
            />
            <RecipeStep
              n="02"
              title="Pull scope + context"
              body="Load the linked record (Contact / Deal / Client / Project), pick the Drive target, and fetch only the specific source files Claude needs as input."
            />
            <RecipeStep
              n="03"
              title="Call the model"
              body="The skill content goes in as the system prompt; firm + record context goes in as the message; the result streams back to the page."
            />
            <RecipeStep
              n="04"
              title="Persist — in one transaction"
              body="Save the file to Drive, write an Artifact row pointing at it, write an Interaction row if it's outreach, and always write one AuditLog row. Any partial failure rolls the whole thing back."
              last
            />
          </div>
        </Card>

        <Card className="border border-track-gold/40 bg-track-gold-dim/5">
          <CardBody className="flex items-start gap-3">
            <ShieldCheck size={16} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
            <p className="text-[13px] text-bone leading-relaxed">
              Because all of it commits together, you can't end up with an email that was sent but
              never logged, or a file on Drive that no client knows about. The transaction is the
              integrity guarantee.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Claude wiring */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="Claude" title="Three places Claude shows up." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Use the right Claude for the surface. Short scoped drafts in the tool; multi-file work at
          the client folder; the recurring stuff handled by agents you don't have to remember.
        </p>

        <div className="grid grid-cols-3 gap-4">
          <ClaudeCard
            tag="A — In the tool"
            where="Buttons on Contact, Client and Project pages."
            forWhat="Short scoped drafts — emails, re-engagement, scope text."
          />
          <ClaudeCard
            tag="B — Claude Code"
            where="Opened at the client's local synced folder."
            forWhat="Multi-file lifts — proposals, decks, build artifacts. Hours log back at session end."
          />
          <ClaudeCard
            tag="C — Agents"
            where="Scheduled, writing through the same tools."
            forWhat="Weekly pipeline review, stale-deal nudges, harvest-on-close."
          />
        </div>

        <Card>
          <CardBody className="flex flex-col gap-2">
            <Label gold>The no-guessing gate, made permanent</Label>
            <p className="text-[13px] text-bone-dim leading-relaxed">
              Two layers, both enforced. The UI marks blanks as{" "}
              <span className="mono text-bone">[NEEDS INPUT]</span> and disables Send. The server
              gate throws if any marker reaches a save. The model never invents a price, a role, a
              date, or a commitment — if you don't supply it, it stays a marker for you to fill, not
              a guess.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* Web search note */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="Two enrichment modes" title="Records-only, or from the web." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          When you keep a record current, you choose the source.{" "}
          <span className="text-bone">Records-only</span> reads what's already logged — your
          interactions and notes — and proposes tidy-ups. <span className="text-bone">From the
          web</span> runs real external searches and brings back facts with citations. Either way,
          updates are proposed, never silently overwritten: existing facts stay unless you accept a
          change.
        </p>
      </section>
    </div>
  );
}

/* ── Built-tab sub-pieces ───────────────────────────────────────────── */

function SpineNode({ label, sub, gold = false }: { label: string; sub: string; gold?: boolean }) {
  return (
    <div
      className={
        "flex flex-col gap-0.5 px-4 py-3 rounded-[var(--radius)] shrink-0 min-w-[120px] " +
        (gold
          ? "bg-track-gold-dim/15 border border-track-gold/40"
          : "bg-bitumen border border-graphite")
      }
    >
      <span className={"text-[13px] " + (gold ? "text-track-gold" : "text-bone")}>{label}</span>
      <span className="label text-[9px]">{sub}</span>
    </div>
  );
}

function SpineArrow({ caption }: { caption: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 px-1 self-center">
      <span className="label text-[8px]">{caption}</span>
      <ArrowRight size={16} strokeWidth={1.5} className="text-bone-mute" />
    </div>
  );
}

function ModelGroup({ label, models, note }: { label: string; models: string; note: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-1.5">
        <Label gold>{label}</Label>
        <div className="mono text-[12px] text-bone">{models}</div>
        <p className="text-[12px] text-bone-mute leading-relaxed">{note}</p>
      </CardBody>
    </Card>
  );
}

function ChannelCard({
  icon,
  title,
  model,
  note,
}: {
  icon: ReactNode;
  title: string;
  model: string;
  note: string;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-track-gold">{icon}</span>
            <span className="title-md text-[14px]">{title}</span>
          </div>
          <Badge tone="gold" className="mono">
            {model}
          </Badge>
        </div>
        <p className="text-[12px] text-bone-mute leading-relaxed">{note}</p>
      </CardBody>
    </Card>
  );
}

function RecipeStep({
  n,
  title,
  body,
  last = false,
}: {
  n: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-start gap-4 px-5 py-4 " + (last ? "" : "border-b border-graphite")
      }
    >
      <span className="mono text-[13px] text-track-gold tabular-nums mt-0.5 min-w-[24px]">{n}</span>
      <div className="flex flex-col gap-1">
        <span className="text-[14px] text-bone">{title}</span>
        <p className="text-[13px] text-bone-dim leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function ClaudeCard({ tag, where, forWhat }: { tag: string; where: string; forWhat: string }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Bot size={14} strokeWidth={1.5} className="text-track-gold" />
          <Label gold>{tag}</Label>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <Label>Where</Label>
            <span className="text-[12px] text-bone-dim leading-snug">{where}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <Label>For</Label>
            <span className="text-[12px] text-bone-dim leading-snug">{forWhat}</span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Tab B — Process maps ("what happens when I do X")
   ────────────────────────────────────────────────────────────────────── */

type StepTone = "trigger" | "claude" | "review" | "write";

type FlowStep = {
  tone: StepTone;
  kind: string;
  label: string;
};

type Flow = {
  icon: ReactNode;
  title: string;
  blurb: string;
  steps: FlowStep[];
};

const flows: Flow[] = [
  {
    icon: <Crosshair size={16} strokeWidth={1.5} />,
    title: "Hunt for new leads",
    blurb: "Define who you want, run the search, then review the companies the agent found.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Targeting → build a segment (who you want), pick Reveal emails: Primary only or All contacts" },
      { tone: "trigger", kind: "You do", label: "Hit Run search on the segment — it works for up to ~3.5 min (the card shows \"Searching…\")" },
      { tone: "claude", kind: "Claude", label: "Finds + rates matching companies, reveals contact emails, writes them to AI Found Leads" },
      { tone: "review", kind: "You review", label: "Open a lead → Reveal email on any contact (1 Apollo credit), draft a cold intro, or add to the funnel" },
      { tone: "write", kind: "Saved", label: "Leads + reveals + AuditLog; the Apollo-credits meter on Targeting tracks emails revealed this month" },
    ],
  },
  {
    icon: <Mic size={16} strokeWidth={1.5} />,
    title: "Ingest anything",
    blurb: "One place to log a meeting, email, or document and update the right records.",
    steps: [
      { tone: "trigger", kind: "You do", label: "+ Ingest → pick type, target records, paste content/email/files" },
      { tone: "claude", kind: "Claude", label: "Proposes updates across contact, client, project, deal — incl. overwrites" },
      { tone: "review", kind: "You review", label: "Approve each addition; every overwrite shows old → new" },
      { tone: "write", kind: "Saved", label: "Records updated + Interaction/Tasks/Milestones + AuditLog" },
    ],
  },
  {
    icon: <FileUp size={16} strokeWidth={1.5} />,
    title: "Ingest from a record",
    blurb: "Launch ingest already pointed at the contact, client, or project you're on.",
    steps: [
      { tone: "trigger", kind: "You do", label: "+ Ingest on a contact/client/project header" },
      { tone: "claude", kind: "Claude", label: "Focuses that record, but still flags related updates" },
      { tone: "review", kind: "You review", label: "Approve adds; uncheck anything you don't want" },
      { tone: "write", kind: "Saved", label: "Same review queue — nothing writes until you approve" },
    ],
  },
  {
    icon: <ListTodo size={16} strokeWidth={1.5} />,
    title: "Work a deal through the stages",
    blurb: "Each stage from Discovery Call to Proposal has a one-click draft, reviewed before it leaves.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On the deal header: Discovery prep · Survey · Follow-up email · Book meeting · Draft proposal" },
      { tone: "claude", kind: "Claude", label: "Drafts from the deal's history — internal prep, a survey, a follow-up, or a proposal" },
      { tone: "review", kind: "You review", label: "Edit freely; [NEEDS INPUT] blocks save until you fill real facts in" },
      { tone: "write", kind: "Saved", label: "Filed to Drive + an Artifact on the deal (a sent email also logs an interaction)" },
    ],
  },
  {
    icon: <Sparkles size={16} strokeWidth={1.5} />,
    title: "Build the proposal package",
    blurb: "At the Proposal stage: an interactive prototype and a formal presentation deck.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On the deal: Build prototype (say what to show) → then Build deck" },
      { tone: "claude", kind: "Claude", label: "Prototype = frame → spec → write HTML (multi-step); deck = scope/timeline/price + a Demo-prototype link" },
      { tone: "review", kind: "You review", label: "Preview in the browser, edit the HTML; [NEEDS INPUT] blocks save until resolved" },
      { tone: "write", kind: "Saved", label: "Each files to Drive as a self-contained .html + an Artifact on the deal" },
    ],
  },
  {
    icon: <GitBranch size={16} strokeWidth={1.5} />,
    title: "Convert a deal to a client",
    blurb: "A signed deal becomes a live engagement with everything scaffolded.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Pipeline → Deal → Convert to client" },
      { tone: "claude", kind: "System", label: "Creates the Drive folder + starter Discovery project + 50/25/25 schedule" },
      { tone: "review", kind: "You review", label: "Confirm contract value, terms, partner lead" },
      { tone: "write", kind: "Saved", label: "Client + Project + billing schedule + kickoff Tasks + AuditLog" },
    ],
  },
  {
    icon: <UserPlus size={16} strokeWidth={1.5} />,
    title: "Add a client",
    blurb: "Stand up a client record directly, without a deal in front of it.",
    steps: [
      { tone: "trigger", kind: "You do", label: "New client → fill company, contact, terms" },
      { tone: "claude", kind: "Claude", label: "Offers to enrich the profile from the web" },
      { tone: "review", kind: "You review", label: "Accept the proposed facts you want" },
      { tone: "write", kind: "Saved", label: "Client row + Drive folder + AuditLog" },
    ],
  },
  {
    icon: <Mail size={16} strokeWidth={1.5} />,
    title: "Draft an email or proposal",
    blurb: "A Quick Action writes the draft and files it the moment you accept.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Contact/Client → Draft email (or proposal)" },
      { tone: "claude", kind: "Claude", label: "Drafts from firm voice + record context" },
      { tone: "review", kind: "You review", label: "Edit, fill any [NEEDS INPUT], then Save/Send" },
      { tone: "write", kind: "Saved", label: "Artifact + Interaction (if sent) + AuditLog" },
    ],
  },
  {
    icon: <Search size={16} strokeWidth={1.5} />,
    title: "Enrich a record",
    blurb: "Two modes: tidy from what's logged, or look it up on the web.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On a record → Enrich · pick records-only or web" },
      { tone: "claude", kind: "Claude", label: "Records-only reads logs · web searches with citations" },
      { tone: "review", kind: "You review", label: "Accept additions — existing facts never overwritten" },
      { tone: "write", kind: "Saved", label: "Updated fields + enrichedAt + AuditLog" },
    ],
  },
  {
    icon: <Calculator size={16} strokeWidth={1.5} />,
    title: "Estimate a contract before the proposal",
    blurb: "Size the contract value from hours-by-tier before you propose.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Deal → Build estimate · add a line per tier (hours at standard rates)" },
      { tone: "claude", kind: "Shown", label: "Estimated contract value + margin · override any rate" },
      { tone: "review", kind: "You do", label: "Mark sent, then accepted — accepting locks the version" },
      { tone: "write", kind: "Saved", label: "On win, the accepted estimate becomes the project's economics + AuditLog" },
    ],
  },
  {
    icon: <Receipt size={16} strokeWidth={1.5} />,
    title: "Raise, generate, or log an invoice",
    blurb: "Build an invoice off the engagement and track it to paid.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Project → Raise invoice · pick a stage or amount + due date" },
      { tone: "claude", kind: "Claude", label: "Generates the invoice doc — or tick \"sent manually\" to just log it" },
      { tone: "review", kind: "You review", label: "Edit a draft's amount/due, mark Sent when it goes out" },
      { tone: "write", kind: "Saved", label: "Invoice (draft→sent→paid) + Artifact + change log + AuditLog" },
    ],
  },
  {
    icon: <FileCheck2 size={16} strokeWidth={1.5} />,
    title: "Set up a project's economics & payouts",
    blurb: "What you bill vs. what you pay — and where every billed dollar goes.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Project → Financials tab → Economics · add a line per person (pick a tier, hours)" },
      { tone: "claude", kind: "Shown", label: "Cost vs. billable + the 10/15/75 split: commission, firm pool, team, reserve" },
      { tone: "review", kind: "You do", label: "Set the commission % + who sourced it · split team payouts per stage · mark paid" },
      { tone: "write", kind: "Tracked", label: "Owed vs. paid per consultant + firm reserve + change log + AuditLog" },
    ],
  },
  {
    icon: <FileUp size={16} strokeWidth={1.5} />,
    title: "Ingest scope pricing",
    blurb: "Turn a scoping doc's pricing into project economics, for review.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Project → Scope-pricing ingest · paste the doc" },
      { tone: "claude", kind: "Claude", label: "Reads only the pricing — people, hours, rates" },
      { tone: "review", kind: "You review", label: "Adjust lines, match consultants, approve (or reject)" },
      { tone: "write", kind: "Saved", label: "Economics lines (+ optional 50/25/25 schedule) + AuditLog" },
    ],
  },
  {
    icon: <Flag size={16} strokeWidth={1.5} />,
    title: "Shape a project's delivery",
    blurb: "Set the type, break work into milestones, plan the money.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Set the project type · add milestones (dated or not)" },
      { tone: "trigger", kind: "You do", label: "Add tasks under each milestone · set the billing schedule" },
      { tone: "review", kind: "Shown", label: "Timeline plots milestones, billing dates, sent/paid dots" },
      { tone: "write", kind: "Tracked", label: "Value, invoiced, received, missing, remaining, extras" },
    ],
  },
  {
    icon: <KanbanSquare size={16} strokeWidth={1.5} />,
    title: "Work the task board",
    blurb: "Milestone cards hold their sub-tasks; loose tasks move on their own.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Milestones are cards · open one for its sub-tasks + owners" },
      { tone: "review", kind: "Shown", label: "Red if a milestone has no owner · amber if a sub-task doesn't" },
      { tone: "trigger", kind: "You do", label: "Drag milestones + loose tasks across the columns · set sub-task stage inside" },
      { tone: "write", kind: "Saved", label: "Status + assignee + AuditLog · link icon jumps to the tied record" },
    ],
  },
];

const stepStyles: Record<StepTone, { box: string; kind: string; icon: ReactNode }> = {
  trigger: {
    box: "bg-bitumen border border-graphite",
    kind: "text-bone-dim",
    icon: <MousePointerClick size={13} strokeWidth={1.5} />,
  },
  claude: {
    box: "bg-track-gold-dim/10 border border-track-gold/40",
    kind: "text-track-gold",
    icon: <Sparkles size={13} strokeWidth={1.5} />,
  },
  review: {
    box: "bg-diagnostic-steel/10 border border-diagnostic-steel/40",
    kind: "text-diagnostic-steel",
    icon: <Eye size={13} strokeWidth={1.5} />,
  },
  write: {
    box: "bg-asphalt border border-graphite-2",
    kind: "text-bone",
    icon: <FileCheck2 size={13} strokeWidth={1.5} />,
  },
};

function ProcessMaps() {
  return (
    <div className="flex flex-col gap-6 max-w-[1040px]">
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-bone-dim leading-relaxed max-w-[760px]">
          Each flow reads left to right: what you do, what Claude does, what you review, and exactly
          what gets written and audited. The same four beats every time — so you always know where
          the work ends up.
        </p>
        <Legend />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {flows.map((f) => (
          <FlowCard key={f.title} flow={f} />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const items: { tone: StepTone; label: string }[] = [
    { tone: "trigger", label: "You do" },
    { tone: "claude", label: "Claude / system" },
    { tone: "review", label: "You review" },
    { tone: "write", label: "Written + audited" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {items.map((it) => (
        <div key={it.tone} className="flex items-center gap-2">
          <span className={stepStyles[it.tone].kind}>{stepStyles[it.tone].icon}</span>
          <span className="label">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  return (
    <Card>
      <div className="px-5 pt-4 pb-3 flex items-start gap-3 border-b border-graphite">
        <span className="text-track-gold mt-0.5">{flow.icon}</span>
        <div className="flex flex-col gap-0.5">
          <span className="title-md text-[15px]">{flow.title}</span>
          <span className="text-[12px] text-bone-mute leading-snug">{flow.blurb}</span>
        </div>
      </div>
      <CardBody className="flex flex-col gap-2">
        {flow.steps.map((s, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Step step={s} />
            {i < flow.steps.length - 1 && (
              <div className="flex justify-center">
                <ArrowRight
                  size={14}
                  strokeWidth={1.5}
                  className="text-bone-mute rotate-90"
                />
              </div>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function Step({ step }: { step: FlowStep }) {
  const sty = stepStyles[step.tone];
  return (
    <div
      className={"flex items-start gap-3 px-3.5 py-2.5 rounded-[var(--radius)] " + sty.box}
    >
      <span className={"mt-0.5 shrink-0 " + sty.kind}>{sty.icon}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={"label text-[9px] " + sty.kind}>{step.kind}</span>
        <span className="text-[12px] text-bone leading-snug">{step.label}</span>
      </div>
    </div>
  );
}
