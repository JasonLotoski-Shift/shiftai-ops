# Ops Tool — User Stories

> Companion to [ROADMAP.md](ROADMAP.md) and [features.md](features.md). User stories drive features; features drive the build.

## Roles

- **Managing Partner** — one of the three founding partners. Does sales, leads engagements, signs contracts, reviews finances. (Jason fills this role plus a leadership/ops slant.)
- **Consultant** — senior bench member brought in per engagement. Works on assigned projects, logs hours, owns deliverables. Has no business-development or financial visibility by default.
- **AI Agent** — Claude Code (interactive) and scheduled agents. Reads ops tool state through MCP, writes back status updates, drafts artifacts, logs hours after substantial work sessions.
- **Admin** *(future, post-MVP)* — operations/finance person if hired. Handles invoicing, contracts, payroll. Out of MVP scope but designed for.

---

## Pipeline / CRM

### As a Managing Partner
- I want to see every prospect and their current deal stage on one board, so that I know what's in flight without asking anyone.
- I want to add a new contact in under 30 seconds from a single screen, so that I capture introductions immediately after a meeting.
- I want to log a touch-point (call, email, meeting) against a contact with one click, so that the pipeline reflects reality without admin overhead.
- I want to see which prospects haven't been touched in 30+ days, so that I can re-engage before they go cold.
- I want to associate prospects with a partner-lead, so that ownership is clear and follow-ups don't fall between people.
- I want to convert a prospect into a signed client without re-entering any data, so that onboarding starts the moment the deal closes.

### As an AI Agent
- I want to read the pipeline and identify stale leads, so that I can draft re-engagement outreach for the partner to review.
- I want to attach research notes (company brief, recent funding, news) to a prospect record, so that the partner has context before the next call.

### Relationship intelligence (contact record) — as a Managing Partner
- I want each contact to carry a rich record — persona, communication style, key facts, background, hobbies/interests, network affiliations, and notes — so that I walk into every conversation knowing who I'm talking to.
- I want a communications log on each contact (call / meeting / email sent / email received / other, each with a date defaulting to today and a short summary), so that the full interaction history lives in one place.
- I want to log an interaction in one click from the contact, so that the history stays current without admin overhead.
- I want a one-click "web search" on a contact that pulls public info (news, filings, company site, profiles) and **proposes** additions to the record, so that enrichment is on-demand, not manual data entry.
- I want a one-click "AI enrich" that reads the communications log and **proposes** updates to the persona/style/key-facts, so that the record learns from how the relationship actually unfolds.
- I want every enrichment to be **non-destructive** — additions merge, existing facts are never silently overwritten, and any conflict with a known fact is surfaced for me to resolve — so that hard-won institutional knowledge is never lost to an automated update.

### As an AI Agent (drafting)
- I want to draft an email to a contact from the record, but I must **never invent** a price, a sender role, a date/timeline, or any commitment I wasn't given — anything missing is left as an explicit `[NEEDS INPUT]` marker and the draft cannot "send" until a human fills it. (See the firm-wide no-hallucination guarantee under Foundational.)

---

## Client management

### As a Managing Partner
- I want every signed client to have a single record with contract terms, contacts, partner-lead, and link to Drive folder, so that I never have to hunt across systems.
- I want to draft a Statement of Work from a scoping conversation, so that I can send a proposal within hours of a discovery call.
- I want to generate an invoice against a project's logged hours plus fixed-fee milestones, so that billing matches reality.
- I want to see outstanding invoices and aging at a glance, so that cash flow visibility is constant, not monthly.
- I want to attach the signed contract PDF to the client record, so that legal documents are findable in the same place as everything else.

### Company profile (client record) — as a Managing Partner
- I want each client to have a **Company profile** sub-tab — size, industry, headquarters, founded, ownership, website, branding (colours/logo), what they do, and operating key facts — so that the whole team shares one accurate picture of the account.
- I want that profile to auto-update from logged communications and an on-demand web search, with additions **proposed** and existing facts preserved, so that the profile stays current without anyone owning it as a chore.
- I want an **Engagement & billing** sub-tab — contract value, billed/collected/outstanding, payment terms, contract period, status, projects, invoices — so that the commercial picture is one click from the profile, not buried.

### As a Consultant
- I want to see the basic facts about the client I'm assigned to (industry, scope, partner-lead, primary contact), so that I can show up to meetings informed.

### As an AI Agent
- I want to read a client's contract terms and scope, so that I can generate engagement charters and kickoff docs that match what was sold.
- I want to write the client's `drive_folder_url` and `claude_workspace_path` back to the record on engagement creation, so that the three operating surfaces stay linked.

---

## Project management

### As a Managing Partner
- I want every active engagement to surface its current status (on-track / at-risk / blocked) on a single dashboard, so that I can run weekly partner meetings off one screen.
- I want to assign consultants to projects with a defined role and rate, so that capacity and margin are visible from the start.
- I want to set milestones and deliverable dates on a project, so that we have a contract-anchored timeline, not just a wish.
- I want to see total hours logged against a project versus budget remaining, so that scope creep gets caught early.
- I want to mark an engagement closed and trigger the close workflow (final invoice, archive, IP harvest), so that nothing falls through the cracks at the end.

### As a Consultant
- I want to see my assigned projects and their open tasks on one screen, so that I know what to work on this week without checking three places.
- I want to log hours against a project in under 15 seconds (project + hours + short description), so that timesheet friction doesn't make me skip it.
- I want to mark a task or deliverable complete, so that the partner-lead has live status without asking.

### As an AI Agent
- I want to log hours against a project after a substantial Claude Code work session, so that AI-assisted work is visible in the same accounting as human work.
- I want to update project status from inside a client workspace (Claude Code), so that partners see live status without me having to switch tools.
- I want to attach deliverable artifacts (Drive URLs, code commits) to a project, so that what was built is traceable from the project record.

---

## Foundational (cross-cutting)

### As a Managing Partner
- I want to sign in with my Google Workspace account under `shiftai.partners` (with `@shiftcg.ai` still accepted during the alias-domain sunset), so that I don't manage another password.
- I want clear permissions — partners see everything; consultants see their assigned engagements only — so that confidentiality holds across the bench model.
- I want a global search across contacts, clients, projects, so that I can find anything in under three keystrokes.
- I want the dashboard split into two views — **Today** (quick actions + my task list, the "do") and **The firm** (daily/weekly team updates, engagements, activity, industry news, the "know") — so that I can act fast or get the firm-wide picture without one screen trying to be both.
- I want a **light mode** toggle that persists, so that I can work in the palette that suits the room or the time of day (dark stays the brand default).

### Foundational guardrail — no hallucination (applies to every AI surface)
- As a Managing Partner, I want a hard guarantee that no AI surface — drafting an email, generating a document, enriching a record, proposing a profile update — ever **assumes a fact it wasn't given** (a person's role, a price, a timeline, a commitment). When something is unknown, the AI must **ask, or leave an explicit `[NEEDS INPUT]` marker — never guess.** A guessed price or a fabricated commitment in a client-facing artifact is a reputational and legal risk the firm cannot carry, especially given the acquisition target. This is non-negotiable and overrides "be helpful."

### As an AI Agent
- I want to authenticate against the ops tool as a first-class user with scoped permissions, so that what I can read and write is auditable.
- I want every API/MCP call to be logged with the calling agent and timestamp, so that the firm has an audit trail of AI activity for acquirer diligence.

---

## Out of scope for MVP (flagged for later)

- Client portal (clients viewing their own project status, invoices, deliverables)
- Recurring revenue / subscription billing
- Multi-currency, multi-tax-jurisdiction support
- Multi-tenant architecture (other firms using the tool)
- Time-off, payroll, expense reimbursement (use a real HR tool when needed)
- Slack/Teams notifications (add when partner pull is clear)
- Stripe payment processing (manual invoicing for v1; integrate when volume justifies)
