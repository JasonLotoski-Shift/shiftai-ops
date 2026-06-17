import type { Entity } from '../../lib/types'

// ZONE 1 · FIRM CONTROL PLANE (shiftai-ops).
// The one cockpit the partners run the firm and the fleet from. It IS the real
// shiftai-ops codebase (Next.js + Prisma + Supabase), extended with a Fleet
// area. Coordination only · never a data path to a client's records.
// Grounded in: shiftai-ops/prisma/schema.prisma, mcp/, skills/, and
// planning/systems-architecture-map.html.
export const controlPlane: Entity[] = [
  {
    id: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'Firm control plane',
    subtitle: 'shiftai-ops · one cockpit',
    source: 'real',
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'The single system the firm runs on: CRM, pipeline, projects, invoicing, and the fleet of client tools. It is the live shiftai-ops app, not a diagram. The Fleet area extends it rather than adding a second system.',
    rule: 'One cockpit, single-tenant. It reuses the Client, Project, Invoice, OpsEvent, and AuditLog models that already exist. Coordination only · no client business record ever lands here.',
  },

  // ── Ops UI + Quick Actions ──────────────────────────────────────────────
  {
    id: 'cp-opsui',
    parent: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'Ops UI + Quick Actions',
    subtitle: 'the real route groups',
    source: 'real',
    childLayout: 'grid',
    about:
      'The partner-facing surface. Each section is a live route group in the app; Quick Actions are skills wired into the page (draft an email, enrich a company, prep a discovery call).',
  },
  { id: 'cp-pipeline', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Pipeline', subtitle: 'deals, stages, enrich, convert', source: 'real' },
  { id: 'cp-clients', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Clients', subtitle: 'engagement, billing, deliverables', source: 'real' },
  { id: 'cp-projects', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Projects', subtitle: 'scope, economics, milestones', source: 'real' },
  { id: 'cp-invoices', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Invoices + billing', subtitle: 'A/R, installments, payouts', source: 'real' },
  { id: 'cp-tasks', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Tasks + messages', subtitle: 'kanban board, firm timeline', source: 'real', inside: ['System messages use MessageKind: task_assigned, deliverable_added, approval_needed, ops_alert'] },
  { id: 'cp-targeting', parent: 'cp-opsui', kind: 'box', owner: 'shift', title: 'Targeting + import', subtitle: 'lead discovery (Apollo, Firecrawl)', source: 'real' },

  // ── System of record ────────────────────────────────────────────────────
  {
    id: 'cp-sor',
    parent: 'control-plane',
    kind: 'store',
    owner: 'shift',
    title: 'System of record',
    subtitle: 'Prisma + Supabase Postgres (single tenant)',
    source: 'real',
    childLayout: 'grid',
    about:
      'The firm’s own database. ~49 Prisma models covering the full deal→client→project→invoice lifecycle, plus an append-only audit ledger and operational telemetry. Holds the firm’s rows only.',
    rule: 'Postgres holds the firm’s pointers and state; documents live in Drive. No client business record lands here.',
  },
  { id: 'cp-m-client', parent: 'cp-sor', kind: 'box', owner: 'shift', title: 'Client / Project', subtitle: 'signed engagements + per-client work', source: 'real' },
  { id: 'cp-m-invoice', parent: 'cp-sor', kind: 'box', owner: 'shift', title: 'Invoice / BillingInstallment', subtitle: 'A/R + the installment schedule', source: 'real' },
  { id: 'cp-m-audit', parent: 'cp-sor', kind: 'box', owner: 'shift', title: 'AuditLog', subtitle: 'every write, with before/after diff', source: 'real', rule: 'Append-only, diligence-grade. Each mutation logs actor, dotted action, target, and a JSON diff before it returns.' },
  { id: 'cp-m-opsevent', parent: 'cp-sor', kind: 'box', owner: 'shift', title: 'OpsEvent', subtitle: 'telemetry: Claude calls, crons, ingests', source: 'real', revised: true, rule: 'Today clientId is a loose string with no foreign key, pruned at ~30 days. The metering work hardens it with a real Client + Project FK and a subscription-line tag.' },

  // ── MCP server ──────────────────────────────────────────────────────────
  {
    id: 'cp-mcp',
    parent: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'MCP server',
    subtitle: 'firm-state door for agents',
    source: 'real',
    childLayout: 'grid',
    about:
      'Lets an agent read and write firm state over the same Postgres. Stdio transport today (local Claude Code only); an HTTP transport is the planned upgrade for remote scheduled agents. Every write auto-logs an AuditLog + Activity row tagged AGENT · MCP.',
    inside: [
      'Read tools: get_client, get_project, list_pipeline, list_active_engagements, list_artifacts, get_contact, list_contacts',
      'Write tools: create_artifact, update_project_status, create_task, log_interaction',
      'HTTP transport + a service token: planned, needed before remote hosting',
    ],
  },

  // ── Fleet area (NEW) ──────────────────────────────────────────────────────
  {
    id: 'cp-fleet',
    parent: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'Fleet area',
    subtitle: 'registry · telemetry · release runner · alerts',
    source: 'planned',
    isNew: true,
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'The new surface that turns a pile of client forks into one fleet you can see and ship to. It extends shiftai-ops; it is not a second system.',
    rule: 'Coordination only, never a data path to client records. Reuses the existing Client / Project / OpsEvent / AuditLog models.',
  },
  {
    id: 'cp-registry',
    parent: 'cp-fleet',
    kind: 'store',
    owner: 'shift',
    title: 'Registry',
    subtitle: 'one row per live client tool',
    source: 'planned',
    isNew: true,
    inside: ['repo + deployment + Supabase project', 'enabled modules + pinned version vs latest', 'health, last deploy, integration-token status'],
    rule: 'The reverse dependency index lives here: it answers which clients pin which artifact, at what version. That set is the rollout target.',
  },
  { id: 'cp-telemetry', parent: 'cp-fleet', kind: 'box', owner: 'shift', title: 'Telemetry sink', subtitle: 'receives sanitized heartbeats', source: 'planned', isNew: true, rule: 'Writes OpsEvent-shaped rows tagged with the real Client + Project FK. The heartbeat schema rejects content fields.' },
  { id: 'cp-alerts', parent: 'cp-fleet', kind: 'box', owner: 'shift', title: 'Exception alerts', subtitle: 'health, version drift, token expiry', source: 'planned', isNew: true, rule: 'Route to the existing per-partner ops_alert chat. Monitoring stays low-touch.' },

  // Release runner · the auto-update engine. Holds the pipeline + safety net.
  {
    id: 'cp-runner',
    parent: 'cp-fleet',
    kind: 'box',
    owner: 'shift',
    title: 'Release runner',
    subtitle: 'a version bump becomes a per-client PR',
    source: 'planned',
    isNew: true,
    childLayout: 'graph',
    childDir: 'TB',
    about:
      'How a fix made once reaches every client that uses it: versioned, tested per client, shipped as a reviewed PR on each client’s own schedule, rolled back on one client if it regresses. This is what the subscription buys, and what makes twenty clients one system to maintain.',
    rule: 'Because each client is its own deploy, the blast radius of any change is exactly one client.',
  },
  { id: 'rr-1', parent: 'cp-runner', kind: 'box', owner: 'shift', title: '1 · Version & changelog', subtitle: 'bump semver, write changelog, extend golden tests', source: 'planned' },
  { id: 'rr-2', parent: 'cp-runner', kind: 'box', owner: 'shift', title: '2 · Find who uses it', subtitle: 'reverse dependency index → the rollout target set', source: 'planned' },
  { id: 'rr-3', parent: 'cp-runner', kind: 'box', owner: 'shift', title: '3 · Plan the rollout', subtitle: 'rings: canary → early → general, soak by tier', source: 'planned', rule: 'Per client: auto-accept or manual, an update window that avoids busy periods, soak time set by tier. Tier C gets the longest soak.' },
  { id: 'rr-4', parent: 'cp-runner', kind: 'gate', owner: 'shift', title: '4 · Test per client', subtitle: 'golden-transcript evals, build, migration dry-run', source: 'planned', rule: 'The brain must beat the test, not just compile. A client whose test fails is held back, not forced.' },
  { id: 'rr-5', parent: 'cp-runner', kind: 'box', owner: 'shift', title: '5 · Ship as a reviewed PR', subtitle: 'a version-bump PR into each client’s own repo', source: 'planned', rule: 'Auto-merge on green for managed clients; manual sign-off for regulated or major changes. The client always keeps control.' },
  { id: 'rr-6', parent: 'cp-runner', kind: 'box', owner: 'shift', title: '6 · Deploy & watch', subtitle: 'smoke test, watch the error rate on the meter', source: 'planned' },
  { id: 'rr-7', parent: 'cp-runner', kind: 'gate', owner: 'shift', title: '7 · Roll back or promote', subtitle: 'a regression rolls back one client; a clean ring promotes', source: 'planned' },
  { id: 'rr-lockfile', parent: 'cp-runner', kind: 'box', owner: 'shift', title: 'Lockfile per client', subtitle: 'exact pins reported up', source: 'planned', rule: 'Makes who-has-what answerable, fan-out selective, and rollback exact.' },
  { id: 'rr-golden', parent: 'cp-runner', kind: 'box', owner: 'shift', title: 'Golden-transcript evals', subtitle: 'fixed real transcripts the brain must beat', source: 'planned', rule: 'Build evals for the monthly-close skill first (the heartbeat), then add per module.' },

  // ── Metering (NEW) ────────────────────────────────────────────────────────
  {
    id: 'cp-metering',
    parent: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'Metering',
    subtitle: 'OpsEvent + UsageRollup',
    source: 'planned',
    isNew: true,
    childLayout: 'grid',
    about:
      'Turns the per-call telemetry into the durable monthly series behind net revenue retention and cost-to-serve. Gets its own audit trail, because a wrong number misprices a subscription.',
  },
  { id: 'cp-opsevent-h', parent: 'cp-metering', kind: 'box', owner: 'shift', title: 'OpsEvent (hardened)', subtitle: 'real Client + Project FK + subscription-line tag', source: 'planned', isNew: true, rule: 'Every gateway and agent call emits a heartbeat, tagged with client and subscription line. Indexed on time for live telemetry, short-lived.' },
  { id: 'cp-usagerollup', parent: 'cp-metering', kind: 'store', owner: 'shift', title: 'UsageRollup', subtitle: 'durable monthly series', source: 'planned', isNew: true, inside: ['clientId, projectId, month, subscriptionLine', 'tokenCostCents, agentRuns, costToServeCents', 'unique on [clientId, projectId, month, subscriptionLine]'], rule: 'Not in the schema today. A monthly job aggregates OpsEvent into this; the rollup is durable, the raw telemetry is not.' },

  // ── Subscription invoicing ────────────────────────────────────────────────
  {
    id: 'cp-invoicing',
    parent: 'control-plane',
    kind: 'box',
    owner: 'shift',
    title: 'Subscription invoicing',
    subtitle: 'platform base + per-module lines',
    source: 'scoped',
    about:
      'The recurring book · the asset the firm is built around. Built bottom-up on the existing BillingInstallment / Invoice engine: a platform-base line plus one line per live module, each tied to a UsageRollup row.',
    rule: 'Keyed to the firm’s own Client, Project, and Invoice rows. Client business data never lands in firm invoicing tables.',
  },
]
