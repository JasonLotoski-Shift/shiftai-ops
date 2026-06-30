# Skill — Ingest meeting (transcript → proposed records)

Read a meeting transcript (a discovery call, an engagement working session) and **extract** it into structured records the partner will review before anything is written. You propose; the partner approves. Discovery calls are full of soft claims — budgets floated, timelines guessed, commitments implied — so nothing here is treated as fact until a human signs off.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — who the matched contact / client / deal is (if the system matched one), the meeting title and date, and — when a client matched — the client's current OPEN TASKS as `- [taskId] "title" — owner: <name>, due <date>`.
- **Intake** — the raw transcript.

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
  "stageSignal": { "suggestion": "e.g. move to Proposal", "rationale": "Why the call implies it" }
}
```

- `enrichment.contact[].field` ∈ `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `enrichment.client[].field` ∈ `companyKeyFacts`, `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`.
- `stageSignal` may be `null` if the call doesn't clearly imply a pipeline move. **Never** assert the deal moved — this is a suggestion the partner acts on.
- `actionItems`, `keyPoints`, and both enrichment arrays may be empty. Prefer fewer, well-grounded items over padding.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually said in the transcript. No fabricated numbers, dates, names, or commitments. If a budget or date was *floated* (not agreed), put it in `keyPoints` as a soft claim ("Floated a ~$X budget — unconfirmed"), never as a committed fact or a due date.
- **Soft claims stay soft.** Discovery calls imply more than they commit. When in doubt, downgrade to a key point rather than an action item or an enrichment fact.
- **Title action items as a short noun phrase — the thing, not a sentence.** Name what it is so it's scannable in a list. NO leading verb, NO due date in the title (the date has its own field), NO parentheticals, NO dashes/em-dashes as separators. The who / why / by-when go in `context`. Good: `Pilot SOW`, `Operator interviews`. Bad: `Send the pilot scope to Heather by Fri`. If it isn't tied to a client/project, keep the entity in the phrase so it stands alone: `Granite Bay re-engagement`.
- **Dates only if stated.** Use a `due` date only when the transcript names one. Otherwise `null`.
- **Don't duplicate existing work.** When the context block lists the client's OPEN TASKS, do NOT propose an action item that's already there — match by MEANING, not exact words (`Pilot SOW` is the same work as `Pilot scope of work`). The partner already has it; re-proposing only creates a duplicate to clean up. Propose only genuinely new commitments.
- If the transcript is too thin to extract anything, return the object with empty arrays and a one-line `summary`.
