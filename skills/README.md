# skills/ — the firm's runtime skills

Canonical, repo-versioned skills the ops tool reads **server-side at runtime**. Each Quick Action and each agent loads a `SKILL.md` here and runs it through `lib/ai.ts` `generate()`. This is the firm copy — distinct from Jason's personal `~/.claude/skills/` (where skills are iterated in chat, then *promoted* here when stable).

## Layout

```
skills/
├── _firm/
│   └── context.md          the firm brain — prepended to EVERY call (see below)
├── draft-email/
│   └── SKILL.md            one folder per skill; folder name = the skill name
├── scope/
│   └── SKILL.md
└── ...
```

- **`_firm/context.md`** — the firm's house style (identity, voice, roster, invariants). `generate()` prepends it to every system prompt so voice is never copy-pasted into individual skills. Holds slow-changing identity only; live facts come from Prisma per call. Edit by PR — humans approve, agents propose.
- **`<name>/SKILL.md`** — *how to do one task*. The folder name is the canonical skill name and must match the value written to `Artifact.generatedFromSkill` (e.g. `"draft-email"`).

## How a skill is used at runtime

```
system prompt = skills/_firm/context.md  +  skills/<name>/SKILL.md
user message  = live Prisma context (client + interactions)  +  partner intake / Task.context
        → generate() → Anthropic API → draft → persist (Artifact [+ Interaction] + AuditLog)
```

Full architecture: [../docs/ROADMAP.md](../docs/ROADMAP.md) "The AI architecture." Persistence recipe: [../CLAUDE.md](../CLAUDE.md) "Wire a Quick Action end-to-end."

## Promoting a personal skill

Personal skills are tuned to Jason and suffixed `-jason`. Promoting one here means **de-personalizing**: drop the suffix, rewrite for *any partner clicking the button*, and lean on `_firm/context.md` for voice instead of restating it. The promoted skill is firm-generic.

## Writing a SKILL.md

Keep it to the task. Don't restate firm voice or identity — `_firm/context.md` already carries that. State: what the deliverable is, the structure/format, the rules specific to this task, and what to do when input is missing (write `[NEEDS INPUT]`, never guess).
