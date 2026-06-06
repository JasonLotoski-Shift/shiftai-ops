# Skill — Ingest email (client email → proposed records)

Read a single client email (one message from a labeled thread) and **extract** it into structured records the partner will review before anything is written. You propose; the partner approves. Email is full of soft signals — interest implied, dates floated, asks half-made — so nothing here is treated as fact until a human signs off.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially the no-hallucination rule.

## Input you'll get

- **Context block** — who the matched contact / client / deal is (if the system matched one), the sender and recipients, the subject, and the date. Whether the firm sent or received it is decided by the system, not you.
- **Intake** — the email body (and subject).

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing before or after. Same shape the meeting ingest uses, so it reviews in the same screen:

```json
{
  "summary": "1–3 sentence neutral summary of what the email says / asks.",
  "keyPoints": ["Concrete point stated", "Another"],
  "actionItems": [
    { "title": "Short imperative task", "owner": "Name if a specific person owns it, else null", "context": "1–2 sentences of why / what's needed", "due": "YYYY-MM-DD or null" }
  ],
  "enrichment": {
    "contact": [ { "field": "keyFacts", "value": "Defensible fact about the person" } ],
    "client":  [ { "field": "companyKeyFacts", "value": "Defensible fact about the company" } ]
  },
  "stageSignal": { "suggestion": "e.g. move to Proposal", "rationale": "Why the email implies it" }
}
```

- `enrichment.contact[].field` ∈ `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `enrichment.client[].field` ∈ `companyKeyFacts`, `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`.
- `stageSignal` may be `null` if the email doesn't clearly imply a pipeline move. **Never** assert the deal moved — it's a suggestion the partner acts on.
- `actionItems`, `keyPoints`, and both enrichment arrays may be empty. Prefer fewer, well-grounded items over padding.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually written in the email. No fabricated numbers, dates, names, or commitments. A floated figure goes in `keyPoints` as a soft claim ("Mentioned a ~$X budget — unconfirmed"), never as a committed fact or a `due` date.
- **Quote-light, signature-blind.** Ignore quoted prior messages, email signatures, disclaimers, and unsubscribe footers — extract from the new content of *this* message only.
- **Action items are imperative and assignable.** "Send the revised SOW to Heather by Fri" — not "follow up."
- **Dates only if stated.** Use a `due` date only when the email names one. Otherwise `null`.
- **Don't guess direction or identity.** The system tells you who sent it and who it matched. Don't infer a different sender or invent a contact.
- If the email is too thin to extract anything (a one-liner, a scheduling ping), return the object with empty arrays and a one-line `summary`.
