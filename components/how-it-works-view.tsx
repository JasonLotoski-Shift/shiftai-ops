"use client";

import { useState, type ReactNode } from "react";
import { Card, CardBody, Label, Badge, Tabs } from "@/components/ui";
import { DealProcessMap } from "@/components/deal-process-map";
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
  FolderPlus,
  Mail,
  Search,
  Receipt,
  ListTodo,
  KanbanSquare,
  Flag,
  Calculator,
  Target,
  Presentation,
  Compass,
  Hammer,
  Activity,
  HelpCircle,
  Wrench,
  ClipboardCheck,
  Stamp,
  Map as MapIcon,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────
   How it works — the training manual. Four tabs, one walkthrough:
   1. Start here       — "you are here" phase walkthrough (Discovery → Build → Run),
                         each step a progressive-disclosure panel (why / what to do /
                         how it works / what everything does).
   2. The deal process — the racing-line track (folded in from the retired
                         /deal-process route), hover any step for the live panel.
   3. How it's built   — plain-English architecture (the original reference).
   4. What happens when I do X — the visual process maps for every flow.

   Brand tokens only (bitumen / asphalt / graphite / track-gold / bone /
   diagnostic-steel) so the whole manual re-themes for light mode. Motion is the
   shared fade-rise keyframe + the scale/shadow tricks proven on the track.
   ────────────────────────────────────────────────────────────────────── */

export function HowItWorksView() {
  const [tab, setTab] = useState("start");

  return (
    <div className="flex flex-col gap-8">
      <Tabs
        tabs={[
          { key: "start", label: "Start here" },
          { key: "process", label: "The deal process" },
          { key: "built", label: "How it's built" },
          { key: "flows", label: "What happens when I do X" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "start" && <StartHere onJump={setTab} />}
      {tab === "process" && <DealProcessSection />}
      {tab === "built" && <HowItsBuilt />}
      {tab === "flows" && <ProcessMaps />}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Tab — Start here. A guided "you are here" manual: the firm runs three
   phases after a deal signs — Discovery, Build, Run. Each phase opens to four
   panels (why it matters · what you do · how it works · what everything does).
   Progressive disclosure via an accordion using the fade-rise keyframe; the
   active phase node scales + lifts like the deal-process track nodes.
   Content sourced from skills/_firm/context.md (phases + voice), the deal
   STEPS data, lib/types.ts (real enums), and the SKILL.md files. Describes the
   CURRENT live model — Discovery → Build → Run. No Business-Model-v2 prose.
   ────────────────────────────────────────────────────────────────────── */

type PhasePanel = { heading: string; icon: ReactNode; body: ReactNode };

type Phase = {
  key: string;
  no: string;
  name: string;
  enumValue: string; // the real Project.phase value (lib/types.ts)
  icon: ReactNode;
  oneLine: string;
  panels: PhasePanel[];
};

const PHASES: Phase[] = [
  {
    key: "discovery",
    no: "01",
    name: "Discovery",
    enumValue: "discovery",
    icon: <Compass size={18} strokeWidth={1.5} />,
    oneLine: "Understand their world before anyone scopes or prices a thing.",
    panels: [
      {
        heading: "Why it matters",
        icon: <HelpCircle size={14} strokeWidth={1.5} />,
        body: (
          <p>
            An operator buys a system they helped design. Discovery earns that. You learn the pain,
            what it costs them per week, where they are with AI, and who decides. Get one concrete
            number. No scoping, no pricing here.
          </p>
        ),
      },
      {
        heading: "What you do",
        icon: <MousePointerClick size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi>Run the discovery call: let them describe their world first, listen more than you pitch.</PhaseLi>
            <PhaseLi>Send the same-day follow-up, then a questionnaire to fill the gaps the call missed.</PhaseLi>
            <PhaseLi>Walk the discovery report on the discussion call: their pain played back, the build as an idea, zero pricing.</PhaseLi>
            <PhaseLi>Close on a confirmed direction and the right to propose.</PhaseLi>
          </ul>
        ),
      },
      {
        heading: "How it works",
        icon: <Wrench size={14} strokeWidth={1.5} />,
        body: (
          <p>
            Each step has a one-click draft on the deal: <Mono>Discovery prep</Mono> (an internal
            brief), <Mono>Discovery questionnaire</Mono> (reads every file in the deal&apos;s Drive
            folder, becomes a live Tally form whose answers land back on the deal),{" "}
            <Mono>Follow-up email</Mono>, and <Mono>Discovery report</Mono> (a client-facing deck in
            their brand colors). Every draft is yours to edit; a <Mono>[NEEDS INPUT]</Mono> marker
            blocks the save until you fill a real fact in.
          </p>
        ),
      },
      {
        heading: "What everything does",
        icon: <ClipboardCheck size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi><b>Deal.</b> The opportunity in motion, sitting at the <Mono>discovery</Mono> / <Mono>discussion</Mono> stage on the board.</PhaseLi>
            <PhaseLi><b>People.</b> Link the contacts on the deal: how they connect, and their pull in the decision.</PhaseLi>
            <PhaseLi><b>Artifact.</b> Every saved draft files to the deal&apos;s Drive folder and shows on the deal; HTML documents open rendered in their own tab, and any document can be downloaded straight from the list.</PhaseLi>
            <PhaseLi><b>Interaction.</b> A logged call, the follow-up email, the meeting. The touch history.</PhaseLi>
          </ul>
        ),
      },
    ],
  },
  {
    key: "build",
    no: "02",
    name: "Build",
    enumValue: "build",
    icon: <Hammer size={18} strokeWidth={1.5} />,
    oneLine: "Scope a first sprint they can say yes to, sign it, and build the system.",
    panels: [
      {
        heading: "Why it matters",
        icon: <HelpCircle size={14} strokeWidth={1.5} />,
        body: (
          <p>
            One tool first, three months, real ROI. Small enough to say yes to, real enough to prove
            the model. The proposal confirms a direction already agreed; it doesn&apos;t pitch. Then
            the deal converts to a client and the engagement starts on day one, not week three.
          </p>
        ),
      },
      {
        heading: "What you do",
        icon: <MousePointerClick size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi>Estimate the contract value from hours-by-tier, build the prototype, then draft the scope and the deck.</PhaseLi>
            <PhaseLi>At the proposal stage, build the package in order: the clickable prototype, the scope of work, then the deck that renders it.</PhaseLi>
            <PhaseLi>Settle terms, draft the Statement of Work for counsel, then Convert to client when it&apos;s signed.</PhaseLi>
            <PhaseLi>Shape delivery: set the project type, break work into milestones, plan the billing.</PhaseLi>
          </ul>
        ),
      },
      {
        heading: "How it works",
        icon: <Wrench size={14} strokeWidth={1.5} />,
        body: (
          <p>
            <Mono>Build prototype</Mono> reads the discovery report and discussion notes to propose
            where to start, pre-selecting the clear winner (or asking you when it&apos;s a close call),
            then drafts a deeper brief that leads with the one &ldquo;magic moment&rdquo; interaction and
            names where visuals carry the value. You approve it, then it hands the brief to a builder
            that writes the prototype, screenshots it, clicks through the interaction to confirm it
            works, and improves it over a few rounds — opening in its own tab so the tool stays free.
            When it&apos;s done you can leave one note for a final pass, then approve. <Mono>Draft scope</Mono> then
            writes a high-level scope of work from the prototype — what we&apos;ll build, the foundation we set up
            first (environment, data and API connections, access), the phases, what the client owns, the timeline,
            and the fixed fee — which you edit and save. <Mono>Build deck</Mono> renders that approved scope plus
            the prototype into the client-facing deck the same way the prototype builds (drafts, screenshots, improves
            over a few rounds in its own tab), with a live Demo-prototype button. <Mono>Statement of Work</Mono> drafts a
            contract-grade Google Doc, stamped DRAFT for counsel, never signature-ready. <Mono>Convert to client</Mono>
            scaffolds the Drive folder, a starter project, a 50/25/25 schedule, and kickoff tasks; the
            deal&apos;s people and company profile carry across.
          </p>
        ),
      },
      {
        heading: "What everything does",
        icon: <ClipboardCheck size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi><b>Client.</b> The signed engagement: revenue, Drive folder, workspace path, primary contact.</PhaseLi>
            <PhaseLi><b>Project.</b> The work, at phase <Mono>build</Mono>. Project types: discovery-report, pilot-project, subscription, full-build, buyout.</PhaseLi>
            <PhaseLi><b>Milestone &amp; Task.</b> The delivery plan on the task board: milestones are cards, tasks live under them.</PhaseLi>
            <PhaseLi><b>Invoice &amp; billing schedule.</b> The installments that bill against the project value.</PhaseLi>
          </ul>
        ),
      },
    ],
  },
  {
    key: "run",
    no: "03",
    name: "Run",
    enumValue: "run",
    icon: <Activity size={18} strokeWidth={1.5} />,
    oneLine: "Operate the system alongside them, measure it, and leave them owning it.",
    panels: [
      {
        heading: "Why it matters",
        icon: <HelpCircle size={14} strokeWidth={1.5} />,
        body: (
          <p>
            The work compounds. We embed, we build, we measure, and the client owns reusable IP at
            the end. Run is where the system earns its keep: hours back every week, decisions and
            approvals moving faster, the proof that funds the next sprint.
          </p>
        ),
      },
      {
        heading: "What you do",
        icon: <MousePointerClick size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi>Track delivery on the project: milestones, tasks, hours, the timeline.</PhaseLi>
            <PhaseLi>Raise invoices off the billing schedule and track them to paid.</PhaseLi>
            <PhaseLi>Log every client call, email, and meeting through Ingest so nothing falls through.</PhaseLi>
            <PhaseLi>Open a follow-on engagement on the same client when there&apos;s more to build.</PhaseLi>
          </ul>
        ),
      },
      {
        heading: "How it works",
        icon: <Wrench size={14} strokeWidth={1.5} />,
        body: (
          <p>
            The project&apos;s Financials tab handles economics and the 10/15/75 split; the task board
            runs delivery. Meetings auto-log from Fireflies, client emails from a Gmail label, both
            landing on <Mono>Ingest</Mono> for your review. A follow-on is just{" "}
            <Mono>+ New project</Mono> on the client. Every channel round-trips a row into the
            database. If it isn&apos;t tracked, it didn&apos;t happen.
          </p>
        ),
      },
      {
        heading: "What everything does",
        icon: <ClipboardCheck size={14} strokeWidth={1.5} />,
        body: (
          <ul className="flex flex-col gap-1.5">
            <PhaseLi><b>Project.</b> Now at phase <Mono>run</Mono>, status on-track / at-risk / blocked / closing / closed.</PhaseLi>
            <PhaseLi><b>HoursEntry.</b> Time logged against the work, by hand or a Claude Code session hook.</PhaseLi>
            <PhaseLi><b>Invoice.</b> Draft, then sent, then paid, each carrying its real dates.</PhaseLi>
            <PhaseLi><b>AuditLog.</b> Every mutation, one row, never written without an actor. The diligence trail.</PhaseLi>
          </ul>
        ),
      },
    ],
  },
];

function StartHere({ onJump }: { onJump: (key: string) => void }) {
  const [open, setOpen] = useState<string | null>("discovery");

  return (
    <div className="flex flex-col gap-8 max-w-[920px]">
      {/* Intro */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="You are here" title="The manual: how the firm runs an engagement." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          This tool is the firm&apos;s system of record. Read it top to bottom once and you&apos;ll
          know the whole shape of the work: how a lead becomes a signed client, what every screen is
          for, and where each thing you do ends up.
        </p>
        <p className="text-[14px] text-bone-dim leading-relaxed">
          The firm runs three phases after a deal signs:{" "}
          <span className="text-bone">Discovery</span>, then{" "}
          <span className="text-bone">Build</span>, then <span className="text-bone">Run</span>.
          Plain English, no branded methodology. Open each one below. Every phase tells you why it
          matters, what you do, how the tool does its part, and what each record is for.
        </p>

        {/* The phase rail — three nodes; the open one lifts like a track node */}
        <div className="grid grid-cols-3 gap-3">
          {PHASES.map((p) => {
            const active = open === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setOpen(active ? null : p.key)}
                className={
                  "group text-left flex flex-col gap-2 px-4 py-4 rounded-[var(--radius-lg)] border transition-all duration-200 focus-gold " +
                  (active
                    ? "bg-track-gold-dim/15 border-track-gold/50 scale-[1.02] shadow-[0_0_24px_rgba(201,169,97,0.18)]"
                    : "bg-asphalt border-graphite hover:border-track-gold/40 hover:scale-[1.01]")
                }
              >
                <div className="flex items-center justify-between">
                  <span className={active ? "text-track-gold" : "text-bone-dim group-hover:text-bone"}>
                    {p.icon}
                  </span>
                  <span className="mono text-[11px] tabular-nums text-bone-mute">{p.no}</span>
                </div>
                <span className={"title-md text-[15px] " + (active ? "text-track-gold" : "text-bone")}>
                  {p.name}
                </span>
                <span className="text-[11.5px] text-bone-mute leading-snug">{p.oneLine}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* The open phase's four panels — fade-rise on swap */}
      {PHASES.map((p) =>
        open === p.key ? (
          <section key={p.key} className="fade-rise flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="text-track-gold">{p.icon}</span>
              <span className="title-lg">
                Phase {p.no} · {p.name}
              </span>
              <span className="mono text-[10px] uppercase tracking-wide text-bone-dim border hairline rounded-[var(--radius-pill)] px-2 py-0.5">
                Project phase · {p.enumValue}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {p.panels.map((panel) => (
                <PhasePanelCard key={panel.heading} panel={panel} />
              ))}
            </div>
          </section>
        ) : null,
      )}

      {/* Where the deal lives before any of this */}
      <Card className="border border-track-gold/40 bg-track-gold-dim/5">
        <CardBody className="flex items-start gap-3">
          <GitBranch size={16} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
          <p className="text-[13px] text-bone leading-relaxed">
            Before Discovery there&apos;s the pipeline: finding the lead and earning each
            conversation up to a signed deal.{" "}
            <button
              type="button"
              onClick={() => onJump("process")}
              className="text-track-gold underline underline-offset-2 hover:text-bone transition-colors"
            >
              See the deal process
            </button>{" "}
            for the full road, or{" "}
            <button
              type="button"
              onClick={() => onJump("flows")}
              className="text-track-gold underline underline-offset-2 hover:text-bone transition-colors"
            >
              what happens when I do X
            </button>{" "}
            for the step-by-step on any single action.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function PhaseLi({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px] text-bone-dim leading-snug">
      <span className="w-1 h-1 rounded-full bg-track-gold mt-[7px] shrink-0" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="mono text-[11.5px] text-bone">{children}</span>;
}

function PhasePanelCard({ panel }: { panel: PhasePanel }) {
  return (
    <Card className="transition-shadow hover:shadow-[var(--shadow)]">
      <CardBody className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="text-track-gold">{panel.icon}</span>
          <Label gold>{panel.heading}</Label>
        </div>
        <div className="text-[13px] text-bone-dim leading-relaxed [&_b]:text-bone [&_b]:font-medium">
          {panel.body}
        </div>
      </CardBody>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Tab — The deal process. The racing-line track, folded in from the retired
   /deal-process route. The DealProcessMap component owns the STEPS data + the
   hover-to-expand panel; this just frames it inside the manual.
   ────────────────────────────────────────────────────────────────────── */

function DealProcessSection() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 max-w-[760px]">
        <SectionTitle eyebrow="The road to signed" title="The deal process, as a racing line." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Before an engagement starts, a deal runs the same line every time: find the lead, earn each
          conversation, and only talk money once the direction is already agreed. Three client
          meetings (Discovery, Discussion, Proposal) and the work between them wins the deal. Hover
          any step on the track to see what it&apos;s for and which part of this tool does the work.
        </p>
        <div className="flex items-center gap-2 text-bone-mute">
          <MapIcon size={13} strokeWidth={1.5} />
          <span className="label text-[9px]">Hover a step: the panel on the right is the live layer</span>
        </div>
      </section>

      <DealProcessMap />
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
          Files live in a single Google Shared Drive — one folder per client, and one per deal
          under <span className="text-bone">00-Pipeline</span> for docs made before the win (the
          folder moves into the client&apos;s on convert). Claude shows up in three spots:{" "}
          <span className="text-bone">Quick Actions</span> inside the tool,{" "}
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

      {/* The architecture map */}
      <section className="flex flex-col gap-4">
        <SectionTitle eyebrow="See the whole thing" title="The architecture map." />
        <p className="text-[14px] text-bone-dim leading-relaxed">
          Everything above — the data model, the four channels, where Claude shows up — is also a
          live map you can open. The <span className="text-bone">Architecture</span> tab (in the
          sidebar, under Other) puts the whole firm on one canvas: every zone, who owns each part
          (gold = Shift owns the IP, steel = the client owns it, grey = bought-in), and the rules
          that keep one client&apos;s data from ever reaching another. Click any box with a{" "}
          <span className="mono text-bone">＋</span> to open it and drill in; click a connection to
          jump to its other end. Every card also has a <span className="text-bone">Team notes</span>{" "}
          section, so anyone can leave context for the rest of the firm right on the map.
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
    icon: <Target size={16} strokeWidth={1.5} />,
    title: "Hunt for new leads",
    blurb: "Define who you want, run the search, then review the companies the agent found. The search casts wide and free, ranks the pool by signals, then digs deep on the best.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Import → AI Targeting → build a segment (who you want), pick Reveal emails: Primary only or All contacts" },
      { tone: "trigger", kind: "You do", label: "Hit Run search on the segment — it works for up to ~3.5 min (the card shows \"Searching…\")" },
      { tone: "claude", kind: "Claude", label: "Stage 1 (free): pulls a wide pool (up to 150 matching companies), skips any already in your contacts or pipeline, and ranks it — headcount growth first, revenue-in-band breaks ties" },
      { tone: "claude", kind: "Claude", label: "Stage 2 (deep): on the top ~40 only, scrapes the site for buying signals, finds people, and rates fit 1–10 — revealing the best contact's email only when the lead clears the bar (score ≥ 6)" },
      { tone: "claude", kind: "Claude", label: "Optimized a segment? It also re-judges companies it previously filtered (never reviewed) against the new criteria — rescuing good leads that just missed before" },
      { tone: "review", kind: "You review", label: "Open a lead → Enrich builds the full company picture (web-sourced: description, systems, pain points, key facts) plus a \"how we'd sell to them\" view — what they likely need and the angle to open with. Then claim it (or assign a partner), Reveal email on any contact (1 Apollo credit), draft a cold intro, or add to the funnel. Restoring a filtered lead reveals its best contact's email too" },
      { tone: "review", kind: "You review", label: "Need more targets? Find more people searches Apollo for decision-makers and scrapes the company's team/about pages — adds everyone net-new with their title (and LinkedIn where shown), and tells you how many contacts you already have there. No credits spent; reveal each email on demand" },
      { tone: "review", kind: "You review", label: "Sent a cold email? File it — Sent → add to pipeline puts it on the board now; Sent → cold funnel parks it in the Cold email sent tab until they reply (Replied → funnel opens a deal at Qualified; No reply sets it aside)" },
      { tone: "write", kind: "Saved", label: "Leads + reveals + claims + AuditLog; the run shows new + rescued + filtered and ~how many companies are left to explore; the Apollo-credits meter tracks emails revealed this month" },
    ],
  },
  {
    icon: <Calculator size={16} strokeWidth={1.5} />,
    title: "Record who sourced a deal (commission)",
    blurb: "Note up to two people who get a cut for bringing in a deal — a partner or an outside referrer — and the commission carries through to the project and any recurring service contract when the deal converts. Managing partners only.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On a deal, open Deal-source commission → add up to two payees: a partner or a typed external name, each 1–10%, on the deal value or the total 6/12-month value" },
      { tone: "claude", kind: "On convert", label: "When you Convert → Client, each commission snapshots onto the build project (the one-time build slice). If it's a subscription with a 6/12-month base, an On-going Service Contract is created with a future start date and a month-by-month commission ledger" },
      { tone: "review", kind: "You review", label: "If a deal converted without a commission set, add it on the project's Financials tab. The recurring side lives on the Service Contracts tab (under Projects); mark each month paid as it comes due" },
      { tone: "write", kind: "Saved", label: "DealSourceCommission / ProjectSourceCommission / ServiceContract + per-month accruals + AuditLog. Financials shows the firm-wide commission line and per-partner economics — managing partners only" },
    ],
  },
  {
    icon: <FileUp size={16} strokeWidth={1.5} />,
    title: "Import contacts & scan for fit",
    blurb: "Upload a contact export, scan it against your criteria, and push the best into the pipeline.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Import → Contacts → upload a CSV (LinkedIn / Google / any export) into your PRIVATE master list" },
      { tone: "trigger", kind: "You do", label: "New scan → set the criteria (industries, size, revenue, location, keywords), seeded from a segment + editable" },
      { tone: "claude", kind: "Claude", label: "Rates every contact 1–10 against the criteria — decision-maker, connector, or no fit — saved as its own report tab" },
      { tone: "review", kind: "You review", label: "Open the report, tick the strong ones (name-only set aside) → Add to Pipeline Leads. Delete reports/contacts anytime" },
      { tone: "write", kind: "Saved", label: "Picks become firm-wide Promoted Leads; Enrich runs Apollo + Firecrawl and builds the company picture + \"how we'd sell to them\" view (same as AI Found leads), then add to the funnel — the profile carries onto the deal + AuditLog" },
    ],
  },
  {
    icon: <Mic size={16} strokeWidth={1.5} />,
    title: "Ingest anything",
    blurb: "One place to log a meeting, email, or document and update the right records.",
    steps: [
      { tone: "trigger", kind: "You do", label: "+ Ingest → pick type, target records, paste content/email/files" },
      { tone: "claude", kind: "Claude", label: "Proposes updates across contact, client, project, deal — incl. overwrites, new people it spotted, and how they connect to the deal or client" },
      { tone: "review", kind: "You review", label: "Approve each addition; every overwrite shows old → new. Tasks start unchecked — tick the ones worth keeping (or add one from a key point); an unmatched owner stays unassigned instead of landing on you. People + links wait in the same queue" },
      { tone: "write", kind: "Saved", label: "Records updated + Contacts/links + Interaction/Tasks/Milestones + AuditLog. The full email/meeting text is saved to the record and shows on the client/deal Timeline tab (expand any entry to read the original words). A copy of any uploaded files/screenshots also lands in the Drive folder, and screenshots feed the discovery report + prototype as visual input" },
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
    icon: <Mail size={16} strokeWidth={1.5} />,
    title: "Log client emails from Gmail",
    blurb: "Label a client thread in Gmail and it lands on Ingest for review — your inbox stays private.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Settings → Connect Gmail (once), then label any client thread “ops-log”" },
      { tone: "claude", kind: "Claude", label: "Every 6 hours (or hit “Check Gmail” on Ingest to run it now): reads only labeled threads, matches the client/contact/deal — and the project — by email, company domain, and who's on the thread (no longer gives up on multi-party threads), drafts a summary + action items" },
      { tone: "review", kind: "You review", label: "One labeled thread is ONE growing card — replies append to it (and re-summarize the whole conversation) instead of stacking up as separate items. Approve like a meeting" },
      { tone: "write", kind: "Saved", label: "Logs a sent/received email Interaction with the full body (readable on the Timeline) + Tasks/enrichment + AuditLog; never reads unlabeled mail" },
    ],
  },
  {
    icon: <Mic size={16} strokeWidth={1.5} />,
    title: "Log meetings from Fireflies",
    blurb: "Record a client call in Fireflies; titled ones land on Ingest for review.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Record the call in Fireflies with “Shift” in the meeting title" },
      { tone: "claude", kind: "Claude", label: "When the transcript is ready (and a 6-hourly sweep, or “Check Fireflies” on Ingest, catches any you renamed later): matches the client/contact, drafts a summary + action items" },
      { tone: "review", kind: "You review", label: "Approve on Ingest like any meeting; internal-only or untitled calls are skipped" },
      { tone: "write", kind: "Saved", label: "Logs a meeting Interaction + files the transcript to Drive + Tasks/enrichment + AuditLog" },
    ],
  },
  {
    icon: <ListTodo size={16} strokeWidth={1.5} />,
    title: "Work a deal through the stages",
    blurb: "Each stage from Discovery Call to Proposal has a one-click draft, reviewed before it leaves.",
    steps: [
      { tone: "trigger", kind: "You do", label: "The deal's actions are laid out as numbered steps — Discovery, Prototype, Proposal. In Discovery: Discovery prep · Discovery questionnaire · Discovery report · Follow-up email · Book meeting. Every action has an (i) you can hover to see what it does and what happens when you run it" },
      { tone: "claude", kind: "Claude", label: "Drafts from the deal's history — internal prep or a follow-up. The questionnaire goes deeper: it reads every file in the deal's Drive folder (transcripts, notes) and becomes a live Tally form whose answers land back on the deal. The discovery report (below) is its own one-click draft too" },
      { tone: "review", kind: "You review", label: "Edit freely; [NEEDS INPUT] blocks save until you fill real facts in" },
      { tone: "write", kind: "Saved", label: "Filed to Drive + an Artifact on the deal (a sent email also logs an interaction)" },
    ],
  },
  {
    icon: <Sparkles size={16} strokeWidth={1.5} />,
    title: "Build the proposal package",
    blurb: "At the Proposal stage, in order: the interactive prototype, the scope of work built from it, then the deck that renders the scope.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On the deal, step by step: Build prototype (pick where to start, optional steer) → review the brief → build (opens in its own tab) → leave one note → approve. Then Draft scope (review/edit the scope of work) → save. Then Build deck (waits until both a prototype and a scope exist)" },
      { tone: "claude", kind: "Claude", label: "Prototype: proposes where to start, drafts a brief you edit, then a builder writes the multi-tab prototype, screenshots it, confirms the interaction works, and improves it over a few rounds (one partner note → one more pass). Scope: reads the prototype + deal history and writes a high-level scope of work — what we'll build, the foundation we set up first (environment, data and API connections, access), phases, what the client owns, timeline, fixed fee. Deck: renders the approved scope + the prototype into a client-facing HTML deck the same way the prototype builds (draft → screenshot → improve, a few rounds), with a live Demo-prototype button" },
      { tone: "review", kind: "You review", label: "Approve/edit the brief; edit the scope (it won't save while it's guessing a fee or date — those show as [NEEDS INPUT]); then in the run tab watch the deck's rounds stream — leave a note for one final pass, or Approve" },
      { tone: "write", kind: "Saved", label: "Each round's HTML + screenshot to Supabase Storage; the prototype to a Prototype folder + an Artifact; the scope of work to the deal folder as a Markdown Artifact; the deck to the deal folder as an Artifact (each approved on your sign-off)" },
    ],
  },
  {
    icon: <Presentation size={16} strokeWidth={1.5} />,
    title: "Draft a discovery report",
    blurb: "After discovery, a client-facing deck that plays back the findings, lays out the build as an idea, and confirms the value. Works from the questionnaire answers when they're in, or from the call and your research when they're not. Rendered in the client's brand colors when we have them.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On a deal or a client → Discovery report · add the time-back number and the two outcomes (and any framing)" },
      { tone: "claude", kind: "Claude", label: "Uses the questionnaire answers when present; otherwise reads the deal's whole Drive folder (call transcripts, notes, research) for a best-guess grounded in what was actually said. Builds a light-mode HTML deck: Shift type + layout, the client's accent colors; no pricing (that's the proposal)" },
      { tone: "review", kind: "You review", label: "Preview in the browser, edit the HTML; anything inferred is labelled estimated and [NEEDS INPUT] blocks save until the number + outcomes are real" },
      { tone: "write", kind: "Saved", label: "Filed to Drive as a .html + an Artifact on the deal (or client)" },
    ],
  },
  {
    icon: <FileCheck2 size={16} strokeWidth={1.5} />,
    title: "Draft a Statement of Work",
    blurb: "After the proposal is accepted, a contract-grade SOW draft as a Google Doc for you and counsel to redline. Never signature-ready.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Client → Statement of Work · give the agreed terms (fee, subscription, buy-out, dates, deployment)" },
      { tone: "claude", kind: "Claude", label: "Drafts scope + acceptance, the commercial terms, and the firm's IP model; stamps DRAFT + [for counsel] markers" },
      { tone: "review", kind: "You review", label: "Preview, edit the source; [NEEDS INPUT] blocks save until every fee/party/date is real" },
      { tone: "write", kind: "Saved", label: "Filed to the client's Drive as a Google Doc + an Artifact; counsel redlines before signature" },
    ],
  },
  {
    icon: <Stamp size={16} strokeWidth={1.5} />,
    title: "Generate a contract",
    blurb: "The firm's standard agreement as an editable Google Doc: a Master Conditional Sale and Custom Software Development Agreement (the client buys the build, Shift keeps the Background IP). The legal terms are a fixed, counsel-approved BC template; only the parties, fees, dates, and the Schedule A scope are filled.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Deal or client → Generate contract · enter the parties, the build fee, the monthly Background IP licence fee, the payment schedule, and the effective date" },
      { tone: "claude", kind: "Claude", label: "Drafts Schedule A (the Deliverable) from the approved SOW, then fills the fixed BC template — conditional sale, Background IP, liability, privacy, escrow, governing law — around your numbers. The legal wording is not rewritten" },
      { tone: "review", kind: "You review", label: "Preview the contract, edit the source; [NEEDS INPUT] blocks save until every fee, party, and date is real (including Shift's own legal details in firm-party.ts)" },
      { tone: "write", kind: "Saved", label: "Filed to the client's Drive as an editable Google Doc + an Artifact. Open it to redline, fill the blank lines, and export to PDF" },
    ],
  },
  {
    icon: <UserPlus size={16} strokeWidth={1.5} />,
    title: "Map the people on a deal or client",
    blurb: "One company, many people — link contacts with how they're connected and their role in the decision.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Deal or Client → People → Link a contact · pick how they're connected (works there / introduced us / advisor)" },
      { tone: "trigger", kind: "You do", label: "If they shape the buying decision, set their role (decision-maker, champion, budget holder, gatekeeper…) · mark one person as the main contact" },
      { tone: "review", kind: "You review", label: "Ingest can propose people + links from emails and meetings — they wait in the same review queue until you approve" },
      { tone: "write", kind: "Saved", label: "The link + AuditLog · on convert, a deal's people carry over to the new client" },
    ],
  },
  {
    icon: <GitBranch size={16} strokeWidth={1.5} />,
    title: "Convert a deal to a client",
    blurb: "A signed deal becomes a live engagement with everything scaffolded.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Pipeline → Deal → Convert to client" },
      { tone: "claude", kind: "System", label: "Creates the Drive folder + starter Discovery project + 50/25/25 schedule; the deal's people, intro path, and company profile carry to the new client" },
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
    icon: <FolderPlus size={16} strokeWidth={1.5} />,
    title: "Open a follow-on engagement",
    blurb: "Each engagement is its own project — a subscription, a buy-out, or another build on a client you already have.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Client → + New project · pick the type (Subscription, Buy-out, Discovery, Pilot, Full Build), name it, set the value" },
      { tone: "claude", kind: "System", label: "Opens with the right billing: subscription → month 1; buy-out → one lump sum; build → 50/25/25" },
      { tone: "review", kind: "You review", label: "Subscription: Add next month when you bill it · Buy-out is exempt from the 10/15/75 split (all firm capture)" },
      { tone: "write", kind: "Saved", label: "Project + billing schedule + AuditLog" },
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
    blurb: "Two modes: tidy from what's logged, or look it up on the web. Works on contacts, clients — and now deals, which build the same company profile a client gets.",
    steps: [
      { tone: "trigger", kind: "You do", label: "On a contact, client, or deal → Enrich · pick records-only or web" },
      { tone: "claude", kind: "Claude", label: "Records-only reads logs · web searches with citations — for companies that includes socials, size, the systems they run, and pain points" },
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
      { tone: "review", kind: "You do", label: "Mark sent, then accepted — accepting locks the version and sets the deal's value to the total" },
      { tone: "write", kind: "Saved", label: "On win, the accepted estimate becomes the project's economics + AuditLog" },
    ],
  },
  {
    icon: <Receipt size={16} strokeWidth={1.5} />,
    title: "Raise, generate, or log an invoice",
    blurb: "Build an invoice off the engagement and track it to paid.",
    steps: [
      { tone: "trigger", kind: "You do", label: "Project → Raise invoice · pick a stage or amount + due date" },
      { tone: "claude", kind: "System", label: "The PDF button builds a formatted invoice on Shift letterhead and files it to Drive; or tick \"sent manually\" to just log it" },
      { tone: "review", kind: "You review", label: "Edit a draft's amount/due, mark Sent (pick the real send date) or Paid (the date it cleared) — back-date either" },
      { tone: "write", kind: "Saved", label: "Invoice (draft→sent→paid, with the sent date) + Artifact + change log + AuditLog" },
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
