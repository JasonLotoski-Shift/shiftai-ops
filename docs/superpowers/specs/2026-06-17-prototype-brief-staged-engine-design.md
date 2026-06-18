# Prototype Brief — Staged Engine (Phase 1)

> **Status:** Design approved 2026-06-17. **Implementation deferred** until the current
> prototype-agent (build worker, `feat/prototype-worker-phase-c`) work lands, so the staged
> brief and the build loop go live together.
>
> **Scope:** Phase 1 only — a no-new-infra refactor of how the prototype brief is generated.
> Phase 2 (workflow video) is explicitly out of scope and provisional (see end).

---

## Problem

The prototype brief is the **bridge** between everything the firm learns about a client and the
autonomous build loop that turns that into an interactive HTML prototype. The build side is rich
and agentic (the worker runs an Agent SDK build⇄critique loop with eyes/gate/library tools, round
after round). The brief side — the step that actually decides *what to solve and how good it
should feel* — is the least agentic step in the whole pipeline: a **single one-shot
`generate({skill: "prototype-brief"})` call** in
[`app/(app)/pipeline/[id]/proposal-engine.ts`](../../../app/(app)/pipeline/[id]/proposal-engine.ts).

That single call summarizes the corpus instead of designing a solution. The result:

- **Bland prototypes.** Features without a magic moment, no visual centerpiece, generic enough that
  they don't feel built for *this* client.
- **Underused visuals.** The brief lists one interaction; nothing forces it to decide *where*
  visuals should carry the value, so the build defaults to flat forms and tables.
- **Thin intake.** The partner steers with a single sentence typed into a blank box. A one-liner
  can't carry the context, so Stage 1 either ignores it or over-weights it. Garbage-in bounds
  garbage-out, no matter how good the engine gets.

The intelligence is in the wrong place: the build loop thinks hard, the brief does not.

## Pipeline context (corrected terminology)

The firm's real sequence:

1. **Discovery report** is produced (the `discovery-report` skill → a client-facing HTML deck).
   Its "Our thinking" section lists the candidate **modules** (5–6 things we could build), each
   already carrying its pain and ROI rationale. This *is* the candidate shortlist, dressed as
   modules. Example: `pilot-petroleum-discovery-report.html` lists Module 01 (AI Dispatch +
   Runout Prediction) through Module 05 (Fleet Maintenance) plus a noted Customer Database. The
   report already leans at the winner — for Pilot, Module 01 is the cover headline, the day-one
   metric, and the top client quote.
2. The report is taken into the **discussion call**, where the field is narrowed to a **winner** —
   "a starting point of where a fix is needed most." That decision lands in the **discussion-call
   meeting notes**, not as separate structured data.
3. The **brief** is generated for that winner.
4. The autonomous **build loop** turns the approved brief into `prototype.html`.

So by brief time the *target is already chosen*. This is not a "what to build" problem; it's a
**"how good and how tailored"** problem.

## Quality target — the weighted rubric

What "revolutionary, not bland" means for a Shift prototype, in priority order. This rubric is the
scoring target for Stage 2.

1. **The magic moment** *(leads)* — one interaction where AI visibly does the hard thing the client
   hates (routes the job, flags runout risk, drafts the reply) and the value lands in a single
   click. A direction with features but no magic moment **fails**, however polished.
2. **"That's exactly my world"** — so specifically theirs (their roles, their data, their workflow,
   their words) that it reads as custom-built, not a template.
3. **Visual spectacle** — it *looks* like a real, premium product: live dashboards, maps, animated
   state, density that feels like software they'd pay for.

All three are required; they are weighted in this order when trading off.

---

## Engine — Stage 0 + three chained calls (no new infra)

Replace the single `generate()` call with a partner-facing **Stage 0 kickoff** plus **three chained
`generate()` calls**, all inside the existing server action. No Railway, no Agent SDK, no new
deploy — the chained calls reuse the existing `lib/ai.ts` `generate()` helper. Each stage is its own
skill file so each call runs with **fresh context**, which is what produces the depth (a draft
isn't anchored by the reasoning that produced it; the red-team isn't anchored to defend the draft).

```
Click "Build prototype"
  └─ Stage 0  Kickoff proposal           reads discovery-report modules + discussion-call notes
       │                                  → pre-selects the winner, alternates ranked   ◄── PARTNER confirms/edits
       ├─ Stage 1  prototype-brief-directions   interpret corpus → signal + 2-3 ambitious directions   (internal)
       ├─ Stage 2  prototype-brief-redteam       fresh-context attack vs rubric → pick + sharpen winner (internal)
       └─ Stage 3  prototype-brief               commit the final reviewable brief        ◄── PARTNER reviews/edits
```

Two partner touchpoints, both strong: **steer at the front** (from a grounded, pre-filled proposal,
not a blank box) and **edit at the back** (the final brief). The directions and red-team stay
**internal** for v1 (not surfaced to the partner) — easy to expose later if trust/auditability
warrants it.

**Superpowers lineage** (the methodology being mined and harnessed):

- Stage 1 ≈ `superpowers:brainstorming` — diverge into candidate directions before converging.
- Stage 2 ≈ `red-team` / `doubt-driven-development` — adversarial, fresh-context pressure-test.
- Stage 3 ≈ `superpowers:writing-plans` — commit a detailed, executable plan the build can't water down.

### Stage 0 — Kickoff proposal (partner-facing)

**Inputs:** the deal's discovery report (the module shortlist) + the discussion-call meeting notes
(both already in the deal corpus the action assembles).

**Behavior:** reconcile the two sources — read the modules, read which one the discussion call
converged on, and **pre-select that winner**. Present the modules as a ranked shortlist with the
winner pre-selected; each option shows the pain it solves and its one-line rationale, pulled from
the report. The partner confirms in one click, picks a different module, and may add an optional
steer note (a nuance, a constraint, a "lean into X").

**Output:** a robust, grounded seed object — the selected target (its module title, the pain it
solves, the rationale from the report) plus the optional steer. This replaces the one-sentence box.

**UI shape:** a pre-filled picker (winner pre-selected, alternates listed) with an optional steer
textarea. No blank prompt box; no AI guessing the target — Stage 0 reads the firm's own decision
back to the partner.

### Stage 1 — Interpret & diverge (`prototype-brief-directions`, internal)

**Inputs:** the confirmed Stage 0 seed + the full corpus + screenshots (vision).

**Behavior:** two moves in one call, interpret first then diverge.

- **Interpret** the meeting ingest into a structured signal: the target pain in the client's
  **exact words** (quoted), the real day-to-day workflow step by step, who the user is, the data
  shape from their screenshots, and where the client themselves said AI fits.
- **Diverge** into **2–3 ambitious solution directions** for the chosen target. Each direction is
  *forced* to name (a) its **magic moment**, (b) its **visual centerpiece**, (c) why a buyer leans
  in. Feature-list-only directions are disallowed by the prompt.

**Output:** the signal sheet + 2–3 directions, structured for Stage 2 to score.

### Stage 2 — Red-team & select (`prototype-brief-redteam`, internal)

**Inputs:** the directions + signal sheet + the weighted rubric.

**Behavior:** fresh context, adapting the red-team skill's assumption-attacking. Score each
direction against the rubric — **magic moment (lead) → "exactly my world" → visual spectacle**.
Kill any that's generic, safe, or has no visual payoff. Pick the survivor and **sharpen** it
(tighten the magic moment, name the exact visual, ground it harder in their world). Fresh context
is the point: this call is not invested in defending the draft.

**Output:** the winning direction, sharpened, with its rubric scores.

### Stage 3 — Commit (`prototype-brief`, rewritten, partner-facing)

**Inputs:** the winning direction + signal sheet.

**Behavior:** write the final reviewable brief. Keeps the skill name `prototype-brief` so
`Artifact.generatedFromSkill: "prototype-brief"`, the audit action, and the saved-artifact flow in
`saveBrief` / `startPrototypeBuild` are **unchanged**.

**Output:** the brief markdown the partner reviews, edits, approves, and builds from.

## Brief format — two new load-bearing sections

The current 8-section brief (problem, user stories, key features, tabs/sections, the interaction,
sample data, the "after" picture, brand direction) gains and elevates:

- **"The magic moment"** — promoted to its own **leading** section: the ONE interaction where AI
  does the hated hard thing, value in a single click. It leads so the build cannot miss the
  #1-weighted pillar.
- **"Visual mandate"** — an explicit instruction on *where* visuals carry the value: which view is
  a live map / routing board / animated chart / before-after, vs. a plain table. This directly
  fixes "doesn't use visuals when it should" by making it the build's instruction, not a hope.
- **Rubric self-check** — a short line confirming the brief clears all three pillars, so the
  partner can sanity-check before approving.

All existing brief rules carry forward unchanged: plain language / no banned words, no storytelling,
no negation framing, no em dashes, **never invent** facts (`[NEEDS INPUT: …]` markers), and the
brand-direction resolution (web search for brand colors, `[Shift Edition-06 fallback]` when
unconfident). The server-side `assertNoNeedsInput` gate at save time still applies to the final
brief.

## Cleanup — retire `prototype-spec`

`skills/prototype-spec/SKILL.md` is **orphaned** and is deleted as part of this work.

- The original pipeline was brief → **spec** → HTML (the skills' own "First/Second/Final step"
  framing).
- The build worker never loads it: `worker/prompt.ts` composes its system prompt from exactly
  `_firm/context.md` + `html-prototype/SKILL.md`. The worker's intake is the **brief markdown**
  passed straight through (`startPrototypeBuild` → POST `/build` with `brief`), and the
  `html-prototype` skill names its intake as "the approved prototype brief."
- No code path calls `generate({skill: "prototype-spec"})` (grep across `app/` and `lib/` is empty).
- When the build step became the autonomous SDK loop (iterating visually against its own renders),
  brief → spec → HTML collapsed to brief → HTML. The spec's job is now absorbed: the **brief**
  carries the *what/why* (and now the magic moment + visual mandate), the **loop** figures out the
  *how* by looking at its own work. There is no seam left for a separate spec to fill.

Leaving it in place is a trap: a future contributor could re-wire it and re-introduce a redundant
step. Delete `skills/prototype-spec/` on implementation.

---

## Cost, latency, and risk

- **Cost:** ~3× the model cost of one call (Stages 1–3), plus a light Stage 0 call. Brief
  generation is infrequent and high-value; the trade is worth it.
- **Latency:** three sequential model calls. The action already permits up to 300s
  (`maxDuration`); well within budget.
- **No-hallucination discipline compounds across stages.** Every stage carries the `[NEEDS INPUT]`
  rule; the final `assertNoNeedsInput` gate at save is the backstop.
- **Internal stages are not persisted to the partner for v1.** If we later want trust/auditability,
  stash the directions + red-team scoring on the run as a collapsible "how we got here." Out of
  scope now (YAGNI).

## Files touched (for the implementation plan)

- **New:** `skills/prototype-brief-directions/SKILL.md`, `skills/prototype-brief-redteam/SKILL.md`.
- **Rewrite:** `skills/prototype-brief/SKILL.md` (commit stage + the two new brief sections).
- **Delete:** `skills/prototype-spec/`.
- **Edit:** `app/(app)/pipeline/[id]/proposal-engine.ts` — `generatePrototypeBrief` becomes the
  Stage 1→2→3 chain; add the Stage 0 kickoff (reconcile discovery-report modules + discussion-call
  notes → grounded seed).
- **UI:** the "Build prototype" entry point — replace the single-sentence steer box with the Stage 0
  pre-filled picker (winner pre-selected, alternates, optional steer note). Surface lives in the
  pipeline deal prototype flow / `prototype-build-view.tsx`.

## Out of scope — Phase 2 / v2 (provisional)

**Workflow-video interpretation.** Let the agent "watch" a client's screen-share of their workflow
to (a) get the richest possible "exactly my world" signal and (b) screen for sensitive data before
it informs the brief.

- Claude cannot ingest raw video natively. "Watch" means a processing step: **sample frames**
  (interval + scene-change) + **pull the audio transcript**, then feed frames (vision) + transcript
  to the model. Frame extraction needs `ffmpeg` — which fits the **Railway worker** (a `/brief` or
  media pre-pass endpoint), not a Vercel server action.
- Includes a **sensitive-data screening pass**: vision flags anything that looks like real PII /
  credentials → excluded from the brief, surfaced to the partner.
- **Status: provisional.** May not happen on data-security grounds (videos of client workflows are
  a real exposure). Decided as a separate v2 after Phase 1 is live. Stage 1's interpret step is
  designed so this signal can plug in later without restructuring.
