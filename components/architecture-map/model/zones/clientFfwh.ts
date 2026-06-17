import type { Entity } from '../../lib/types'

// ZONE 6 · CLIENT INSTANCES, and the reference build: FFW&H, end to end.
// The clients zone holds every client fork. FFW&H is the only real one (in
// build); the example clients and the enterprise-scale client are added in
// their own files under this same zone. Each instance is a runnable fork in a
// repo the client controls, behind its own gateway, touching no other client.
// Grounded in shiftai-clients/ffwh (the 22-SOP scoping, the agent fleet, the
// tier mappings, the monthly-close mockup).
export const clients: Entity[] = [
  {
    id: 'clients',
    kind: 'box',
    owner: 'client',
    title: 'Client instances',
    subtitle: 'the fleet · one core, many forks',
    source: 'in-build',
    childLayout: 'grid',
    about:
      'The same shared core, forked into a system per client. Each runs different modules, holds its own data, sits behind its own gateway, and reaches no other client. A library fix ships to each as a reviewed PR; usage rolls up into one NRR number. This is the shape that scales to twenty.',
    rule: 'Valve 2. Separate repos, databases, gateways, and Drives. The only thing shared across clients is the sanitized library.',
  },

  // ── FFW&H · the reference build ───────────────────────────────────────────
  {
    id: 'ffwh',
    parent: 'clients',
    kind: 'box',
    owner: 'client',
    title: 'FFW&H',
    subtitle: 'professional services · in build',
    source: 'in-build',
    status: { text: 'in build', tone: 'gold' },
    pin: 'core v2.4',
    childLayout: 'graph',
    childDir: 'TB',
    chips: [
      { label: 'Client OS', kind: 'custom' },
      { label: 'Accounting close', kind: 'lib' },
      { label: 'Document vault', kind: 'lib' },
      { label: 'Compliance gates', kind: 'custom' },
    ],
    about:
      'One client fully wired: a Client OS spine, six service pillars (accounting first), the engine where agents draft and humans gate, the foundation in FFW&H’s own environment, and the exact points where a licensed human has to sign. Own repo · own data · own gateway (VPC).',
    rule: 'The firm ships down (forked template, pinned packages, library PRs) and reads up (token + health heartbeat, never records). FFW&H controls the repo; the firm keeps it current. A buy-out transfers this fork only.',
  },

  // 01 · Client OS spine
  {
    id: 'ff-spine',
    parent: 'ffwh',
    kind: 'box',
    owner: 'client',
    title: 'Client OS spine',
    subtitle: 'one record, every pillar',
    source: 'in-build',
    childLayout: 'grid',
    about: 'Built before any pillar tool. One shared record and the cross-pillar plumbing the six pillars all hang off.',
  },
  { id: 'ff-master', parent: 'ff-spine', kind: 'box', owner: 'client', title: 'Master client record', subtitle: 'hundreds of fields, collected once', source: 'in-build', rule: 'Per-pillar intake forms feed one record. Conflicting updates are flagged for manual review, never silently overwritten.' },
  { id: 'ff-roledash', parent: 'ff-spine', kind: 'box', owner: 'client', title: 'Role dashboard', subtitle: 'partner hat-gating', source: 'in-build', rule: 'Each partner sees only their pillars: Robert → Accounting, Steven → Legal + Mortgage, Jaeger → Insurance + Marketing, Jasmine → Legal + Immigration. Jason sees everything.' },
  { id: 'ff-eventbus', parent: 'ff-spine', kind: 'box', owner: 'client', title: 'Event bus', subtitle: 'cross-pillar signals', source: 'scoped', example: true, rule: 'Accounting publishes revenue trends, cash position, incorporation / restructure / key-person / asset flags; the other pillars subscribe. Pattern defined, wiring is Phase 2.' },
  { id: 'ff-lifecycle', parent: 'ff-spine', kind: 'box', owner: 'client', title: 'Lifecycle calendar', subtitle: 'the thousands-of-deadlines problem', source: 'scoped', rule: 'Encodes every client’s year-end, GST frequency, payroll cadence, T-slip dates, the ROE 5-day clock, the T183CORP gate. Karbon is the benchmark and the fallback buy.' },
  { id: 'ff-comms', parent: 'ff-spine', kind: 'box', owner: 'client', title: 'Comms coordinator', subtitle: 'batched client contact', source: 'scoped', rule: 'Tier A. Batches every pillar’s touchpoints over 48h into one on-brand message, so the client is not emailed five times.' },

  // 02 · Six pillars
  {
    id: 'ff-pillars',
    parent: 'ffwh',
    kind: 'box',
    owner: 'client',
    title: 'Six pillars',
    subtitle: 'one shared record',
    source: 'scoped',
    childLayout: 'grid',
    about: 'Build the accounting pillar to the gate, prove the close runs every month, and the same shape carries the next five.',
  },
  // Accounting · the pillar in build, with its own deep subtree (acctPillar.ts)
  {
    id: 'ff-acct',
    parent: 'ff-pillars',
    kind: 'box',
    owner: 'client',
    title: '01 Accounting',
    subtitle: '22 SOPs · close first',
    source: 'in-build',
    status: { text: 'in build', tone: 'gold' },
    childLayout: 'graph',
    childDir: 'TB',
    about:
      'KleenBooks Inc. · Robert, CPA. 22 SOPs across bookkeeping, financial statements, and corporate tax, in four cycles (monthly, quarterly, annual, continuous). The monthly close is the heartbeat; every artifact is gated by the tier of its SOP.',
  },
  { id: 'ff-legal', parent: 'ff-pillars', kind: 'box', owner: 'client', title: '02 Legal', subtitle: 'FINTRAC + trust accounts sit here', source: 'scoped', status: { text: 'active practice', tone: 'steel' }, rule: 'A mature revenue stream. Build unlocks when Jasmine joins (~Jul 2026). Privilege wall to Accounting, enforced by RLS at the database layer.' },
  { id: 'ff-immig', parent: 'ff-pillars', kind: 'box', owner: 'client', title: '03 Immigration', subtitle: 'with legal', source: 'scoped', status: { text: 'confirmed', tone: 'muted' }, example: true },
  { id: 'ff-mort', parent: 'ff-pillars', kind: 'box', owner: 'client', title: '04 Mortgage', subtitle: 'brokering funnel', source: 'scoped', status: { text: 'active', tone: 'steel' }, example: true },
  { id: 'ff-ins', parent: 'ff-pillars', kind: 'box', owner: 'client', title: '05 Insurance + wealth', subtitle: 'LLQP pending', source: 'planned', status: { text: 'pre-launch', tone: 'muted' }, example: true },
  { id: 'ff-mkt', parent: 'ff-pillars', kind: 'box', owner: 'client', title: '06 Marketing', subtitle: 'internal + external', source: 'planned', status: { text: 'later', tone: 'muted' }, example: true },

  // 03 · Engine (the shared per-client engine; agents are pillar-specific)
  {
    id: 'ff-engine',
    parent: 'ffwh',
    kind: 'box',
    owner: 'shift',
    title: 'Engine · agents draft, humans gate',
    subtitle: 'the shared per-client engine',
    source: 'in-build',
    childLayout: 'grid',
    about: 'Shipped in from the governance packages. Routes every agent action to its gate and logs every decision.',
  },
  { id: 'ff-tierengine', parent: 'ff-engine', kind: 'gate', owner: 'shift', title: 'Tier engine (A / B / C)', subtitle: 'routes every action to its gate', source: 'in-build', rule: 'Blocks the downstream write until cleared. A autonomous · B human review · C licensed sign-off.' },
  { id: 'ff-auditspine', parent: 'ff-engine', kind: 'box', owner: 'shift', title: 'Audit & gate spine', subtitle: 'reviewer, timestamp, diff', source: 'in-build', rule: 'Append-only. Every gate decision logs who proposed, the confidence, the reviewer, the tier cleared, and the draft-vs-final diff. This is the Rule 218 working paper and the liability defense; retained 7 years.' },

  // 04 · Foundation in FFW&H's own environment
  {
    id: 'ff-foundation',
    parent: 'ffwh',
    kind: 'box',
    owner: 'client',
    title: 'Foundation · FFW&H’s own environment',
    subtitle: 'their data, their cloud',
    source: 'in-build',
    childLayout: 'grid',
  },
  { id: 'ff-db', parent: 'ff-foundation', kind: 'store', owner: 'client', title: 'FFW&H Supabase', subtitle: 'RLS + pgAudit, ca-central', source: 'in-build', rule: 'Row-level security enforces the privilege wall (Legal ⟷ Accounting) and per-client blockage walls at the database layer, so an app bug cannot cross a wall. pgAudit logs all access; an append-only table blocks UPDATE/DELETE.' },
  { id: 'ff-vault', parent: 'ff-foundation', kind: 'store', owner: 'client', title: 'Document vault', subtitle: 'Client → Engagement → Period → Document', source: 'in-build', rule: 'Versioned, searchable, retention-class tagged with a computed destroy-not-before date (CRA 6yr, working papers 7yr, T183CORP 6yr-from-filing). Destruction requires Robert’s approval, never an agent.' },
  { id: 'ff-gateway', parent: 'ff-foundation', kind: 'gate', owner: 'shift', title: 'Security gateway', subtitle: 'PII stripped locally, then zero-retention', source: 'in-build', rule: 'A local Presidio-based parser strips account numbers and names and replaces them with reversible tokens before any prompt leaves FFW&H’s environment. After the model returns categories and figures, a local map re-attaches the real values. We redact identifiers, never the math. Shift IP, in the client’s VPC.' },
  { id: 'ff-usage', parent: 'ff-foundation', kind: 'box', owner: 'client', title: 'Usage meter', subtitle: 'the only thing that travels up', source: 'in-build', rule: 'Valve 3. Token counts, run counts, error rates, health · no record payloads.' },

  // 05 · Three hard rules
  {
    id: 'ff-rules',
    parent: 'ffwh',
    kind: 'principle',
    owner: 'shift',
    title: 'Prep and stage, never file. Agents never move money. PII stripped before any model call.',
    subtitle:
      'Of the 22 SOPs, zero are “the agent files it” at a government · there is no public CRA, eTaxBC, or ROE-Web API to call. The system does 95% of the prep and hands a licensed human a validated, signature-gated, ready-to-file state. Enforced in code by the guards package, not by convention.',
    source: 'in-build',
    w: 560,
    rule: 'Agents never move money keeps FINTRAC obligations parked in the Legal pillar. A real CPA firm took a $72,750 FINTRAC penalty in 2025 · so the guardrail is code, not a policy note.',
  },

  // 06 · External systems FFW&H runs
  {
    id: 'ff-external',
    parent: 'ffwh',
    kind: 'box',
    owner: 'external',
    title: 'Systems FFW&H runs',
    subtitle: 'extended, never replaced',
    source: 'real',
    childLayout: 'grid',
    about: 'Agents prep and stage inside these; a human files and moves money. QBO has hard API limits; the major government channels have no public API at all.',
  },
  { id: 'ff-qbo', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'QuickBooks Online', subtitle: 'system of record', source: 'real', rule: 'Agent reads and writes via the Accounting + Reports API. Write-only POST with a required SyncToken; no “For Review” queue exposed; Reports API v2 cutover is June 30, 2026.' },
  { id: 'ff-dext', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'Dext', subtitle: 'receipt + invoice OCR (~99%)', source: 'real' },
  { id: 'ff-wagepoint', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'Wagepoint', subtitle: 'payroll provider', source: 'real', rule: 'Agent reads pay-period data and drafts the remittance instruction. The client executes the payment · the agent never moves money.' },
  { id: 'ff-flinks', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'Bank feed / Flinks', subtitle: 'raw transaction source', source: 'real' },
  { id: 'ff-taxcycle', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'TaxCycle', subtitle: 'T2 prep + certified EFILE', source: 'real', rule: 'Agent populates the schedules; Robert (the EFILE-number holder) reviews and transmits. A signed T183CORP must be in the vault first.' },
  { id: 'ff-cra', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'CRA channels', subtitle: 'My Business Account · EFILE · Internet File Transfer', source: 'real', rule: 'No public API. Agent stages the return to the submission screen or generates valid XML; a human logs in and files.' },
  { id: 'ff-prov', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'eTaxBC · WorkSafeBC', subtitle: 'provincial portals, human login', source: 'real', rule: 'No API. Agent computes and drafts; a delegated human keys it in.' },
  { id: 'ff-roe', parent: 'ff-external', kind: 'terminator', owner: 'external', title: 'ROE Web', subtitle: 'the one automated transmit path', source: 'real', rule: 'Agent generates the ROE Web V2.0 XML (.BLK); a human reviews; upload via Bulk Transfer or SAT. The only government channel with a true automated path.' },
  // FFW&H reaches Claude through its gateway → the one external Claude API node
  // (external zone). See connections.ts; with External collapsed, that edge
  // lifts to FFW&H → External.
]
