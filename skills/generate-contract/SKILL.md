# Skill — Generate Contract (Schedule A: the Deliverable / Statement of Work)

Draft **Schedule A** of the firm's client contract: the Statement of Work that describes the **Deliverable**. The contract is a Master Conditional Sale and Custom Software Development Agreement: the Client buys the custom Deliverable and takes title on full payment; Shift keeps the Background IP and licenses it for a fee. The binding legal terms, the parties, and the commercials are a fixed template the system fills around your output. Your only job is Schedule A: what gets built, what "done" means, what is out, the milestones, and what each side does.

The firm's voice, identity, and hard rules are in the firm context above. Apply them. Do not restate them.

## Read this first

- Schedule A sits inside the firm's **binding contract**. Precision matters more than polish: vague scope is where contracts fail and where vesting disputes start.
- Draw every specific from the context (the approved Statement of Work or scope, the client's projects, the deal notes). Never invent a module, a deliverable, an integration, a date, or an acceptance test the client never discussed.
- Key terms (defined in the Agreement, use them correctly): the **Deliverable** is the custom software built for this client; the **Background IP** is Shift's reusable engine underneath it (the client licenses it, never owns it); the **Vesting Date** is when title to the Deliverable passes to the client on full payment. Describe the Deliverable. Do not describe or scope the Background IP.

## Input you'll get

- **Context block** — the client and engagement: company, industry, the projects/modules and their phase, the primary contact, and, when one exists, the text of the **approved Statement of Work or scope** for this client. That is the source of truth for the Deliverable; build Schedule A from it.
- **Intake** — any scope specifics the partner adds and anything negotiated since.

## What to produce

Return **only an HTML fragment** — the inner content of Schedule A. No `<!DOCTYPE>`, no `<html>`/`<head>`/`<body>`, no `<h1>`/`<h2>` (the template supplies the "Schedule A" heading and the Fees and Vesting blocks), no Markdown, no code fence. Use semantic HTML: `<h3>` for sub-headings, `<p>`, `<ul>`/`<ol>`, and a `<table>` for the milestone schedule. No inline styles, no classes (the template styles it).

Cover these, in this order (drop one only if there is genuinely nothing to say):

1. **Description of the Deliverable** — the custom system and where AI does real work, concrete to this business, tied to the approved scope. One or two short paragraphs, then a `<ul>` of the modules and components in this Deliverable, each in plain terms. Identify any third-party software or services the Deliverable depends on.
2. **Acceptance criteria** — for each module or milestone, the observable test the Client uses to accept it, and the length of the review period (for Section 2.3 of the Agreement, e.g. ten (10) business days). This is the most important part and it drives the Vesting Date. Be concrete: "the system imports the supplier file and flags duplicates" beats "import works."
3. **Out of scope** — what this Deliverable does not include: what waits for a later SOW, what the Client keeps doing as-is. Draw it from the context. If no specific exclusions are known, say the scope is the system above and further modules are added under later SOWs.
4. **Milestones and timeline** — a `<table>` with the milestone, what it produces, and the target date. Use Discovery, then Build (foundation first, then features), then final acceptance. **Real dates only if supplied.** For any date the Client or the signing/kickoff sets later (a date keyed to the signature date, or one confirmed in the Discovery Phase Report), put `[FILL: <which date>]` in the cell — the template renders it as an empty fill-line the Client completes at signing, and it does not block filing. Do not invent a date, and do not use `[NEEDS INPUT]` for these.
5. **What the Client provides** — the Client's obligations the build depends on: a single point of contact, access to the named systems and data, decisions inside the agreed cadence, and people's time. Be specific; a build slips when these are vague.
6. **Dependencies and assumptions** — what the scope assumes (third-party access, data readiness, environments). Note that if an assumption fails, it is handled by a new SOW or Work Order, not free work.

## Rules for this task

- **Specifics over adjectives.** Pull real names, the systems, the integrations, the pain, from the context. A scope that could be pasted into any company's contract is a failure.
- **Acceptance criteria are non-negotiable.** Every module gets a plain, testable "done." It protects both sides and sets the Vesting Date.
- **No commercials here beyond what the template fills.** The build fee and payment schedule are rendered by the template from the partner's intake; do not invent fee numbers. Do not mention the Background IP Licence Fee or buy-out (there is no buy-out).
- **No legal terms here.** No IP, liability, privacy, vesting mechanics, or termination language. Those are fixed sections of the Agreement. Describe the Deliverable, not the law.
- **Right length.** Tight and precise. An operator and a lawyer both read this; both want clarity, not volume.

## Writing rules — no storytelling, no negation framing (firm-wide)

- Lead with the fact. Short sentences. No narrative arc, no hooks, no closers.
- Never use negation constructions ("not X, but Y," "this, not that"). State the positive claim alone.
- No em dashes anywhere. Use a period, a comma, or a colon.
- No banned jargon (see firm context). Plainer than a pitch: this is a contract schedule.

## When input is missing — never invent

Never fabricate a deliverable, a date, an integration, an acceptance test, or a headcount. There are two kinds of blank, and they are not interchangeable:

- `[NEEDS INPUT: <what's needed>]` — a load-bearing fact the firm owes and you were not given (a deliverable, an integration, an acceptance test, a fee). It renders red, and a server-side gate blocks the contract from being filed while any `[NEEDS INPUT]` remains. Leaving the marker visible is the correct, safe move. This is the firm's most important rule.
- `[FILL: <what>]` — a value the Client or the signing/kickoff completes on the document (a milestone date keyed to the signature date or confirmed in Discovery, the cloud provider confirmed at kickoff). The template renders it as an empty fill-line; it does not block filing. Use this for dates and kickoff-confirmed specifics instead of inventing them.

When in doubt about whether the firm owes the fact or the Client fills it in, use `[NEEDS INPUT]`.
