import type { Entity } from '../../lib/types'

// THE EXAMPLE FLEET · children of the clients zone.
// FFW&H is real; these four are illustrative forks across the beachhead
// verticals, shown so the fleet shape (one core, many forks, none touching
// another) reads at a glance. Grounded in architecture-fleet-5clients.html.
export const fleet: Entity[] = [
  {
    id: 'other-clients',
    parent: 'clients',
    kind: 'box',
    owner: 'client',
    title: 'Other client forks',
    subtitle: 'illustrative · automotive, motorsport, engineering, construction',
    source: 'example',
    example: true,
    childLayout: 'grid',
    about:
      'The same shared core, forked for the other beachhead verticals. Each runs different modules, pins its own core version, and merges updates on its own schedule. None of them can reach another · Valve 2.',
  },
  {
    id: 'cl-auto',
    parent: 'other-clients',
    kind: 'box',
    owner: 'client',
    title: 'Auto group',
    subtitle: 'automotive',
    source: 'example',
    example: true,
    pin: 'core v2.4',
    status: { text: 'example', tone: 'muted' },
    chips: [
      { label: 'CRM', kind: 'lib' },
      { label: 'Service scheduling', kind: 'lib' },
      { label: 'Parts inventory', kind: 'custom' },
      { label: 'Invoicing', kind: 'lib' },
    ],
  },
  {
    id: 'cl-race',
    parent: 'other-clients',
    kind: 'box',
    owner: 'client',
    title: 'Race team',
    subtitle: 'motorsport',
    source: 'example',
    example: true,
    pin: 'core v2.1',
    status: { text: 'update PR pending', tone: 'steel' },
    chips: [
      { label: 'Logistics', kind: 'custom' },
      { label: 'Inventory', kind: 'lib' },
      { label: 'Scheduling', kind: 'lib' },
      { label: 'Sponsor CRM', kind: 'custom' },
    ],
    rule: 'Still on core v2.1, its update waiting for review. Each client merges on its own schedule.',
  },
  {
    id: 'cl-eng',
    parent: 'other-clients',
    kind: 'box',
    owner: 'client',
    title: 'Eng firm',
    subtitle: 'engineering',
    source: 'example',
    example: true,
    pin: 'core v2.4',
    status: { text: 'example', tone: 'muted' },
    chips: [
      { label: 'Project tracking', kind: 'lib' },
      { label: 'Document control', kind: 'lib' },
      { label: 'RFIs & approvals', kind: 'custom' },
      { label: 'Time & billing', kind: 'lib' },
    ],
  },
  {
    id: 'cl-builder',
    parent: 'other-clients',
    kind: 'box',
    owner: 'client',
    title: 'Builder',
    subtitle: 'construction',
    source: 'example',
    example: true,
    pin: 'core v2.4',
    status: { text: 'example', tone: 'muted' },
    chips: [
      { label: 'Dispatch', kind: 'lib' },
      { label: 'Job costing', kind: 'custom' },
      { label: 'Scheduling', kind: 'lib' },
      { label: 'Field reports', kind: 'custom' },
    ],
  },
]
