import type { Entity } from '../../lib/types'

// THE ENTERPRISE-SCALE CLIENT · a child of the clients zone.
// The same per-client fork, scaled inside: 1,000 employees, many business
// units, the platform as their central operating system. The work that grows
// is identity, access, and data partitioning. Multi-tenancy lives here, across
// one client’s business units · never across clients.
// Grounded in architecture-enterprise-client.html.
export const enterprise: Entity[] = [
  {
    id: 'ent',
    parent: 'clients',
    kind: 'box',
    owner: 'client',
    title: 'Enterprise-scale client',
    subtitle: 'example · 1,000 employees, many BUs',
    source: 'planned',
    example: true,
    childLayout: 'graph',
    childDir: 'TB',
    about:
      'How one client fork scales to an enterprise. The structure is the same; what grows is identity (SSO, SCIM), an Org→BU→Team→User model, and an access layer the brain obeys exactly as a person does.',
    rule: 'Multi-tenancy lives here, across business units, never across clients.',
  },

  // Identity & user gates
  {
    id: 'en-identity',
    parent: 'ent',
    kind: 'box',
    owner: 'client',
    title: 'Identity & user gates',
    subtitle: 'provisioned from their systems',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-sso', parent: 'en-identity', kind: 'box', owner: 'client', title: 'SSO via their IdP', subtitle: 'Okta, Entra, or Google · SAML / OIDC', source: 'planned' },
  { id: 'en-scim', parent: 'en-identity', kind: 'box', owner: 'client', title: 'SCIM provisioning', subtitle: 'accounts created / deactivated from HRIS', source: 'planned' },
  { id: 'en-svc', parent: 'en-identity', kind: 'box', owner: 'client', title: 'Service accounts', subtitle: 'non-human identities, least privilege', source: 'planned' },

  // Org model
  {
    id: 'en-org',
    parent: 'ent',
    kind: 'box',
    owner: 'client',
    title: 'Org model',
    subtitle: 'Org → BU → Team → User',
    source: 'planned',
    childLayout: 'flow',
    childDir: 'LR',
  },
  { id: 'en-orgz', parent: 'en-org', kind: 'box', owner: 'client', title: 'Organization', subtitle: 'the client', source: 'planned' },
  { id: 'en-bu', parent: 'en-org', kind: 'box', owner: 'client', title: 'Business unit', subtitle: 'many', source: 'planned' },
  { id: 'en-team', parent: 'en-org', kind: 'box', owner: 'client', title: 'Team', subtitle: 'department', source: 'planned' },
  { id: 'en-user', parent: 'en-org', kind: 'box', owner: 'client', title: 'User', subtitle: 'role + attributes', source: 'planned' },

  // Access control
  {
    id: 'en-access',
    parent: 'ent',
    kind: 'box',
    owner: 'shift',
    title: 'Access control',
    subtitle: 'Shift IP · the brain obeys it too',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-rbac', parent: 'en-access', kind: 'box', owner: 'shift', title: 'RBAC · roles', subtitle: 'admin, BU lead, manager, member, viewer · what a role can do', source: 'planned' },
  { id: 'en-abac', parent: 'en-access', kind: 'box', owner: 'shift', title: 'ABAC · attributes', subtitle: 'BU, region, department, classification · what this person can see', source: 'planned' },

  // Storage partitioned by BU
  {
    id: 'en-storage',
    parent: 'ent',
    kind: 'box',
    owner: 'client',
    title: 'Storage, partitioned by BU',
    subtitle: 'all in the client’s own cloud',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-opdb', parent: 'en-storage', kind: 'store', owner: 'client', title: 'Operational database', subtitle: 'Postgres + row-level security, per BU', source: 'planned' },
  { id: 'en-docstore', parent: 'en-storage', kind: 'store', owner: 'client', title: 'Document store', subtitle: 'their SharePoint or Drive, permissioned', source: 'planned' },
  { id: 'en-warehouse', parent: 'en-storage', kind: 'store', owner: 'client', title: 'Data warehouse', subtitle: 'Snowflake or BigQuery for scale reads', source: 'planned' },
  { id: 'en-residency', parent: 'en-storage', kind: 'box', owner: 'client', title: 'Residency + retention', subtitle: 'region-pinned, legal hold, retention rules', source: 'planned' },

  // Data classification
  {
    id: 'en-class',
    parent: 'ent',
    kind: 'box',
    owner: 'shift',
    title: 'Data classification',
    subtitle: 'drives whether the brain may touch it',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-public', parent: 'en-class', kind: 'box', owner: 'shift', title: 'PUBLIC', subtitle: 'open inside the org', source: 'planned' },
  { id: 'en-internal', parent: 'en-class', kind: 'box', owner: 'shift', title: 'INTERNAL', subtitle: 'BU and team scoped', source: 'planned' },
  { id: 'en-conf', parent: 'en-class', kind: 'box', owner: 'shift', title: 'CONFIDENTIAL', subtitle: 'named roles only, sanitized before any model call', source: 'planned' },
  { id: 'en-restricted', parent: 'en-class', kind: 'gate', owner: 'shift', title: 'RESTRICTED', subtitle: 'never leaves the gateway, never sent to a model', source: 'planned' },

  // Systems an enterprise runs
  {
    id: 'en-systems',
    parent: 'ent',
    kind: 'box',
    owner: 'external',
    title: 'Systems they already run',
    subtitle: 'extended, not replaced',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-erp', parent: 'en-systems', kind: 'terminator', owner: 'external', title: 'ERP', subtitle: 'SAP, NetSuite, Oracle', source: 'planned' },
  { id: 'en-hris', parent: 'en-systems', kind: 'terminator', owner: 'external', title: 'HRIS', subtitle: 'Workday', source: 'planned' },
  { id: 'en-crm', parent: 'en-systems', kind: 'terminator', owner: 'external', title: 'CRM', subtitle: 'Salesforce', source: 'planned' },
  { id: 'en-itsm', parent: 'en-systems', kind: 'terminator', owner: 'external', title: 'ITSM', subtitle: 'ServiceNow', source: 'planned' },
  { id: 'en-commsx', parent: 'en-systems', kind: 'terminator', owner: 'external', title: 'Comms', subtitle: 'Slack, Teams, email', source: 'planned' },

  // Integration layer
  {
    id: 'en-integration',
    parent: 'ent',
    kind: 'box',
    owner: 'shift',
    title: 'Integration layer',
    subtitle: 'versioned connectors from the library',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-ibus', parent: 'en-integration', kind: 'box', owner: 'shift', title: 'Event bus', subtitle: 'cross-system signals', source: 'planned' },
  { id: 'en-conn', parent: 'en-integration', kind: 'box', owner: 'shift', title: 'Connector framework', subtitle: 'API calls out, scheduled syncs, retry & backoff', source: 'planned' },
  { id: 'en-masters', parent: 'en-integration', kind: 'store', owner: 'shift', title: 'Master records', subtitle: 'one canonical employee, customer, asset', source: 'planned' },
  { id: 'en-secrets', parent: 'en-integration', kind: 'store', owner: 'shift', title: 'Secrets vault', subtitle: 'per-integration credentials, rotated', source: 'planned' },

  // The load-bearing rule
  {
    id: 'en-rule',
    parent: 'ent',
    kind: 'principle',
    owner: 'shift',
    title: 'An agent inherits the access scope of whoever invokes it.',
    subtitle:
      'The same row-level security, ABAC, and data classification apply to the agent as to the human. The brain can never surface one business unit’s data to another, because it runs inside the caller’s gates.',
    source: 'planned',
    w: 600,
  },

  // The brain, gated
  {
    id: 'en-brain',
    parent: 'ent',
    kind: 'box',
    owner: 'shift',
    title: 'The brain, gated',
    subtitle: 'the same AI foundation, scoped per BU',
    source: 'planned',
    childLayout: 'grid',
  },
  { id: 'en-route', parent: 'en-brain', kind: 'box', owner: 'shift', title: 'Classification-aware routing', subtitle: 'restricted never leaves; lower classes sanitized, then sent', source: 'planned' },
  { id: 'en-skills', parent: 'en-brain', kind: 'box', owner: 'shift', title: 'Skills scoped per BU', subtitle: 'each unit turns on what it needs, run with its context', source: 'planned' },
  { id: 'en-tiers', parent: 'en-brain', kind: 'box', owner: 'shift', title: 'Tiers map to their approvals', subtitle: 'A / B / C align to their segregation of duties', source: 'planned' },
  { id: 'en-observ', parent: 'en-brain', kind: 'box', owner: 'shift', title: 'Per-BU observability', subtitle: 'cost, usage, errors per unit for chargeback', source: 'planned' },

  // One request through the gates
  {
    id: 'en-request',
    parent: 'ent',
    kind: 'box',
    owner: 'client',
    title: 'One request, through the gates',
    subtitle: 'a finance manager drafts a variance report',
    source: 'planned',
    childLayout: 'flow',
    childDir: 'LR',
  },
  { id: 'rq-signin', parent: 'en-request', kind: 'box', owner: 'client', title: 'SSO as the manager', subtitle: 'their IdP, their identity', source: 'planned' },
  { id: 'rq-scope', parent: 'en-request', kind: 'box', owner: 'shift', title: 'Agent runs as them', subtitle: 'Finance BU, their region, their role', source: 'planned' },
  { id: 'rq-read', parent: 'en-request', kind: 'box', owner: 'shift', title: 'Only their rows', subtitle: 'row-level security; restricted fields excluded', source: 'planned' },
  { id: 'rq-sanitize', parent: 'en-request', kind: 'gate', owner: 'shift', title: 'Sanitize', subtitle: 'identifiers stripped; restricted never leaves', source: 'planned' },
  { id: 'rq-model', parent: 'en-request', kind: 'terminator', owner: 'external', title: 'Draft the report', subtitle: 'from the allowed data only', source: 'planned' },
  { id: 'rq-return', parent: 'en-request', kind: 'box', owner: 'client', title: 'Back to the manager', subtitle: 'access and action written to the audit trail', source: 'planned' },
]
