import type { Node, Edge } from '@xyflow/react'
import type { Owner } from './tokens'

export type { Owner }

// ─────────────────────────────────────────────────────────────────────────────
// ONE MODEL, ONE SOURCE OF TRUTH.
//
// The whole firm is a single recursive tree of entities. Every concept is
// defined exactly once, with a `parent` pointer. There are no separate "views":
// the map is this one tree, and you navigate it by expanding and collapsing
// nodes in place. Connections are declared on the real endpoints; the renderer
// lifts them to whatever depth is currently visible.
//
// This is what makes the map coherent. The Pattern Library, the security
// gateway, the tier engine, FFW&H — each is one node. Edit it here, it is
// correct everywhere it shows up.
// ─────────────────────────────────────────────────────────────────────────────

// How a node looks when it is a leaf or collapsed. A node with children always
// becomes an expandable container; `kind` only decides its collapsed shape.
//   box        standard node (title + subtitle + owner color)
//   store      data-store look (Drives, databases, the library, the vault)
//   gate       a governed point — a person/rule clears it (harvest, tier, sanitize)
//   terminator external endpoint, bought not owned (pill)
//   boundary   the ownership band (a single full-width divider)
//   principle  a load-bearing-rule callout
export type NodeKind =
  | 'box'
  | 'store'
  | 'gate'
  | 'terminator'
  | 'boundary'
  | 'principle'

export type EdgeType = 'one-way' | 'two-way' | 'never'

// How honest the node is about its build state. Drives the badge in the panel
// and the dashed "illustrative" treatment. Grounded in the real source docs.
export type Source =
  | 'real' // built and running today
  | 'in-build' // under active build right now
  | 'scoped' // designed, sequenced, not yet built
  | 'planned' // on the roadmap, not started
  | 'example' // illustration only — not a real thing yet

// How a container arranges its children when it is open.
//   graph  dagre over the children's own flow edges (default)
//   flow   a left-to-right (or top-down) sequence — for step walkthroughs
//   grid   a tidy grid — for peer parts with no internal flow
export type ChildLayout = 'graph' | 'flow' | 'grid'

export interface Chip {
  label: string
  kind: 'lib' | 'custom' // a module from the library, or custom for this client
}

export interface StatusTag {
  text: string
  tone?: 'gold' | 'steel' | 'red' | 'muted'
}

export interface Entity {
  id: string
  parent?: string // parent entity id; omitted = a top-level zone
  kind: NodeKind
  title: string
  subtitle?: string
  owner: Owner

  // Info-panel content.
  about?: string // a fuller "what this is" paragraph
  rule?: string // the rule that governs it (the load-bearing constraint)
  inside?: string[] // bullet points — detail that is not its own child node
  note?: string // a closing aside

  // Build honesty + tags.
  source?: Source
  isNew?: boolean // carries a NEW tag (added in the 2026-06-16 model)
  revised?: boolean // carries a REVISED tag
  example?: boolean // dashed / illustrative
  status?: StatusTag
  pin?: string // e.g. "core v2.4"
  chips?: Chip[] // enabled-module chips (fleet clients)

  // Layout hints for THIS node's children (only used when it has children).
  childLayout?: ChildLayout
  childDir?: 'TB' | 'LR'
  defaultOpen?: boolean // expanded on first load

  // Leaf size overrides (only used when it has no children).
  w?: number
  h?: number
}

export interface Conn {
  source: string
  target: string
  type: EdgeType
  label?: string
  valve?: 1 | 2 | 3 // one of the three load-bearing valves
  detail?: string // a fuller explanation, shown in the panel
  ordering?: boolean // layout-only hint between siblings (drawn faint, never lifted)
}

// ── React Flow carriers ──────────────────────────────────────────────────────
// Data ride-along on every rendered node. The index signature satisfies React
// Flow v12's Record<string, unknown> data constraint.
export type RFNodeData = Entity & {
  open?: boolean // an expanded container
  expandable?: boolean // has children — clicking expands
  childCount?: number
  depth?: number // distance from root, for subtle styling
  dimmed?: boolean
  matched?: boolean
  noteCount?: number // team notes on this card — drives the head badge
  [key: string]: unknown
}

export type RFEdgeData = {
  label?: string
  edgeType: EdgeType
  valve?: 1 | 2 | 3
  structural?: boolean // a layout/ordering connector, drawn faint
  lifted?: boolean // re-anchored to an ancestor (the true endpoint is deeper)
  dimmed?: boolean
  [key: string]: unknown
}

export type RFNode = Node<RFNodeData>
export type RFEdge = Edge<RFEdgeData>
