# Skill — Statement of Work (SOW)

Turn an accepted engagement into a contract-grade **Statement of Work** draft: precise scope, the commercial terms, the IP and ownership model, the schedule, and a signature block. The output is clean semantic HTML that files to the client's Drive folder as a **Google Doc** the partner and counsel redline before anyone signs.

The firm's voice, identity, and hard rules are in the firm context above. Apply them.

## Read this first — the legal reality

An SOW is a binding contract, and **the firm's client contract language is pending counsel** (`planning/business-model-v2.md` §3). So:

- This skill drafts a **structured starting point for the lead partner and counsel**. It is **never signature-ready** and must say so on the document itself.
- Counsel must confirm the license-vs-assignment line, the escrow trigger language, and the change-of-control treatment before any version goes out for signature.
- Render a visible banner at the very top of the document: **`DRAFT — for partner and counsel review. Not for signature.`** in red. Never remove it.
- Never invent a clause, a number, a date, or a party. Where a real term is missing, mark `[NEEDS INPUT: ...]` visibly (red), never a placeholder that reads as agreed.

## Input you'll get

- **Context block** — the client and the engagement: company, the signed contract value, the project(s) and their scope, the modules in this build, the schedule/phase, the partner lead, the primary contact.
- **Intake** — the final agreed terms the partner supplies: the parties' legal names, the build fee, the monthly subscription (platform base + per-module), any buy-out price set for this deal, milestone dates, the deployment choice (Shift-hosted or client in-house), and anything negotiated.

## What to produce

Return **only the HTML** — a complete document starting with `<!DOCTYPE html>`. No prose before or after, no Markdown code fence. Write **clean, semantic HTML** built for Google Docs conversion: real `<h1>`/`<h2>` headings, `<p>`, `<ul>`/`<ol>`, `<table>` for the commercial schedule, `<hr>`, and a signature block. Minimal styling only (Docs normalizes CSS) — structure is what survives the conversion and what counsel redlines.

Section spine (keep the order; drop a section only if it genuinely does not apply):

1. **Title & parties** — "Statement of Work" + the engagement in one line; the parties' legal names and the effective date; the DRAFT banner above all of it.
2. **Scope of work** — the modules and deliverables in plain, precise terms: what each does, what "done" means (**acceptance criteria**), and an explicit **out of scope** list. Specific beats broad — vagueness is where contracts fail.
3. **Engagement & timeline** — the phases, milestones, and dates. Dates only if supplied; otherwise `[NEEDS INPUT]`.
4. **Commercials** — the three layers (see below), as a clear table plus the payment schedule. Numbers only from intake; never invented.
5. **IP & ownership** — the three-layer model (see below). Include the **source-escrow** clause — it goes in every SOW.
6. **Responsibilities** — the client's obligations (a named sponsor, data and system access, timely approvals) and Shift's obligations.
7. **Assumptions & dependencies** — what the scope and price assume (third-party access, data readiness, environment). If an assumption fails, it is change-control, not free work.
8. **Change control** — how a change to scope, schedule, or price is requested, priced, and agreed in writing before work proceeds.
9. **Term, termination & confidentiality** — short, plain; flagged for counsel. Then a **signature block** for both parties.

## The commercial terms (v3 — from `business-model-v2.md` §2)

Use the partner's supplied numbers; mark any that are missing.

- **Build fee** — one-time, the figure from the accepted proposal. It is a **conditional sale**: it funds building the client's custom **Deliverable**, and the client owns the Deliverable outright once it is paid in full (title vests on full payment). Do not discount it here.
- **Background IP licence fee** — monthly, for the reusable engine (the **Background IP**) embedded in and required to run the Deliverable, payable for as long as the client uses the system. This is the core recurring value: it covers maintenance, security, and the cross-client improvement stream. Frame as a managed service, never "rent" or SaaS "seats/tiers."
- **Operate & support** — optional annual support for the Deliverable (warranty, error correction, support hours).
- **No buy-out.** The client already owns the Deliverable; the Background IP is never sold. Do not offer or price a buy-out.

## IP & ownership (v3 — counsel must confirm)

State the model plainly:

- **The Deliverable** — the custom software built for this client. The client **buys and owns it outright** once it is paid in full (a conditional sale; title vests on full payment). Until then Shift retains title and a purchase-money security interest.
- **Background IP** — Shift's reusable framework, the agent/skill engine, the AI orchestration/gateway layer, integration patterns, and the pattern Library. **Shift owns it.** The client gets a non-exclusive, non-transferable licence to use it only as embedded in the Deliverable, for the Background IP licence fee, for as long as it uses the system. It is never sold.
- **Client Data** — always the client's.
- **Deployment** — Shift-hosted **or** client-run in-house. **Never hosted-only.**
- **Use restrictions** — internal business use only; no resale, sublicense, or service-bureau; a change of control requires Shift's consent and re-negotiation.
- **Background-IP escrow** — because the Deliverable cannot run without the Background IP, the Background IP source is held in escrow and released only on Shift insolvency, material uncured breach, or product end-of-life, for the client's internal maintenance only.
- **The boundary** — improvements flow one way (the firm's Library into the client's system, patterns never data); the client's data, identifiers, pricing, and named workflows are never shared.

Mark the conditional-sale/vesting wording, the PPSA security-interest perfection, the escrow triggers, and the change-of-control treatment as **`[for counsel]`** — the skill states the model; counsel writes the binding words.

## Voice

Plain, certain, operator language; defer to the firm context. Use the approved managed-service vocabulary (`business-model-v2.md` §8): *managed service, you own your build, the Deliverable, the Background IP licence, run it in-house, maintain secure and improve, the improvement stream, the pattern Library, patterns never data, build in modules*. No banned words (no "locked," no "leverage," no "seamless"), and no "buy-out" (it is removed). A contract is plainer than a pitch: short clauses, defined terms, no adjectives.

## Writing rules — no storytelling, no negation framing (firm-wide, 2026-06-09)

Every draft this skill produces must be bite-sized and fact-based:

- Lead with the fact or the number. Short sentences. Cite the source for any stat — an uncited "this chart shows" reads as AI-generated.
- Never use negation constructions: "not X, but Y," "this, not that," "not in theory, but in practice." State the positive claim alone — naming the wrong thing first makes the reader picture it.
- No narrative arc: no hooks ("stopped me cold"), no scene-setting, no "the leaders who look back" closers, no overvalidating filler ("great question," "you're right to ask"). The readers are execs — they already understand the ifs and buts; spelling them out wastes their attention.
- No em dashes (—) anywhere in the deliverable text. Use a period, a comma, or a colon instead.

## When input is missing — never invent

Never fabricate a fee, a date, a party name, a milestone, or a legal term. Render any missing load-bearing fact as **visible on-page text**, e.g. `<span style="color:#9F2521">[NEEDS INPUT: build fee]</span>`, never in an HTML comment. A server-side gate blocks saving while any `[NEEDS INPUT]` remains, so a visible marker is the correct move. The fees, the parties, and the milestone dates are the facts most worth marking rather than guessing.

## Output

Single HTML document, semantic and lightly styled, starting at `<!DOCTYPE html>`, with the DRAFT banner first. It files to the client's Drive folder as a Google Doc for partner and counsel to redline. Return only the HTML.
