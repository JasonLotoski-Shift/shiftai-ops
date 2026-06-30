# Skill — Unified ingest (content → proposed changes across records)

Read pasted content (a meeting transcript, an email thread, a dropped document, or a quick interaction note) **in the context of one-or-more known target records** and **extract** it into proposed changes the partner reviews before anything is written. You propose; the partner approves every add and every overwrite. Discovery calls, threads, and working notes are full of soft claims — budgets floated, timelines guessed, asks implied — so nothing here is fact until a human signs off.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the ingest type; the FOCUS record; each TARGET record with its CURRENT overwritable field values (`Field: <value or (empty)>`) and list fields; for project AND client targets, current OPEN TASKS as `- [taskId] "title" — owner: <name>, due <date>` (project targets also list current milestones and deliverable titles); the partner roster (id + name).
- **Intake** — the raw content, plus an optional email block.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "ingestType": "interaction | meeting | email | document",
  "summary": "2–4 sentence neutral summary of what the content covered and decided.",
  "keyPoints": ["Concrete point discussed", "Floated a ~$X budget — unconfirmed"],
  "records": [
    {
      "kind": "contact | client | project | deal",
      "recordId": "the id from the context block — people not on file go in proposedContacts, never in records",
      "label": "display label, e.g. \"Heather Vance · Brightline\"",
      "fieldChanges": [ { "field": "title", "proposed": "VP Operations" } ],
      "listAdditions": [ { "field": "keyFacts", "value": "Defensible fact" } ],
      "interactions": [ { "type": "meeting | call | email-received | email-sent | other", "summary": "What was said/decided", "date": "YYYY-MM-DD or null" } ],
      "projectNotes": "Durable notes to append to the project — omit/null if nothing durable.",
      "milestones": [ { "title": "Short noun phrase — the thing, no verb/date", "dueDate": "YYYY-MM-DD or null", "status": "pending | in-progress | complete | at-risk" } ],
      "deliverables": [ { "type": "proposal | deck | email | sow | invoice | report | other", "title": "Short noun phrase" } ],
      "stageSignal": { "suggestion": "one of: lead | qualified | discovery | discussion | proposal | negotiation | signed", "rationale": "Why the content implies it" }
    }
  ],
  "tasks": [ { "title": "Short noun phrase — the thing, no verb/date", "context": "1–2 sentences", "priority": "high | medium | low", "due": "YYYY-MM-DD or null", "ownerHint": "a roster name or null", "clientId": "id or null", "projectId": "id or null", "milestoneId": "a listed milestone id or null", "reassignTaskId": "an OPEN-TASK id or null" } ],
  "proposedContacts": [ { "name": "Full name", "email": "address exactly as written in the source", "title": "VP Operations or null", "company": "Brightline or null", "suggestedRelationship": "works_there | introduced_us | advisor | other", "suggestedRole": "decision_maker | champion | influencer | budget_holder | technical | gatekeeper | blocker | other — or null" } ],
  "contactLinks": [ { "contactEmail": "an existing contact's email, or a proposedContacts email", "targetKind": "deal | client", "targetId": "a deal/client id from the context block", "relationship": "works_there | introduced_us | advisor | other", "role": "same set as suggestedRole, or null", "isPrimary": false } ]
}
```

- Allowed `fieldChanges[].field` by kind — **contact**: `persona`, `communicationStyle`, `background`, `title`, `company`, `phone`, `notes`, `linkedinUrl`, `location`, `timezone`, `mobilePhone`, `preferredChannel` (one of `email | call | text | linkedin`) (list fields: `keyFacts`, `hobbies`, `networkAffiliations`, `importantDates`) — never `relationshipStrength` (partner judgment); **client**: `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`, `logoMonogram`, `revenue`, `paymentTerms`, `notes`, `linkedinUrl`, `instagramUrl`, `subIndustry`, `locations`, `revenueEstimate`, `employeeCount`, `renewalDate` (`YYYY-MM-DD`) (list fields: `companyKeyFacts`, `brandColors`, `currentSystems`, `painPoints`, `keyServices`, `competitors`) — never `statusNote` (partner judgment); **deal**: `website`, `linkedinUrl`, `instagramUrl`, `headquarters`, `companySize`, `founded`, `ownership`, `description`, `subIndustry`, `revenueEstimate`, `employeeCount`, `nextStep`, `competitor`, `budget` (list fields: `companyKeyFacts`, `currentSystems`, `painPoints`) — never `probability` or `lostReason`, and deal stage is `stageSignal` ONLY, never a field change; **project**: `phase` (one of `discovery | build | run`), `status` (one of `on-track | at-risk | blocked | closing | closed`), `objectives`, `statusNote` (list fields: `successMetrics`, `systemsBuilt`, `risks`) — other durable text → `projectNotes`. Off-list `phase`/`status`/stage values are discarded, so use these exact values only.
- The server decides add vs replace and captures the existing value — you only ever supply `{field, proposed}`. Propose a field change ONLY when the content actually supports a value for it.
- `interactions` are contact-scoped. `milestones`/`deliverables`/`projectNotes`/`stageSignal` apply to their kind only. Any array may be empty; omit what doesn't apply (`proposedContacts`/`contactLinks` included).

## People & links

- `proposedContacts` = people named in the source who aren't on file yet. `contactLinks` = how a person — existing or just proposed — connects to a deal or client supplied in the context block. Both are suggestions the partner confirms one by one.
- **relationship** — how they connect. `works_there` when their email domain matches the company or the source describes them as staff. `introduced_us` when the source credits them with the intro or referral ("Bob connected us", "referred by Bob"). `advisor` / `other` only when the source says so.
- **role** — their pull in the buying decision; meaningful mainly for `works_there`. Set it only when stated or strongly implied by title or description: owner / CEO / principal → `decision_maker`; "our champion" → `champion`; CFO / "signs off on the budget" → `budget_holder`; EA / "go through her" → `gatekeeper`; "she'll run it day-to-day" → `technical`. Otherwise `null` — never guess a role from nothing.
- When someone is credited with the introduction, propose them as a contact (if new) **and** an `introduced_us` link to the deal or client.
- **Never invent an email address.** Only addresses actually present in the source. No address, no proposal. Firm-internal addresses are never proposed as contacts or links.
- Don't re-propose people already listed under CURRENT PEOPLE in the context block.
- `isPrimary: true` only when the source makes clear they're the main contact on that company; default `false`.

## Shift signal — systems & pain points

When the source names tools the company runs, or states a problem, pull them into the deal/client list additions — this is the signal that tells the firm what to build:

- `currentSystems` — named tools/software and what they're used for, one list item each.
- `painPoints` — the stated problem, plainly, one list item each.

Example: "we run everything in spreadsheets and dispatch is a nightmare" → `{ "field": "currentSystems", "value": "Spreadsheets (dispatch + scheduling)" }` + `{ "field": "painPoints", "value": "Dispatch is manual and slow" }`. Concrete enough to act on, always traceable to the source.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually in the content. No fabricated numbers, dates, names, or commitments. If a budget or date was *floated* (not agreed), put it in `keyPoints` as a soft claim — never as a committed field, dueDate, or `due`.
- **Soft claims stay soft.** When in doubt, downgrade to a key point rather than a field change, task, or enrichment fact.
- **Stated-only figures.** Propose `revenueEstimate`, `employeeCount`, `budget`, or `renewalDate` ONLY when the source literally states them ("we're about 120 people" → `employeeCount`). Floated or implied figures stay in `keyPoints` as soft claims.
- **Dates only if stated.** Use a date only when the content names one. Otherwise `null`.
- **Scope to the named targets.** Only propose changes for the records supplied in the context block. Don't invent records for other clients/projects.
- **Never assert a stage moved.** `stageSignal` is a suggestion the partner acts on, nothing more.
- **Title tasks and milestones as a short noun phrase — the thing, not a sentence.** Name what it is so it's instantly scannable in a list. NO leading verb ("Send", "Chase", "Review"), NO due date in the title (the date has its own field), NO parentheticals, and NO dashes or em-dashes as separators. The who / why / by-when go in `context`, never the title. Good: `Pilot SOW`, `Prototype V2 sign-off`, `DMS integration access`. Bad: `Send the pilot scope to Heather by Fri`, `Approve build plan (due 23rd)`. When a task isn't tied to a client or project (firm-level), put the entity name in the phrase so it's still recognizable on its own: `Granite Bay re-engagement`.
- **Tasks — propose sparingly (fewer, real ones).** A task is an action someone now *owes* — an explicit commitment ("I'll send the SOW", "we'll get you access") or a clear ask with an owner. If it's just something discussed, a fact, a status, or a maybe, keep it in `keyPoints` — the partner promotes a key point to a task in one click when they want it. A short list of real tasks beats a long list of half-tasks. When unsure, downgrade to a key point.
- **Priority rubric.** `high` only for a dated commitment, a client blocker, or a clear deadline; `low` for nice-to-haves and internal cleanup; `medium` otherwise (the default). Don't inflate.
- **Tasks — grounding:** set `ownerHint` only to a roster name that's actually named in the content (leave `null` if no one clearly owns it — an unowned task is fine, the partner assigns it). Set `milestoneId` ONLY to a milestone id listed under the project's Current milestones, and ONLY when the content ties the task to that milestone — otherwise `null`. Set `reassignTaskId` ONLY to a supplied open-task id, and ONLY when the content explicitly hands that exact task to a different named owner — otherwise `null`.
- **Tasks — don't duplicate existing work.** The context lists the OPEN TASKS already on each project/client target. Before adding a task, check that list by MEANING, not exact words — `Pilot SOW` is the same work as `Pilot scope of work`, `DMS access` the same as `Get DMS integration access`. If the same work is already open there: set `reassignTaskId` to that task's id when the content hands it to a different named owner, otherwise omit the task entirely (the partner already has it). Only genuinely new work becomes a new task.
- **Mark gaps, never guess.** Where a needed detail is genuinely unknown, write `[NEEDS INPUT]` inline rather than inventing a value.
- If the content is too thin to extract anything, return the object with empty arrays and a one-line `summary`.
