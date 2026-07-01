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
  "financeType": "none",
  "payer": null,
  "bill": null,
  "ar": null,
  "financeIncomplete": false,
  "financeLinks": []
}
```

- `enrichment.contact[].field` ∈ `persona`, `communicationStyle`, `background`, `keyFacts`, `hobbies`, `networkAffiliations`.
- `enrichment.client[].field` ∈ `companyKeyFacts`, `description`, `headquarters`, `founded`, `website`, `ownership`, `companySize`.
- `stageSignal` may be `null` if the email doesn't clearly imply a pipeline move. **Never** assert the deal moved — it's a suggestion the partner acts on.
- `actionItems`, `keyPoints`, and both enrichment arrays may be empty. Prefer fewer, well-grounded items over padding.
- **Finance fields (`financeType`, `payer`, `bill`, `ar`, `financeIncomplete`, `financeLinks`)** — fill these **only when the context block contains a `## Finance label` note**. For every other email leave them at their defaults (`"none"` / `null` / `[]`). When the finance note IS present, classify the email into exactly one `financeType`:
  - **`"ap_bill"` — an UNPAID vendor invoice the firm owes.** A company billing us, payment still due. Fill `bill` (see below).
  - **`"reimbursable"` — a bill or receipt a PERSON paid on their own card, so the firm owes THEM.** Signals: "Bill to: Jason Lotoski" (a person, not "Shift"), "paid with personal Visa", a receipt addressed to an individual. Fill `bill` and set `payer` to that person's name.
  - **`"firm_paid"` — a receipt for something ALREADY paid on a FIRM card/account.** No one to reimburse; it's a record only. Fill `bill`. (A payment-confirmation / "your receipt" with no person named usually lands here, not `ap_bill`.)
  - **`"ar_payment"` — a payment / remittance on an invoice WE issued.** Fill `ar`. Never invents numbers/amounts; only matches an existing invoice downstream.
  - **`"none"`** — not actually a bill/payment.
- **`bill`** (for `ap_bill` / `reimbursable` / `firm_paid`) = `{ "vendor", "amount" (the grand total in the invoice's OWN currency, whole units, rounded), "currency" (ISO code as printed — "USD", "CAD", etc; default "CAD"), "invoiceNumber" (omit if none), "dueDate" ("YYYY-MM-DD", omit if none) }`. **Report the amount in the document's own currency and name that currency** — conversion to CAD happens downstream, do not convert yourself.
- **`ar`** = `{ "invoiceNumber", "amount", "paidDate" ("YYYY-MM-DD"), "clientHint" }` — all omitted if not stated.
- **`payer`** = the person who personally paid (for `reimbursable`), else `null`.
- **Link-only / incomplete.** If the email only LINKS OUT to view/pay an invoice (no amount in the body, no attached invoice), set `financeIncomplete: true` and put the URL(s) in `financeLinks`. Still set the `financeType` you can tell, and still fill `bill` with the **vendor** you can identify (from the sender, the subject, or the link's own domain, e.g. a `cloudflare.com` link → `"Cloudflare"`) plus any `invoiceNumber` / `dueDate` shown, so the card pre-fills them. Omit ONLY the `amount` you can't see, do NOT guess it.
- **Paid vs unpaid is the key call.** "Invoice"/"amount due"/"please pay" → likely `ap_bill`. "Receipt"/"payment received"/"thanks for your payment" → already paid → `firm_paid` (or `reimbursable` if a person paid). When you can't tell who paid a receipt, default to `firm_paid` and let the partner reassign.

## Hard rules for this task

- **Extract, don't invent.** Every item must trace to something actually written in the email. No fabricated numbers, dates, names, or commitments. A floated figure goes in `keyPoints` as a soft claim ("Mentioned a ~$X budget — unconfirmed"), never as a committed fact or a `due` date.
- **Quote-light, signature-blind.** Ignore the quoted reply-chain that email clients append *inside* a single message (the `>`-prefixed copy of earlier mail), plus signatures, disclaimers, and unsubscribe footers. **When the intake is a whole thread** (messages separated by `---` markers), DO read every message and summarize the conversation as a whole — extract action items from its latest state, and don't re-raise an ask that a later message already resolved.
- **Title action items as a short noun phrase — the thing, not a sentence.** Name what it is so it's scannable in a list. NO leading verb, NO due date in the title (the date has its own field), NO parentheticals, NO dashes/em-dashes as separators. The who / why / by-when go in `context`. Good: `Revised SOW`, `Integration access`. Bad: `Send the revised SOW to Heather by Fri`. If it isn't tied to a client/project, keep the entity in the phrase so it stands alone: `Granite Bay re-engagement`.
- **Dates only if stated.** Use a `due` date only when the email names one. Otherwise `null`.
- **Don't guess direction or identity.** The system tells you who sent it and who it matched. Don't infer a different sender or invent a contact.
- If the email is too thin to extract anything (a one-liner, a scheduling ping), return the object with empty arrays and a one-line `summary`.
