# Skill — Ingest meeting (transcript → proposed records)

Read a meeting transcript (a discovery call, an engagement working session) and **extract** it into structured records the partner will review before anything is written. You propose; the partner approves. Discovery calls are full of soft claims — budgets floated, timelines guessed, commitments implied — so nothing here is treated as fact until a human signs off.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — who the matched contact / client / deal is (if the system matched one), the meeting title and date, and the current OPEN TASKS as `- [taskId] "title" — owner: <name>, due <date>` (a client's board for a client call, or the firm board when the context says this is an internal team meeting).
- **Intake** — the raw transcript.

A line **Type: internal team meeting** in the context means every attendee is on the firm — handle it per "Internal team meetings" below.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "summary": "2–4 sentence neutral summary of what the meeting covered and decided.",
  "keyPoints": ["Concrete point discussed", "Another"],
  "actionItems": [
    { "title": "Short noun phrase — the thing, no verb/date", "owner": "Name if a specific person owns it, else null", "context": "1–2 sentences of why / what's needed", "due": "YYYY-MM-DD or null" }
  ],
  "enrichment": {
    "contact": [ { "field": "keyFacts", "value": "Defensible fact about the person" } ],
    "client":  [ { "field": "companyKeyFacts", "value": "Defensible fact about the company" } ]
  },
  "stageSignal": { "suggestion": "e.g. move to Proposal", "rationale": "Why the call implies it" },
  "knowledgeCandidate": null
}
```

- `enrichment.contact[].field` ∈ `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `enrichment.client[].field` ∈ `companyKeyFacts`, `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`.
- `stageSignal` may be `null` if the call doesn't clearly imply a pipeline move. **Never** assert the deal moved — this is a suggestion the partner acts on.
- `actionItems`, `keyPoints`, and both enrichment arrays may be empty. Prefer fewer, well-grounded items over padding.
- `knowledgeCandidate` is `null` for a client call and for routine team meetings. Set it only for an internal team meeting that cleared the importance bar (see "Internal team meetings" below).

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually said in the transcript. No fabricated numbers, dates, names, or commitments. If a budget or date was *floated* (not agreed), put it in `keyPoints` as a soft claim ("Floated a ~$X budget — unconfirmed"), never as a committed fact or a due date.
- **Soft claims stay soft.** Discovery calls imply more than they commit. When in doubt, downgrade to a key point rather than an action item or an enrichment fact.
- **Title action items as a short noun phrase — the thing, not a sentence.** Name what it is so it's scannable in a list. NO leading verb, NO due date in the title (the date has its own field), NO parentheticals, NO dashes/em-dashes as separators. The who / why / by-when go in `context`. Good: `Pilot SOW`, `Operator interviews`. Bad: `Send the pilot scope to Heather by Fri`. If it isn't tied to a client/project, keep the entity in the phrase so it stands alone: `Granite Bay re-engagement`.
- **Dates only if stated.** Use a `due` date only when the transcript names one. Otherwise `null`.
- **Don't duplicate existing work.** When the context block lists OPEN TASKS (a client's board, or the firm board for a team meeting), do NOT propose an action item that's already there — match by MEANING, not exact words (`Pilot SOW` is the same work as `Pilot scope of work`). The partner already has it; re-proposing only creates a duplicate to clean up. Propose only genuinely new commitments.
- If the transcript is too thin to extract anything, return the object with empty arrays and a one-line `summary`.

## Internal team meetings (firm knowledge)

When the context says **Type: internal team meeting**, every attendee is on the firm. This is a TEAM meeting, not a client call. For these:

- Propose **firm-level** records only. Leave both `enrichment` arrays empty and `stageSignal` `null` — there is no client or deal to enrich or advance.
- `actionItems` become **firm task-board** items. Dedup against the firm board open tasks in the context, same meaning-level rule as above.
- Add a `knowledgeCandidate` ONLY when the meeting produced something the firm should not lose. **Most team meetings produce none** — return `"knowledgeCandidate": null`. That restraint is the point: the firm brain records the few decisions and durable lessons, not routine status.

### The importance bar (when to emit a candidate)

Set a candidate (`isImportant: true`) only when the meeting produced one of:

- **A firm-level decision** future work should not contradict (pricing, positioning, a buyer/partner call, a hire, a tooling/stack choice).
- **A changed way of working** (a new process, a standard, a rule the firm now follows).
- **A strategic call** (a market, a vertical, a build-versus-buy choice, a go/no-go).
- **A durable lesson** worth reusing across engagements (a repeatable insight, a named anti-pattern).

Leave it `null` for routine status, client-specific facts (those are client records, not firm knowledge), to-do lists (those are action items), brainstorms with no decision, and anything already captured.

### Candidate shape

```json
{
  "isImportant": true,
  "kind": "decision",
  "title": "Short noun phrase naming the decision or lesson",
  "context": "The situation (decision kind)",
  "optionsConsidered": "What was weighed (decision kind)",
  "decision": "What was chosen (decision kind)",
  "consequences": "What it commits the firm to (decision kind)",
  "summary": "The lesson or way of working, 2–4 sentences (learning kind)",
  "sensitivity": "firm_wide",
  "rationale": "One line: why this clears the bar"
}
```

- `kind: "decision"` for a decision reached → fill `context` / `optionsConsidered` / `decision` / `consequences`. `kind: "learning"` for a way-of-working or durable lesson → fill `summary`.
- `sensitivity: "managing_partner"` for firm economics or strategy (pricing, margins, payouts, buyer talks); `"firm_wide"` otherwise.
- Everything still traces to what was actually said. No invented decisions. A decision that was only *floated* stays a `keyPoint`, not a candidate. If nothing clears the bar, return `null`.
