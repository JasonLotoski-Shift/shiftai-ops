# Skill & Agent Authoring Pipeline

> **What this is.** The gated, one-at-a-time process for building any new skill or agent. Seven gates, each ending in a green light before the next starts. The point: every skill that ships is focused, on-voice, and audited *before* it goes live - so the inventory never accumulates un-vetted skills again.
>
> **Two rules baked in:**
> - **Born-audited.** No skill enters the registry as `not-audited`. Gate 4 runs `/skill-audit` on the draft; it must pass before it ships.
> - **Propose-never-auto-write.** Every gate's output is a draft or a diff a partner approves. Nothing goes live silently.
>
> Pairs with: the registry [AgentandSkillsSweep.md](AgentandSkillsSweep.md) (where the record lands), the auditor `~/.claude/skills/skill-audit/SKILL.md` (Gate 4), and [CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end" (Gate 6 wiring).

---

## When to use this

Any new skill or agent - and any rewrite big enough to change what a skill does. Skip it only for a typo or a one-line tweak (which still gets a quick `/skill-audit` pass).

Run the gates **sequentially, one skill at a time.** This is the opposite mode from the bulk audit (which fans out in parallel). New skills get built hands-on, with a stop after each gate, because the cost of a sloppy skill is every output it ever produces.

---

## The seven gates

Each gate has an **artifact** (what it produces) and a **green light** (the explicit go-ahead needed to proceed).

### Gate 0 - Propose
**Artifact:** one line - name, goal (one sentence), plane (`ops-runtime` / `cc` / `firm-cc` / `agent`), audience, what it produces, trigger.
**Do:** confirm the skill should exist and isn't a duplicate of one already in the registry. If it's an agent, this is the `AgentPlan` row (`status: idea`).
**Green light:** Jason agrees the idea is worth building.

### Gate 1 - Plan
**Artifact:** the full registry record, drafted (all descriptive fields from the [registry schema](AgentandSkillsSweep.md#0-how-to-read-this-doc) - goal, audience, produces, where-it-works, how-it-works, inputs, dependencies, baseline-refs), **plus** which existing skill it's modeled on. No prose/SKILL.md yet.
**Do:** decide the shape - single focused job (a skill doing two things gets split here), the output format, which baselines it must meet, the persistence path if it writes.
**Green light:** Jason approves the shape.

### Gate 2 - Draft
**Artifact:** the `SKILL.md`, written in the right format for its home:
- **ops-runtime:** no YAML frontmatter; starts `# Skill - <name>`; **defers voice to `_firm/context.md`** (don't restate it); declares "return only X"; includes the `[NEEDS INPUT]` guard.
- **cc / firm-cc:** YAML frontmatter (`name`, `description` with triggers); voice/brand rules inline (no `_firm/context.md` at runtime).
**Do:** write tight and focused. Model it on the sibling named in Gate 1. Match the output contract of its type (JSON skills emit raw JSON, no fences; HTML skills follow the brand spec).
**Green light:** the draft exists and reads complete.

### Gate 3 - Edits
**Artifact:** the revised `SKILL.md`.
**Do:** Jason's revisions. Iterate until he's satisfied with the draft on its own terms.
**Green light:** Jason is happy with the draft.

### Gate 4 - Review (the audit gate)
**Artifact:** a `/skill-audit` findings block on the new draft.
**Do:** run the auditor against the full rubric. **Bar to pass: ≥4 on every applicable axis, and H (no-hallucination) = 5** for anything that can write or send. Fix and re-run until it passes. This is where born-audited is enforced.
**Green light:** the audit passes the bar.

### Gate 5 - Final
**Artifact:** the frozen `SKILL.md` + the registry updated.
**Do:** add the record to [AgentandSkillsSweep.md](AgentandSkillsSweep.md) with `audit-status: pass`, today's date, and the Gate-4 score. Add the coverage-map row and an audit-log line. For an agent, flip `AgentPlan.status` idea → active.
**Green light:** Jason approves the registry diff.

### Gate 6 - Implement
**Artifact:** the wired, live skill/agent.
**Do:** only if approved -
- **ops-runtime skill:** register the Quick Action / event trigger and the persistence (Artifact + optional Interaction + AuditLog, one transaction) per [CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end." Run `npx tsc --noEmit` + `npm run build` clean. Add a `lib/data/updates.ts` entry and update the How-it-works page if a flow changed (the "before every push" checklist).
- **cc / firm-cc skill:** it's live on save; no wiring.
- **agent:** wire the trigger (event bridge or scheduled-agent runtime) + the persistence recipe.
- **promoting a personal skill to ops:** de-personalize it - drop the `-jason` suffix, strip the inline voice rules, and lean on `_firm/context.md` instead.
**Green light:** shipped (and, for ops, pushed to `main` after the pre-push checklist).

---

## Special cases

- **Agents need two things a skill doesn't:** a **trigger** (an event, a button, or a cron) and **persistence** (the Artifact + Interaction + AuditLog round-trip). A skill with no trigger is just instructions - it isn't an agent until Gate 6 wires both. (See the sketched agents in the registry §5: they're stuck before Gate 2 because no SKILL.md exists, and before Gate 6 because the trigger infrastructure isn't built.)
- **A skill used only by an agent** (e.g. `harvest-engagement`) still runs all seven gates as a skill; the agent that calls it runs its own Gate 6 wiring.
- **Multi-step workflows** (like prototype brief → spec → HTML): author each step through the gates, but at Gate 1 note the chain so the hand-off contract between steps is explicit.

---

## The blank registry record (Gate 1 template)

```markdown
#### <n>. <name> · <plane> · <type>
- **Goal:** <one sentence>.
- **Audience:** <who reads/uses it>. **Produces:** <the concrete artifact>.
- **Where it works:** <surface/trigger>. **How it works:** <trigger → reads → returns>.
- **Inputs:** <context + intake>. **Dependencies:** <_firm/context.md, Prisma models, MCP tools, APIs, other skills>.
- **Baseline refs:** <voice · brand · audience · personas · bmv2-vocab>. **Audit:** not-audited · - · -.
- **Notes:** <workflow membership, anything a reader should know>.
```

The record is born `not-audited` and only flips to `pass` at Gate 5 - after Gate 4 actually passes. That ordering is the whole point.
