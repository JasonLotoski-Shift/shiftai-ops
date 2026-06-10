"use client";

import { useState } from "react";
import {
  Radar,
  ListChecks,
  Phone,
  Send,
  Presentation,
  PenLine,
  HandCoins,
  FileSignature,
  Flag,
  LogIn,
  LogOut,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

// The deal process as a racing line: three sectors, three client meetings, and
// the work blocks between them. The track stays light on text — label + one
// tagline per step — and the sticky panel on the right is the "live" layer
// that expands whichever step the partner hovers (or taps / tabs to).

type StepTool = { name: string; where: string };

type Step = {
  key: string;
  kind: "phase" | "between" | "meeting" | "finish";
  sector?: string; // starts a new sector divider above this step
  icon: LucideIcon;
  meetingNo?: string; // "01" — meetings show the number, not the icon
  label: string;
  tagline: string;
  pills?: string[]; // the between-meeting actions, shown on the track
  stage?: string; // pipeline stage this step lives in
  goal: string;
  points: string[];
  tools: StepTool[];
  walkIn?: string; // meetings only — what you bring
  walkOut?: string; // meetings only — what you leave with
};

const STEPS: Step[] = [
  {
    key: "find",
    kind: "phase",
    sector: "Sector 01 · Find",
    icon: Radar,
    label: "Find the lead",
    tagline: "Intros · referrals · events · outbound · inbound",
    stage: "Lead",
    goal: "Get real operators into the pipeline — automotive, motorsport, engineering, construction.",
    points: [
      "Intros and referrals carry the most trust — capture them the moment they happen.",
      "AI Targeting finds and scores outbound lists against the firm's target segments.",
      "Anything that arrives as an email or transcript gets filed by Ingest, never lost.",
    ],
    tools: [
      { name: "Add contact", where: "Dashboard · Quick Actions" },
      { name: "Import contacts", where: "Import · Contacts" },
      { name: "AI Targeting", where: "Import · AI Targeting" },
      { name: "Ingest", where: "Import · Ingest" },
    ],
  },
  {
    key: "qualify",
    kind: "between",
    icon: ListChecks,
    label: "Qualify",
    tagline: "Is this worth a partner's hour?",
    pills: ["Enrich contact", "Lead rating", "Cold outreach"],
    stage: "Qualified",
    goal: "Decide the lead is real before anyone books a call — fit, size, and a reason to talk now.",
    points: [
      "Enrich the record from the web so the first conversation starts informed.",
      "Rate the lead against the firm's target segments.",
      "First touch: a cold outreach or warm intro email, drafted from what we actually know.",
    ],
    tools: [
      { name: "Enrich from web", where: "Contact page · Actions" },
      { name: "Lead rating", where: "AI Targeting" },
      { name: "Cold outreach", where: "AI Targeting" },
      { name: "Draft email", where: "Contact page · Actions" },
    ],
  },
  {
    key: "discovery",
    kind: "meeting",
    sector: "Sector 02 · Earn the proposal",
    icon: Phone,
    meetingNo: "01",
    label: "Discovery Call",
    tagline: "Get to know them. Qualify hard.",
    stage: "Discovery",
    goal: "Understand their world — the pain, what it costs them, where they are with AI, and who decides. No scoping, no pricing.",
    points: [
      "Listen more than pitch; make it about them.",
      "Get one concrete number — what the pain costs per week.",
      "Confirm who decides and how.",
      "Close on the next step: book the discussion call.",
    ],
    tools: [
      { name: "Discovery prep (internal brief)", where: "Deal page · Actions" },
      { name: "Ingest the transcript", where: "Import · Ingest" },
    ],
    walkIn: "An internal prep brief — who they are, the questions that qualify, the ask to land.",
    walkOut: "A booked discussion call.",
  },
  {
    key: "follow-through",
    kind: "between",
    icon: Send,
    label: "Follow up + build the report",
    tagline: "Same-day follow-up · survey · the no-pricing deck",
    pills: ["Follow-up email", "Client survey", "Discovery report"],
    goal: "Turn what was heard into a Discovery Report that proves we understood — before any talk of money.",
    points: [
      "Same-day follow-up email: thank them, recap the one or two real things heard, propose the discussion call.",
      "A short survey fills the gaps the call didn't reach.",
      "The Discovery Report drafts the build idea in their brand — the use cases, in what order, why. No pricing.",
    ],
    tools: [
      { name: "Draft email", where: "Deal page · Actions" },
      { name: "Client survey", where: "Client page · Actions" },
      { name: "Discovery report", where: "Client page · Actions" },
    ],
  },
  {
    key: "discussion",
    kind: "meeting",
    icon: Presentation,
    meetingNo: "02",
    label: "Discussion Call",
    tagline: "Walk the report. Confirm the mark.",
    stage: "Discussion",
    goal: "Present the thinking as an idea they shape with us — \"does this hit the mark?\" — never \"do you want to buy?\". Earn the right to propose.",
    points: [
      "Replay their pain in their own words — show we listened.",
      "Surface one thing they hadn't thought of; the new insight earns trust.",
      "Let them shape the plan — an operator buys a system they helped design.",
      "The close confirms value, not the sale. Pricing waits.",
    ],
    tools: [
      { name: "Discovery report (the walkthrough)", where: "Client page · Actions" },
      { name: "Ingest the transcript", where: "Import · Ingest" },
    ],
    walkIn: "The Discovery Report — their pain played back, the build idea, zero pricing.",
    walkOut: "A confirmed direction — and the right to propose.",
  },
  {
    key: "scope",
    kind: "between",
    icon: PenLine,
    label: "Scope the first sprint",
    tagline: "One tool · three months · real ROI",
    pills: ["Draft proposal", "Proposal deck"],
    goal: "Turn the confirmed direction into a priced first sprint — small enough to say yes to, real enough to prove the model.",
    points: [
      "Scope from what they confirmed in the discussion call, not from scratch.",
      "Phased plan, success measures, fee, timeline.",
      "A deck version for when the proposal is presented in the room.",
    ],
    tools: [
      { name: "Draft proposal", where: "Deal page · Actions" },
      { name: "Proposal deck", where: "Deal page · Actions" },
    ],
  },
  {
    key: "proposal",
    kind: "meeting",
    icon: HandCoins,
    meetingNo: "03",
    label: "Proposal Call",
    tagline: "Pricing. Decision.",
    stage: "Proposal",
    goal: "Present the targeted first sprint and ask for the decision. The direction is already agreed — this confirms, it doesn't pitch.",
    points: [
      "One tool first; the ROI case carries it.",
      "Name the fee plainly — no apologizing for the number.",
      "Ask for the decision in the room.",
    ],
    tools: [
      { name: "Proposal deck", where: "Deal page · Actions" },
      { name: "Move the stage", where: "Pipeline board" },
    ],
    walkIn: "The proposal — scope, timeline, fee.",
    walkOut: "A yes — or the exact terms to negotiate.",
  },
  {
    key: "close",
    kind: "between",
    sector: "Sector 03 · Close",
    icon: FileSignature,
    label: "Negotiate + paper it",
    tagline: "Terms settled → contract-grade SOW",
    pills: ["Negotiate", "SOW draft"],
    stage: "Negotiation",
    goal: "Settle the terms and get a contract-grade Statement of Work in front of counsel — fast, while the yes is warm.",
    points: [
      "Negotiate from the proposal, not a blank page.",
      "The SOW drafts as a Google Doc for partner + counsel redlining — never signature-ready on its own.",
    ],
    tools: [{ name: "Statement of Work", where: "Client page · Actions" }],
  },
  {
    key: "signed",
    kind: "finish",
    icon: Flag,
    label: "Signed",
    tagline: "Deal becomes client · build kicks off",
    stage: "Signed",
    goal: "The deal converts to a client with a project — and the engagement starts on day one, not week three.",
    points: [
      "Convert the deal — it creates the client and the first project.",
      "Onboard: Drive folder, workspace, the kickoff plan.",
    ],
    tools: [
      { name: "Convert deal", where: "Deal page" },
      { name: "Onboard client", where: "Client page · Actions" },
    ],
  },
];

// Tiny checkered chip for the finish step — the one allowed racing flourish.
const CHECKER_STYLE = {
  backgroundImage:
    "repeating-conic-gradient(var(--color-bone) 0% 25%, var(--color-bitumen) 0% 50%)",
  backgroundSize: "8px 8px",
} as const;

function TrackNode({ step, active }: { step: Step; active: boolean }) {
  const Icon = step.icon;
  if (step.kind === "meeting") {
    return (
      <div
        className={cn(
          "w-14 h-14 rounded-[var(--radius-pill)] border-2 flex items-center justify-center mono text-[15px] transition-all duration-200",
          active
            ? "border-track-gold bg-track-gold text-ink scale-110 shadow-[0_0_28px_rgba(201,169,97,0.35)]"
            : "border-track-gold/60 bg-asphalt text-track-gold group-hover:border-track-gold",
        )}
      >
        {step.meetingNo}
      </div>
    );
  }
  const finish = step.kind === "finish";
  return (
    <div
      className={cn(
        "rounded-[var(--radius-pill)] border flex items-center justify-center transition-all duration-200",
        finish ? "w-11 h-11" : "w-9 h-9",
        active
          ? "border-track-gold bg-track-gold text-ink scale-110 shadow-[0_0_20px_rgba(201,169,97,0.3)]"
          : "border-graphite-2 bg-asphalt text-bone-dim group-hover:border-track-gold/60 group-hover:text-bone",
      )}
    >
      <Icon size={finish ? 17 : 14} strokeWidth={1.5} />
    </div>
  );
}

function DetailPanel({ step }: { step: Step | null }) {
  if (!step) {
    return (
      <div className="fade-rise bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow)] p-6">
        <span className="label-gold">The road to signed</span>
        <h2 className="title-lg mt-2">Three meetings. The work between them wins the deal.</h2>
        <p className="text-[13px] text-bone-dim leading-relaxed mt-3">
          Every deal runs the same line: find the lead, earn each conversation, and only talk
          money once the direction is already agreed. Hover any step on the track to see what
          it&apos;s for — and which part of this tool does the work.
        </p>
        <div className="flex items-center gap-4 mt-5 pt-4 border-t hairline">
          <div>
            <div className="mono text-[18px] text-track-gold">3</div>
            <div className="label text-[9px]">Client meetings</div>
          </div>
          <div>
            <div className="mono text-[18px] text-track-gold">5</div>
            <div className="label text-[9px]">Work blocks</div>
          </div>
          <div>
            <div className="mono text-[18px] text-track-gold">1</div>
            <div className="label text-[9px]">Decision</div>
          </div>
        </div>
      </div>
    );
  }

  const eyebrow =
    step.kind === "meeting"
      ? `Client meeting · ${step.meetingNo}`
      : step.kind === "between"
        ? "Between meetings"
        : step.kind === "finish"
          ? "The finish line"
          : "Top of the funnel";

  return (
    <div key={step.key} className="fade-rise bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow)] p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="label-gold">{eyebrow}</span>
        {step.stage && (
          <span className="mono text-[10px] uppercase tracking-wide text-bone-dim border hairline rounded-[var(--radius-pill)] px-2 py-0.5">
            Stage · {step.stage}
          </span>
        )}
      </div>
      <h2 className="title-lg mt-2">{step.label}</h2>
      <p className="text-[13px] text-bone-dim leading-relaxed mt-2">{step.goal}</p>

      {(step.walkIn || step.walkOut) && (
        <div className="mt-4 flex flex-col gap-2">
          {step.walkIn && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--radius)] bg-bitumen/60">
              <LogIn size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
              <p className="text-[12px] text-bone-dim leading-snug">
                <span className="text-bone">Walk in with:</span> {step.walkIn}
              </p>
            </div>
          )}
          {step.walkOut && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--radius)] bg-bitumen/60">
              <LogOut size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
              <p className="text-[12px] text-bone-dim leading-snug">
                <span className="text-bone">Walk out with:</span> {step.walkOut}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <span className="label text-[9px]">What happens</span>
        <ul className="mt-2 flex flex-col gap-1.5">
          {step.points.map((p) => (
            <li key={p} className="flex items-start gap-2 text-[12.5px] text-bone-dim leading-snug">
              <span className="w-1 h-1 rounded-full bg-track-gold mt-[7px] shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 pt-4 border-t hairline">
        <span className="label text-[9px]">In this tool</span>
        <ul className="mt-2 flex flex-col gap-1.5">
          {step.tools.map((t) => (
            <li key={t.name} className="flex items-center gap-2.5 text-[12.5px]">
              <Wrench size={12} strokeWidth={1.5} className="text-track-gold shrink-0" />
              <span className="text-bone">{t.name}</span>
              <span className="mono text-[10px] uppercase tracking-wide text-bone-mute ml-auto text-right">
                {t.where}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DealProcessMap() {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = STEPS.find((s) => s.key === activeKey) ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8 items-start">
      {/* The track */}
      <div className="relative">
        {/* The racing line — runs through the node centers, builds to gold at the finish */}
        <div
          aria-hidden
          className="absolute left-8 top-7 bottom-7 w-px bg-gradient-to-b from-graphite via-track-gold-dim/70 to-track-gold"
        />

        <div className="relative flex flex-col">
          {STEPS.map((step) => {
            const isActive = activeKey === step.key;
            return (
              <div key={step.key}>
                {step.sector && (
                  <div className={cn("pl-21", step.key !== STEPS[0].key && "pt-6")}>
                    <span className="label">— {step.sector}</span>
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveKey(step.key)}
                  onFocus={() => setActiveKey(step.key)}
                  onClick={() => setActiveKey(step.key)}
                  className={cn(
                    "group w-full text-left flex items-center gap-5 focus-gold rounded-[var(--radius)]",
                    step.kind === "meeting" ? "py-5" : "py-3.5",
                  )}
                >
                  <div className="w-16 shrink-0 flex justify-center">
                    <TrackNode step={step} active={isActive} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        className={cn(
                          "transition-colors",
                          step.kind === "meeting" ? "title-md" : "text-[13.5px] font-medium",
                          isActive ? "text-track-gold" : "text-bone",
                        )}
                      >
                        {step.label}
                      </span>
                      {step.kind === "finish" && (
                        <span aria-hidden className="inline-block w-10 h-2.5 rounded-[2px]" style={CHECKER_STYLE} />
                      )}
                    </div>
                    <p className="text-[11.5px] text-bone-mute mt-0.5">{step.tagline}</p>
                    {step.pills && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {step.pills.map((p) => (
                          <span
                            key={p}
                            className={cn(
                              "mono text-[10px] uppercase tracking-wide rounded-[var(--radius-pill)] border px-2 py-0.5 transition-colors",
                              isActive
                                ? "border-track-gold/50 text-track-gold"
                                : "border-graphite text-bone-dim group-hover:text-bone",
                            )}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* The live panel */}
      <aside className="lg:sticky lg:top-6">
        <DetailPanel step={active} />
      </aside>
    </div>
  );
}
