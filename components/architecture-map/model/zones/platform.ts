import type { Entity } from '../../lib/types'

// ZONE 4 · PLATFORM CORE + PATTERN LIBRARY.
// The shared thing the firm builds once and owns: a fork-once template, the
// governance packages that ship as pinned licenses, the Pattern Library that
// fills from real work, the harvest gate that guards it, and the four-layer
// stack underneath. This is what the subscription ports into the next client.
// Grounded in architecture-stack-wireframe.html, architecture-improvement-
// stream.html, systems-architecture-map.html.
export const platform: Entity[] = [
  {
    id: 'platform',
    kind: 'box',
    owner: 'shift',
    title: 'Platform core + Pattern Library',
    subtitle: 'built once, owned, forked per client',
    source: 'scoped',
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'The asset. A shared core the firm owns and ships as a per-client fork, governance pieces as pinned licensed packages, and a library of sanitized patterns that grows one engagement at a time.',
    rule: 'Patterns flow down into client forks. Client data never flows up. A buy-out transfers a client’s fork only · never the shared core, the library, or another client’s data.',
  },

  // ── shift-client-os template ──────────────────────────────────────────────
  {
    id: 'pf-template',
    parent: 'platform',
    kind: 'box',
    owner: 'shift',
    title: 'shift-client-os template',
    subtitle: 'the fork-once skeleton',
    source: 'planned',
    isNew: true,
    childLayout: 'grid',
    about:
      'The one repo every client is forked from. Extracted by building FFW&H as the reference, then generalized · at client #2, not over-built at #1.',
    rule: 'The only one-time copy path. Forked into a repo the client controls.',
    inside: [
      'repo layout + per-client CLAUDE.md (engagement + isolation boundary)',
      'client.config.ts · modules on/off, A/B/C tier map, connectors, brand',
      'package.json pinning @shift/gateway, @shift/tier-engine, @shift/guards',
      'modules/ (custom-only code) · supabase/ (own schema) · deploy/ (their VPC or Shift-hosted)',
    ],
  },

  // ── Governance packages ───────────────────────────────────────────────────
  {
    id: 'pf-governance',
    parent: 'platform',
    kind: 'box',
    owner: 'shift',
    title: 'Governance packages',
    subtitle: 'the security wedge, as pinned licenses',
    source: 'scoped',
    isNew: true,
    childLayout: 'grid',
    about:
      'The three governance pieces ship as pinned, licensed packages · never vendored source. The client gets a license to the pinned version, not title, so a buy-out cannot capture the core.',
    rule: 'Sold as the security opener: enterprise zero-retention terms, private deployment, one audited gateway. The owned model stays internal R&D, never messaged.',
  },
  { id: 'pf-gw-pkg', parent: 'pf-governance', kind: 'gate', owner: 'shift', title: 'Gateway + DLP', subtitle: 'one audited path out, PII stripped', source: 'scoped', isNew: true, rule: 'No model call bypasses it. PII is stripped locally before any prompt leaves the client environment.' },
  { id: 'pf-tier-pkg', parent: 'pf-governance', kind: 'gate', owner: 'shift', title: 'Tier engine (A / B / C)', subtitle: 'blocks the write until a human clears it', source: 'scoped', isNew: true, rule: 'A autonomous · B human review · C licensed sign-off. Enforced in code, not by convention.' },
  { id: 'pf-guards-pkg', parent: 'pf-governance', kind: 'gate', owner: 'shift', title: 'Money / filing guards', subtitle: 'agents never move money or file', source: 'scoped', isNew: true, rule: 'Prep and stage, never file. Agents never move money. Hard-blocked at the code layer.' },

  // ── Pattern Library ───────────────────────────────────────────────────────
  {
    id: 'pf-library',
    parent: 'platform',
    kind: 'store',
    owner: 'shift',
    title: 'Pattern Library',
    subtitle: 'versioned, sanitized modules + taxonomy',
    source: 'scoped',
    isNew: true,
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'What the subscription ports into the next client. It starts empty and fills only from real work, through the harvest gate. Whether patterns port across different firms (not only across modules in one firm) is unproven · the $30K reuse probe measures it before the release machinery is over-built.',
    rule: 'Library to client only. Never client to library. Each module is a semver-versioned artifact; clients pin exact versions in a lockfile.',
  },
  { id: 'pf-taxonomy', parent: 'pf-library', kind: 'box', owner: 'shift', title: 'Taxonomy by capability', subtitle: 'accounting close · dispatch · invoicing sync · approvals · doc vault', source: 'scoped', isNew: true },
  { id: 'pf-primitives', parent: 'pf-library', kind: 'box', owner: 'shift', title: 'Shared primitives', subtitle: 'connectors · agents · UI · compliance-gate guards', source: 'scoped', isNew: true },

  // The versioned-artifact layer · what "a pattern" actually is. The real ops
  // skills are the working proof of the Skills row today.
  {
    id: 'pf-artifacts',
    parent: 'pf-library',
    kind: 'box',
    owner: 'shift',
    title: 'Versioned artifacts',
    subtitle: 'everything we ship is semver-pinned',
    source: 'scoped',
    childLayout: 'grid',
    about:
      'The unit of reuse. Each is independently versioned and pinned by the clients that use it, so a fix bumps a version and flows out as PRs.',
  },
  { id: 'pf-a-skills', parent: 'pf-artifacts', kind: 'box', owner: 'shift', title: 'Skills', subtitle: 'agent brains: prompts + logic', source: 'real', about: 'The firm already runs 30+ skills in shiftai-ops/skills/, each with its own SKILL.md loaded at runtime. The _firm/context.md brain is prepended to every call and edited by PR only.', inside: ['draft-email, cold-outreach, enrich-contact, find-people-web', 'discovery-prep, discovery-report, scope, sow', 'onboard-client (fires on convert), harvest-engagement (fires on close)', 'lead-discovery-apollo / -firecrawl, lead-positioning, lead-rating, segment-optimizer'] },
  { id: 'pf-a-modules', parent: 'pf-artifacts', kind: 'box', owner: 'shift', title: 'Modules', subtitle: 'capabilities: code, UI, config', source: 'scoped' },
  { id: 'pf-a-agents', parent: 'pf-artifacts', kind: 'box', owner: 'shift', title: 'Agents & workflows', subtitle: 'orchestration, tier maps, SOPs', source: 'scoped' },
  { id: 'pf-a-core', parent: 'pf-artifacts', kind: 'box', owner: 'shift', title: 'Core packages', subtitle: 'gateway, tier engine, connectors', source: 'scoped' },

  // Two doors into the library · where a new version is born. Door A is a
  // planned release from the team; the other door is the harvest gate below.
  { id: 'pf-doorA', parent: 'pf-library', kind: 'box', owner: 'shift', title: 'Door A · team iterates', subtitle: 'sharpen the artifact in the shared repo', source: 'scoped', rule: 'A planned release. No client data involved. (Door B is the harvest gate · a pattern lifted from a real client build.)' },
  { id: 'pf-version', parent: 'pf-library', kind: 'store', owner: 'shift', title: 'A new semver version', subtitle: 'each lives once, pinned by its users', source: 'scoped', rule: 'Door A (team) and the harvest gate (Door B) both converge here. From here the release runner finds who pins it and ships it as reviewed PRs.' },

  // ── Harvest gate (Valve 1) ───────────────────────────────────────────────
  {
    id: 'pf-harvest',
    parent: 'platform',
    kind: 'gate',
    owner: 'shift',
    title: 'Harvest gate',
    subtitle: 'sanitize before promote',
    source: 'scoped',
    isNew: true,
    about:
      'A person walks a client build and proposes lifts. Before anything is written to the library, every identifier, price, and named workflow is stripped.',
    rule: 'Valve 1. Only a sanitized pattern crosses, through a person. Raw client data never does. The result carries a manifest asserting Shift ownership and the license-back.',
  },

  // ── THE STACK · four layers, versioned contracts ─────────────────────────
  {
    id: 'pf-stack',
    parent: 'platform',
    kind: 'box',
    owner: 'shift',
    title: 'The platform stack',
    subtitle: 'modules → core → AI foundation',
    source: 'scoped',
    childLayout: 'graph',
    childDir: 'TB',
    about:
      'Steve’s layering, reconciled to the model the firm set: pluggable modules on top, a stable core beneath, the AI foundation underneath, every layer joined by a versioned contract. The whole stack ships as the per-client fork.',
  },

  // Layer 1 · business modules
  {
    id: 'st-modules',
    parent: 'pf-stack',
    kind: 'box',
    owner: 'shift',
    title: 'Business modules',
    subtitle: 'pluggable, enabled per client in config',
    source: 'scoped',
    childLayout: 'grid',
    rule: 'Independently deployable. Enabled per client in client.config.ts; patterns come from the library. Modules never call AI directly.',
  },
  { id: 'st-crm', parent: 'st-modules', kind: 'box', owner: 'shift', title: 'CRM', subtitle: 'contacts, pipeline', source: 'scoped' },
  { id: 'st-inv', parent: 'st-modules', kind: 'box', owner: 'shift', title: 'Invoicing', subtitle: 'billing, AR', source: 'scoped' },
  { id: 'st-sched', parent: 'st-modules', kind: 'box', owner: 'shift', title: 'Scheduling', subtitle: 'dispatch, calendar', source: 'scoped' },
  { id: 'st-acct', parent: 'st-modules', kind: 'box', owner: 'shift', title: 'Accounting close', subtitle: 'the FFW&H pillar in build', source: 'in-build', status: { text: 'in build', tone: 'gold' } },
  { id: 'st-custom', parent: 'st-modules', kind: 'box', owner: 'client', title: '+ Custom module', subtitle: 'client-specific, plug in any time', source: 'scoped', example: true },

  // Layer 2 · core platform
  {
    id: 'st-core',
    parent: 'pf-stack',
    kind: 'box',
    owner: 'shift',
    title: 'Core platform',
    subtitle: 'versioned, licensed packages',
    source: 'scoped',
    childLayout: 'grid',
    rule: 'The stable base. Ships as versioned licensed packages into each client fork, updated independently of the modules.',
  },
  { id: 'st-auth', parent: 'st-core', kind: 'box', owner: 'shift', title: 'User & auth', subtitle: 'SSO, roles, MFA', source: 'scoped' },
  { id: 'st-apigw', parent: 'st-core', kind: 'box', owner: 'shift', title: 'API gateway', subtitle: 'rate limit, routing', source: 'scoped' },
  { id: 'st-audit', parent: 'st-core', kind: 'box', owner: 'shift', title: 'Audit & logging', subtitle: 'compliance trail, the gate spine', source: 'scoped' },
  { id: 'st-billing', parent: 'st-core', kind: 'box', owner: 'shift', title: 'Billing & plans', subtitle: 'subscriptions, usage, NRR', source: 'scoped' },
  { id: 'st-events', parent: 'st-core', kind: 'box', owner: 'shift', title: 'Events / webhooks', subtitle: 'module messaging', source: 'scoped' },
  { id: 'st-isolation', parent: 'st-core', kind: 'box', owner: 'client', title: 'Per-client isolation', subtitle: 'own repo, database, gateway, Drive', source: 'scoped', revised: true, rule: 'Not one shared tenant pool. The model rests on the client keeping a runnable version of its own.' },

  // Layer 3a · AI foundation: orchestration engine
  {
    id: 'st-orch',
    parent: 'pf-stack',
    kind: 'box',
    owner: 'shift',
    title: 'AI foundation · orchestration engine',
    subtitle: 'makes model calls safe and cheap',
    source: 'scoped',
    childLayout: 'grid',
    rule: 'Runs inside the client’s own gateway. The core reaches it through a versioned AI-abstraction interface; modules never call AI directly.',
  },
  { id: 'st-prompt', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Prompt engine', subtitle: 'templates, versioning', source: 'scoped' },
  { id: 'st-queue', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Queue & rate limit', subtitle: 'async, retry, backoff', source: 'scoped' },
  { id: 'st-parser', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Response parser', subtitle: 'extract structure from text', source: 'scoped' },
  { id: 'st-routing', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Routing logic', subtitle: 'local vs external rules', source: 'scoped' },
  { id: 'st-cache', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Response cache', subtitle: 'semantic dedup, TTL', source: 'scoped' },
  { id: 'st-observ', parent: 'st-orch', kind: 'box', owner: 'shift', title: 'Observability', subtitle: 'costs, latency, errors → metering', source: 'scoped' },

  // Layer 3b · AI foundation: egress & governance
  {
    id: 'st-egress',
    parent: 'pf-stack',
    kind: 'box',
    owner: 'shift',
    title: 'AI foundation · egress & governance',
    subtitle: 'one audited path out',
    source: 'scoped',
    childLayout: 'grid',
    rule: 'PII stripped at the gate, zero-retention terms, private deployment. This is the security story.',
  },
  { id: 'st-sanitize', parent: 'st-egress', kind: 'gate', owner: 'shift', title: 'Sanitization gate', subtitle: 'strip PII before any external call', source: 'scoped', rule: 'Nothing leaves raw.' },
  { id: 'st-adapters', parent: 'st-egress', kind: 'terminator', owner: 'external', title: 'External AI adapters', subtitle: 'Claude and others · zero-retention', source: 'real', rule: 'Sanitized context only. Zero-retention terms. When the internal model exists (see Business brain) it becomes another routing target here.' },
]
