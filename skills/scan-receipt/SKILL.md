# Skill — Scan receipt / invoice (photo → proposed fields)

Read a photographed or scanned **receipt or vendor invoice** and **extract** the
fields the partner needs to log it — vendor, amount, date, category, and whether
it's a paid receipt (an expense) or a bill we owe (accounts payable). You
propose; the partner confirms and corrects every field before anything is saved.
Treat the image as the only source of truth: read what's printed, never guess.

The firm's voice, identity, and hard rules are in the firm context above. Apply
them — especially the **no-hallucination rule**: if a value isn't legible on the
document, return `null` for it rather than inventing one.

## Input you'll get

- One image: a phone photo or scan of a receipt or invoice. It may be skewed,
  creased, low-contrast, or partly cut off. Read what you can.

## What to produce

Return **only a single JSON object** — no prose, no markdown fences, nothing
before or after:

```json
{
  "docType": "receipt | invoice",
  "vendor": "Merchant / vendor name as printed, or null",
  "date": "YYYY-MM-DD (transaction or invoice date), or null",
  "amount": 0,
  "tax": 0,
  "currency": "CAD",
  "category": "one of the category values below, or null",
  "invoiceNumber": "the vendor's invoice/reference number (invoices only), or null",
  "description": "one short line: what was bought / what it's for, or null",
  "confidence": "high | medium | low"
}
```

- **`docType`** — `invoice` when the document is a **bill requesting payment**
  (says "Invoice", "Amount Due", "Bill To", payment terms like "Net 30", a due
  date). `receipt` when it's **proof of a completed purchase** (a point-of-sale
  receipt, a paid restaurant/hotel bill, "Paid", "Total", a card-approval slip).
- **`amount`** — the **grand total actually charged / payable**, as a whole
  number in the document's currency (round to the nearest dollar; drop cents).
  Null if no total is legible.
- **`tax`** — the GST/HST/sales-tax amount if shown separately, whole number,
  else null. (Informational; don't fold it into `amount`.)
- **`currency`** — ISO code (`CAD`, `USD`, …). Default `CAD` if nothing on the
  document indicates otherwise.
- **`category`** — your single best fit from this list (exact value):
  - `travel_accommodation` — hotels, Airbnb, lodging
  - `travel_flights` — airfare
  - `travel_meals` — meals while travelling
  - `bd_events` — conferences, event tickets, networking
  - `bd_meals` — client/prospect meals & entertainment
  - `bd_other` — gifts, sponsorships, other business development
  - `fuel_mileage` — fuel / gas
  - `subscription_software` — SaaS tools (Miro, Claude, Figma, Notion, …)
  - `subscription_phone` — mobile / phone / internet plans
  - `subscription_office` — office rent, coworking, utilities
  - `subscription_other` — other recurring services
  - `office_supplies` — supplies, small equipment
  - `professional_fees` — accounting, legal, contractors
  - `other` — anything that doesn't fit
- **`confidence`** — your overall read quality: `high` (clean, all key fields
  legible), `medium` (some fields guessed from partial text), `low` (blurry /
  cut off / mostly unreadable).

## Hard rules for this task

- **Read, don't invent.** Every value must be visible on the document. Illegible
  or absent → `null`. Never fabricate a vendor, amount, date, or number.
- **Total, not subtotal, for `amount`.** Partners care about what was charged.
  If both a subtotal and a total are shown, return the total in `amount` and the
  tax in `tax`.
- **Date format is strict** `YYYY-MM-DD`. If only a partial date is printed (no
  year), return `null` rather than guessing the year.
- **One category, best fit.** Pick the single closest value; if genuinely
  unclear, use `other` — don't leave it null just to be safe unless the document
  gives no hint at all about what was purchased.
- **Don't classify as `invoice` just because the vendor calls itself one.** A
  paid point-of-sale slip is a `receipt` even if titled "Invoice"; the test is
  whether money is still **owed** (→ invoice) or already **paid** (→ receipt).
- If the image is unreadable, return the object with `null` fields and
  `confidence: "low"` — don't pad it with plausible-looking values.
