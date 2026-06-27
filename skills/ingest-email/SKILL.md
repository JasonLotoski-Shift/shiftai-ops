# Skill — Ingest email (client email → proposed records)

Read a client email — **one message, or a whole thread** (several messages, oldest→newest, separated by `---` markers, when a reply lands on a thread already in review) — and **extract** it into structured records the partner will review before anything is written. You propose; the partner approves. Email is full of soft signals — interest implied, dates floated, asks half-made — so nothing here is treated as fact until a human signs off.

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
    { "title": "Short noun phrase — the thing, no verb/date", "owner": "Name if a specific person owns it, else null", "context": "1–2 sentences of why / what's needed", "due": "YYYY-MM-DD or null" }
  ],
  "enrichment": {
    "contact": [ { "field": "keyFacts", "value": "Defensible fact about the person" } ],
    "client":  [ { "field": "companyKeyFacts", "value": "Defensible fact about the company" } ]
  },
  "stageSignal": { "suggestion": "e.g. move to Proposal", "rationale": "Why the email implies it" },
  "billCandidate": false,
  "bill": null,
  "arCandidate": false,
  "ar": null,
  "financeIncomplete": false,
  "financeLinks": []
}
```

- `enrichment.contact[].field` ∈ `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `enrichment.client[].field` ∈ `companyKeyFacts`, `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`.
- `stageSignal` may be `null` if the email doesn't clearly imply a pipeline move. **Never** assert the deal moved — it's a suggestion the partner acts on.
- `actionItems`, `keyPoints`, and both enrichment arrays may be empty. Prefer fewer, well-grounded items over padding.
- **Finance fields (`billCandidate`/`bill`, `arCandidate`/`ar`, `financeIncomplete`/`financeLinks`)** — fill these **only when the context block contains a `## Finance label` note**. For every other email leave all of them at their defaults (`false` / `null` / `[]`). When the finance note IS present, assume the email is either AP or AR and classify it:
  - **AP — a vendor bill we owe.** Set `billCandidate: true` and fill `bill` = `{ "vendor", "amount" (the total, whole CAD, rounded), "currency" (default "CAD"), "invoiceNumber" (omit if none), "dueDate" ("YYYY-MM-DD", omit if none) }`. A receipt for something ALREADY paid by us is not a new bill.
  - **AR — a payment / remittance on an invoice WE issued.** A client (or their bank / a payment processor) confirming a payment, or a remittance advice. Set `arCandidate: true` and fill `ar` = `{ "invoiceNumber" (OUR invoice number if cited, omit if not), "amount" (whole CAD if stated), "paidDate" ("YYYY-MM-DD" if stated), "clientHint" (the company/person it's from, to help match) }`. This only ever marks an existing invoice paid downstream — never invent invoice numbers or amounts.
  - **Link-only / incomplete.** If the email just LINKS OUT to view or pay an invoice (a portal "view your invoice" link, no amount in the body, no attached invoice), set `financeIncomplete: true` and put the URL(s) in `financeLinks`. Still set `billCandidate`/`arCandidate` for the side you can tell, but do NOT guess the missing amount — leave it out and let the partner open the link.
  - Set exactly one of `billCandidate` / `arCandidate` true (or neither, if it's genuinely not finance). When unsure which, prefer the one the wording supports; if you truly can't tell, set `financeIncomplete: true` so the partner decides.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually written in the email. No fabricated numbers, dates, names, or commitments. A floated figure goes in `keyPoints` as a soft claim ("Mentioned a ~$X budget — unconfirmed"), never as a committed fact or a `due` date.
- **Quote-light, signature-blind.** Ignore the quoted reply-chain that email clients append *inside* a single message (the `>`-prefixed copy of earlier mail), plus signatures, disclaimers, and unsubscribe footers. **When the intake is a whole thread** (messages separated by `---` markers), DO read every message and summarize the conversation as a whole — extract action items from its latest state, and don't re-raise an ask that a later message already resolved.
- **Title action items as a short noun phrase — the thing, not a sentence.** Name what it is so it's scannable in a list. NO leading verb, NO due date in the title (the date has its own field), NO parentheticals, NO dashes/em-dashes as separators. The who / why / by-when go in `context`. Good: `Revised SOW`, `Integration access`. Bad: `Send the revised SOW to Heather by Fri`. If it isn't tied to a client/project, keep the entity in the phrase so it stands alone: `Granite Bay re-engagement`.
- **Dates only if stated.** Use a `due` date only when the email names one. Otherwise `null`.
- **Don't guess direction or identity.** The system tells you who sent it and who it matched. Don't infer a different sender or invent a contact.
- If the email is too thin to extract anything (a one-liner, a scheduling ping), return the object with empty arrays and a one-line `summary`.
