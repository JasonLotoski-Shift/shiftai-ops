import type { Conn } from '../lib/types'

// EVERY CONNECTION, declared on the real endpoints.
// The renderer lifts each edge to whatever depth is currently visible: with a
// zone collapsed, an edge into one of its deep nodes draws to the zone box; as
// you expand, it re-anchors to the true node. So the three valves and the
// down-conduit are always visible, just drawn at the right altitude.
//
// `ordering: true` edges are layout-only hints between siblings (drawn faint,
// never lifted) · they stratify a container top-to-bottom.
export const connections: Conn[] = [
  // ── Top-level stratification (Shift-owned on top, boundary, clients, external)
  { source: 'control-plane', target: 'boundary', type: 'one-way', ordering: true },
  { source: 'filing', target: 'boundary', type: 'one-way', ordering: true },
  { source: 'brain', target: 'boundary', type: 'one-way', ordering: true },
  { source: 'platform', target: 'boundary', type: 'one-way', ordering: true },
  { source: 'boundary', target: 'clients', type: 'one-way', ordering: true },
  { source: 'clients', target: 'external', type: 'one-way', ordering: true },

  // ── Inside the control plane ──────────────────────────────────────────────
  { source: 'cp-opsui', target: 'cp-sor', type: 'two-way', label: 'reads / writes · every change → AuditLog' },
  { source: 'cp-mcp', target: 'cp-sor', type: 'two-way', label: 'agent reads + canonical writes' },
  { source: 'cp-telemetry', target: 'cp-opsevent-h', type: 'one-way', label: 'sanitized heartbeat → OpsEvent rows' },
  { source: 'cp-registry', target: 'cp-runner', type: 'one-way', label: 'reverse-dep index → rollout target' },
  { source: 'cp-opsevent-h', target: 'cp-usagerollup', type: 'one-way', label: 'monthly aggregate' },
  { source: 'cp-metering', target: 'cp-invoicing', type: 'one-way', label: 'rollup → invoice lines' },
  // the release runner pipeline (auto-update), step by step
  { source: 'rr-1', target: 'rr-2', type: 'one-way' },
  { source: 'rr-2', target: 'rr-3', type: 'one-way' },
  { source: 'rr-3', target: 'rr-4', type: 'one-way' },
  { source: 'rr-4', target: 'rr-5', type: 'one-way' },
  { source: 'rr-5', target: 'rr-6', type: 'one-way' },
  { source: 'rr-6', target: 'rr-7', type: 'one-way' },
  { source: 'rr-lockfile', target: 'rr-2', type: 'one-way', label: 'who has what' },
  { source: 'rr-golden', target: 'rr-4', type: 'one-way', label: 'gate the brain' },

  // ── Inside filing ─────────────────────────────────────────────────────────
  { source: 'fl-oauth', target: 'fl-claudecode', type: 'one-way' },
  { source: 'fl-claudecode', target: 'fl-drives', type: 'two-way' },

  // ── Inside the brain ──────────────────────────────────────────────────────
  { source: 'br-memory', target: 'br-model', type: 'one-way', label: 'trains on firm memory' },

  // ── Inside the platform ───────────────────────────────────────────────────
  { source: 'pf-doorA', target: 'pf-version', type: 'one-way', label: 'planned release' },
  { source: 'pf-harvest', target: 'pf-version', type: 'one-way', label: 'sanitized pattern (Door B)' },
  { source: 'pf-library', target: 'br-model', type: 'one-way', label: 'a sanitized training source' },
  // the stack’s versioned layer contracts
  { source: 'st-modules', target: 'st-core', type: 'one-way', label: 'Module SDK / API contract · versioned' },
  { source: 'st-core', target: 'st-orch', type: 'one-way', label: 'AI abstraction · modules never call AI directly' },
  { source: 'st-orch', target: 'st-egress', type: 'one-way', label: 'orchestrate, then sanitize & route' },
  { source: 'st-sanitize', target: 'st-adapters', type: 'one-way', label: 'sanitized context only' },

  // ── The down-conduit: Shift ships into a client fork ─────────────────────
  { source: 'pf-template', target: 'ffwh', type: 'one-way', label: 'fork once' },
  { source: 'pf-governance', target: 'ffwh', type: 'one-way', label: 'licensed packages · never source' },
  { source: 'pf-library', target: 'ffwh', type: 'one-way', label: 'library patterns · version bumps' },
  { source: 'pf-version', target: 'cp-runner', type: 'one-way', label: 'a new version kicks off a rollout' },
  { source: 'cp-runner', target: 'ffwh', type: 'one-way', label: 'version-bump PRs · ring rollout' },
  { source: 'cp-runner', target: 'other-clients', type: 'one-way', label: 'each on its own schedule' },

  // ── Control plane ↔ filing ────────────────────────────────────────────────
  { source: 'cp-sor', target: 'fl-drives', type: 'two-way', label: 'pointers (Postgres holds state, Drive holds docs)' },

  // ── THE THREE VALVES ──────────────────────────────────────────────────────
  // V1 · patterns up, never data
  { source: 'ffwh', target: 'pf-harvest', type: 'one-way', valve: 1, label: 'patterns up, never data', detail: 'A person strips every identifier, price, and named workflow before anything is written to the library. Only a sanitized pattern crosses; raw client data never does.' },
  // V3 · metrics up, never records
  { source: 'ff-usage', target: 'cp-metering', type: 'one-way', valve: 3, label: 'metrics only, never records', detail: 'Token counts, run counts, error rates, health. The heartbeat schema rejects content fields. Business records never leave the client VPC.' },
  // V2 · one client never reaches another
  { source: 'ffwh', target: 'other-clients', type: 'never', valve: 2, label: 'never cross', detail: 'Separate repos, databases, gateways, and Drives. There is no path from one client’s system to another’s. The only shared thing is the sanitized library.' },
  { source: 'cl-eng', target: 'cl-builder', type: 'never', valve: 2 },

  // ── Clients reach the external boundary ──────────────────────────────────
  { source: 'ff-gateway', target: 'ex-claude', type: 'one-way', label: 'PII stripped · zero-retention' },
  { source: 'ff-engine', target: 'ff-external', type: 'two-way', label: 'prep & stage · agents never move money' },
  { source: 'st-adapters', target: 'ex-claude', type: 'one-way', label: 'Claude and others · zero-retention' },
  { source: 'cp-opsui', target: 'ex-claude', type: 'two-way', label: 'firm Quick Actions · zero-retention' },
  { source: 'ex-ingest', target: 'cp-sor', type: 'one-way', label: 'meetings, forms, email → pending proposals' },

  // ── Inside FFW&H · stratify the instance top-to-bottom ───────────────────
  { source: 'ff-spine', target: 'ff-pillars', type: 'one-way', ordering: true },
  { source: 'ff-pillars', target: 'ff-engine', type: 'one-way', ordering: true },
  { source: 'ff-engine', target: 'ff-foundation', type: 'one-way', ordering: true },
  { source: 'ff-foundation', target: 'ff-rules', type: 'one-way', ordering: true },
  { source: 'ff-rules', target: 'ff-external', type: 'one-way', ordering: true },

  // FFW&H engine wiring · agents route to the tier gate, which logs every decision
  { source: 'ac-fleet', target: 'ff-tierengine', type: 'one-way', label: 'every agent action routes to its gate' },
  { source: 'ff-tierengine', target: 'ff-auditspine', type: 'one-way', label: 'every decision logged: reviewer, timestamp, diff' },
  // Privilege wall between pillars (RLS at the DB layer). A hard wall, but not
  // one of the three firm valves — those are cross-client / firm-boundary.
  { source: 'ff-acct', target: 'ff-legal', type: 'never', label: 'privilege wall · RLS at the DB layer', detail: 'Accounting cannot read legal matters or privileged work product, and vice-versa, enforced by row-level security at the database layer. FINTRAC obligations stay parked in Legal.' },
  // Cross-pillar event bus (Phase 2 pattern): accounting publishes, others subscribe
  { source: 'ff-acct', target: 'ff-eventbus', type: 'one-way', label: 'publishes revenue, cash, opportunity flags' },
  { source: 'ff-eventbus', target: 'ff-legal', type: 'one-way', label: 'pillars subscribe' },

  // Inside the accounting pillar
  { source: 'ac-fleet', target: 'ac-tiermap', type: 'one-way', ordering: true },
  { source: 'ac-tiermap', target: 'ac-close', type: 'one-way', ordering: true },
  { source: 'ac-close', target: 'ac-sops', type: 'one-way', ordering: true },
  // the monthly close, in order
  { source: 'cl-intake', target: 'cl-cat', type: 'one-way' },
  { source: 'cl-cat', target: 'cl-recon', type: 'one-way' },
  { source: 'cl-recon', target: 'cl-review', type: 'one-way' },
  { source: 'cl-review', target: 'cl-stmt', type: 'one-way', label: 'nothing posts until the gate clears' },
  { source: 'cl-stmt', target: 'cl-pkg', type: 'one-way' },

  // ── Inside the enterprise client ──────────────────────────────────────────
  { source: 'en-identity', target: 'en-org', type: 'one-way', ordering: true },
  { source: 'en-org', target: 'en-access', type: 'one-way', ordering: true },
  { source: 'en-access', target: 'en-storage', type: 'one-way', ordering: true },
  { source: 'en-storage', target: 'en-class', type: 'one-way', label: 'classification drives who reads it' },
  { source: 'en-class', target: 'en-integration', type: 'one-way', ordering: true },
  { source: 'en-integration', target: 'en-systems', type: 'two-way', label: 'extends, does not replace' },
  { source: 'en-class', target: 'en-rule', type: 'one-way', ordering: true },
  { source: 'en-rule', target: 'en-brain', type: 'one-way' },
  { source: 'en-brain', target: 'en-request', type: 'one-way', ordering: true },
  // org chain
  { source: 'en-orgz', target: 'en-bu', type: 'one-way' },
  { source: 'en-bu', target: 'en-team', type: 'one-way' },
  { source: 'en-team', target: 'en-user', type: 'one-way' },
  // one request, in order
  { source: 'rq-signin', target: 'rq-scope', type: 'one-way' },
  { source: 'rq-scope', target: 'rq-read', type: 'one-way' },
  { source: 'rq-read', target: 'rq-sanitize', type: 'one-way' },
  { source: 'rq-sanitize', target: 'rq-model', type: 'one-way', label: 'allowed data only' },
  { source: 'rq-model', target: 'rq-return', type: 'one-way', label: 'return + log' },
]
