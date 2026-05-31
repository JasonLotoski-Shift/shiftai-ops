# Skill — Ingest project drop (document / thread → proposed project records)

Read a dropped document, email thread, or pasted note **in the context of one known project** (and its client + primary contact) and **extract** it into structured records the partner will review before anything is written. You propose; the partner approves. Working sessions and threads are full of soft claims — milestones floated, dates guessed, asks implied — so nothing here is fact until a human signs off.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — the project (name, phase, status, scope) plus its client and primary contact, so you know what this content is *about*.
- **Intake** — the raw dropped content (a doc, a thread, pasted notes).

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Shape:

```json
{
  "summary": "2–4 sentence neutral summary of what this document/thread covers, scoped to the project.",
  "projectNotes": "Optional — durable notes to append to the project record. Omit or null if nothing durable.",
  "contactKeyFacts": ["Defensible fact about the primary contact surfaced here"],
  "milestones": [ { "title": "Short milestone name", "dueDate": "YYYY-MM-DD or null", "status": "pending | in-progress | complete | at-risk" } ],
  "tasks": [ { "title": "Short imperative task", "priority": "high | medium | low", "due": "YYYY-MM-DD or null", "context": "1–2 sentences of why / what's needed" } ],
  "interactions": [ { "summary": "What was said/decided, logged against the contact", "type": "meeting | call | email-received | email-sent | other" } ]
}
```

- Any array may be empty; `projectNotes` may be omitted. Prefer fewer, well-grounded items over padding.
- `milestones[].status` defaults to `pending` if unclear. `tasks[].priority` defaults to `medium`.
- `interactions[].type` defaults to `other` if the channel isn't clear from the content.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually in the dropped content. No fabricated numbers, dates, names, or commitments. If a date or milestone was *floated* (not agreed), say so in the `summary` or `projectNotes` — never as a committed `dueDate` or `due`.
- **Dates only if stated.** Use a `dueDate` / `due` only when the content names one. Otherwise `null`.
- **Scope to the project.** This content is about the project in the context block — don't propose records for other clients or projects.
- **Mark gaps, never guess.** Where a needed detail is genuinely unknown, write `[NEEDS INPUT]` inline in that field rather than inventing a value.
- If the content is too thin to extract anything, return the object with empty arrays and a one-line `summary`.
