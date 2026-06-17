import type { Entity } from '../../lib/types'

// ZONE 7 · EXTERNAL · bought, not owned.
// The services the firm and its clients run on. Extended, never replaced.
export const external: Entity[] = [
  {
    id: 'external',
    kind: 'box',
    owner: 'external',
    title: 'External · bought, not owned',
    subtitle: 'the services everything runs on',
    source: 'real',
    childLayout: 'grid',
    about: 'Third-party systems the firm and its clients depend on. Reached under controlled terms; never the place IP or client records live.',
  },
  { id: 'ex-claude', parent: 'external', kind: 'terminator', owner: 'external', title: 'Claude API', subtitle: 'zero-retention', source: 'real', rule: 'Reached only through a gateway (the firm’s Quick Actions, or a client’s security gateway). Zero-retention terms. Sanitized context only.' },
  { id: 'ex-infra', parent: 'external', kind: 'terminator', owner: 'external', title: 'Vercel · Supabase', subtitle: 'hosting + data infra', source: 'real', note: 'Each client’s own systems of record (QBO, Dext, Wagepoint, TaxCycle, CRA) live inside that client · see FFW&H → Systems FFW&H runs.' },
  { id: 'ex-ingest', parent: 'external', kind: 'terminator', owner: 'external', title: 'Fireflies · Tally · Gmail ingest', subtitle: 'meetings, forms, email → pending proposals', source: 'real', rule: 'Extracted into pending IngestProposals; a partner approves before anything persists. Nothing auto-writes.' },
]
