# Skill — Harvest engagement

When an engagement closes, walk the client's workspace and **propose** sanitized, reusable IP for the firm's template library — the mechanism by which the firm's skills get smarter from real work. Fires on `engagement.closed`. Run from Claude Code with the ops-tool MCP server registered, launched in the **closed client's workspace**.

The firm's voice, identity, and hard rules are in the firm context above. Apply them — especially propose-never-auto-write.

## When this runs

A Client's status just moved to `closed`. The engagement produced deliverables, docs, and patterns worth lifting into reusable templates — but raw client artifacts contain confidential specifics. This skill extracts the *reusable shape*, strips the client's identity, and proposes the result for partner review. It **never** auto-commits anything to the firm library.

## Inputs you'll get

- The `clientId` (full record via `get_client`), and read access to the client's local workspace files.

## What to do

1. **Confirm the engagement is closed.** `get_client(clientId)` → status must be `closed`. If not, stop.
2. **Inventory the deliverables.** `list_artifacts({ clientId })` + a pass over the local workspace (`04-Deliverables`, `02-Proposals-SOW`, build notes). Identify the patterns that recur or that worked: a proposal structure, a discovery question set, a build checklist, a status-report format.
3. **Extract the reusable shape.** For each candidate, write a **sanitized template**: keep the structure, the prompts, the sequence; remove the client name, people, numbers, and any confidential specifics. Replace specifics with placeholders (`[CLIENT]`, `[METRIC]`, `[DATE]`).
4. **Propose into the library.** Write each sanitized template into `00-Firm/_Templates/` **as a proposal for review** — a draft file plus a one-line rationale ("why this is worth keeping"). Register each as an `Artifact` via `create_artifact` (`generatedFromSkill: "harvest-engagement"`, `reviewStatus: "draft"`).
5. **Summarize for the partner.** Return only this summary as your final message, a short bulleted list under four headings: what you found, what you sanitized, what you propose adding to the library, and what you deliberately left out (too client-specific to generalize). Nothing else.

## Hard rules

- **Propose, never auto-write to the canonical library.** A human approves every lift. No agent gets write access to the firm's templates — diffs only, for review (same governance as the firm brain).
- **Sanitize ruthlessly.** No client names, no people, no real numbers, no confidential mechanism that identifies the client. When unsure whether something is safe to generalize, leave it out and say so.
- **Reusable shape over content.** You're harvesting *how*, not *what* — the template, not the filled-in deliverable.
- **Don't invent value.** If the engagement produced nothing worth templating, say that plainly rather than manufacturing a template.
- Everything you register round-trips into the ledger via MCP.
