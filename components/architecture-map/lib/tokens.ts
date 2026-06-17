// Brand tokens — Shift AI Partners, Edition 06 (dark mode).
// Source: brand/brand-guide.md. These are the only colors in the app.
export const C = {
  bitumen: '#0A0A0B', // page background
  asphalt: '#141416', // cards, panels
  asphalt2: '#17171A', // recessed surface
  graphite: '#26262A', // hairlines, dividers
  gold: '#C9A961', // Track Gold — Shift owns / the one accent
  bone: '#F2EEE6', // primary type
  steel: '#6E8C9C', // Diagnostic Steel — client owns
  red: '#B8332E', // Flag Red — never-cross, hard rules
  muted: '#8B8A86', // muted type
  muted2: '#6c6b67', // external / bought
  // edge tints
  boneEdge: '#cfcabf',
  redSoft: '#d98b86',
} as const

// Ownership drives color — the spine of the whole map.
export type Owner = 'shift' | 'client' | 'external' | 'rnd'

export const ownerColor: Record<Owner, string> = {
  shift: C.gold, // Shift owns the IP
  client: C.steel, // client owns the instance
  external: C.muted2, // external, bought
  rnd: C.gold, // R&D track (rendered dashed)
}

export const ownerLabel: Record<Owner, string> = {
  shift: 'Shift owns the IP',
  client: 'Client owns it',
  external: 'External, bought',
  rnd: 'Shift R&D, unpriced',
}

// Edge colors by type.
export const edgeColor = {
  'one-way': C.gold,
  'two-way': C.boneEdge,
  never: C.red,
} as const
