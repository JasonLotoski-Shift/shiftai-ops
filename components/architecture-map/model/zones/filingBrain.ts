import type { Entity } from '../../lib/types'

// ZONE 2 · FILING & IDENTITY, and ZONE 3 · BUSINESS BRAIN.
// Two small Shift-owned zones. Filing is how the firm’s documents and identity
// are organized; the brain is the firm’s own memory and its quarantined model
// R&D track. Grounded in systems-architecture-map.html and strategy-2026-06-13.

export const filing: Entity[] = [
  {
    id: 'filing',
    kind: 'box',
    owner: 'shift',
    title: 'Filing & identity',
    subtitle: 'Workspace + Drives + Claude Code',
    source: 'real',
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'How the firm files documents and proves who is acting. Postgres holds pointers and state; Google Drive holds the documents themselves.',
  },
  {
    id: 'fl-drives',
    parent: 'filing',
    kind: 'store',
    owner: 'shift',
    title: 'Google Shared Drives',
    subtitle: 'one root folder per client',
    source: 'real',
    rule: 'One client folder at a time. Cannot read the 90-Sensitive area. Drive holds documents; Postgres holds the pointers.',
  },
  { id: 'fl-oauth', parent: 'filing', kind: 'box', owner: 'shift', title: 'Workspace OAuth', subtitle: 'identity + scopes', source: 'real' },
  {
    id: 'fl-claudecode',
    parent: 'filing',
    kind: 'box',
    owner: 'shift',
    title: 'Claude Code',
    subtitle: 'launched per-client folder',
    source: 'real',
    rule: 'Reads and writes documents for the one client folder it was launched in. Cannot see another client’s folder.',
  },
]

export const brain: Entity[] = [
  {
    id: 'brain',
    kind: 'box',
    owner: 'shift',
    title: 'Business brain',
    subtitle: 'firm memory + quarantined model R&D',
    source: 'real',
    childLayout: 'graph',
    childDir: 'LR',
    about:
      'The firm’s own memory of every engagement, and a separate, quarantined research track toward an internal model. The memory is real and in use; the model is unpriced R&D that may never ship and is never messaged.',
  },
  {
    id: 'br-memory',
    parent: 'brain',
    kind: 'store',
    owner: 'shift',
    title: 'Firm engagement memory',
    subtitle: 'ops Postgres + AuditLog + telemetry',
    source: 'real',
    about:
      'The firm’s record of engagement state, pipeline, projects, and work history · what shapes the next proposal and what the harvest gate draws sanitized patterns from.',
    rule: 'Firm-internal only. Never includes a client’s runtime data.',
  },
  {
    id: 'br-model',
    parent: 'brain',
    kind: 'box',
    owner: 'rnd',
    title: 'Internal model',
    subtitle: 'future · rented GPUs · unpriced',
    source: 'planned',
    about:
      'A research track only. If it is ever built, it trains on the sanitized Pattern Library and firm memory, on rented GPUs. The firm never owns hardware, and never prices or messages an internal model until it exists and is ring-fenced.',
    rule: 'Trains only on the sanitized library and firm memory. Never client runtime data. Never owned hardware. Never messaged or priced.',
  },
]
