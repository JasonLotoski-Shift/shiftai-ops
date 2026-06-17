import Dagre from '@dagrejs/dagre'
import type { Entity, NodeKind, RFNode } from './types'
import { byId, childrenOf, isContainer, connections, depthOf } from '../model'

// ── Recursive nested layout ─────────────────────────────────────────────────
// One pass, bottom-up. Each open container lays out its visible children, then
// reports the size it needs; its parent treats it as a sized box. This is the
// N-level generalization of the old two-pass (groups, then top level) engine,
// and it is what lets the map go arbitrarily deep on one canvas.

const PAD = 16 // padding inside an open container
const HEADER = 42 // open-container header height
const MIN_W = 232 // minimum open-container width
const GAP_X = 16
const GAP_Y = 14

function leafW(e: Entity): number {
  if (e.w) return e.w
  switch (e.kind) {
    case 'principle':
      return 560
    case 'boundary':
      return 1320
    case 'terminator':
      return 224
    default:
      return 216
  }
}

// Leaf / collapsed height. Grows to fit chips, a status/pin row, and the
// "expand" hint a collapsed container carries.
function leafH(e: Entity, collapsedContainer: boolean): number {
  if (e.h) return e.h
  if (e.kind === 'boundary') return 44
  if (e.kind === 'principle') return 128
  let h = e.subtitle ? 74 : 58
  if (e.kind === 'gate') h += 8
  if (e.chips?.length) h += e.chips.length * 26 + 6
  if (e.status || e.pin) h += 24
  if (collapsedContainer) h += 18
  return h
}

const rfType = (e: Entity, open: boolean): string =>
  open ? 'group' : (e.kind as NodeKind)

// Intra-container real flow edges (both endpoints are direct children of `id`).
function innerFlowEdges(id: string): [string, string][] {
  const out: [string, string][] = []
  for (const c of connections) {
    if (c.ordering) continue
    const s = byId.get(c.source)
    const t = byId.get(c.target)
    if (s?.parent === id && t?.parent === id) out.push([c.source, c.target])
  }
  return out
}
function innerOrderEdges(id: string): [string, string][] {
  const out: [string, string][] = []
  for (const c of connections) {
    if (!c.ordering) continue
    const s = byId.get(c.source)
    const t = byId.get(c.target)
    if (s?.parent === id && t?.parent === id) out.push([c.source, c.target])
  }
  return out
}

export function layout(open: Set<string>, visible: Set<string>): RFNode[] {
  const size = new Map<string, { w: number; h: number }>()
  const rel = new Map<string, { x: number; y: number }>() // pos within parent

  const isOpen = (id: string) =>
    isContainer(id) && open.has(id) && visible.has(id)

  // Post-order: size every visible node.
  function measure(id: string): { w: number; h: number } {
    const cached = size.get(id)
    if (cached) return cached
    const e = byId.get(id)!

    if (!isOpen(id)) {
      const s = { w: leafW(e), h: leafH(e, isContainer(id)) }
      size.set(id, s)
      return s
    }

    const kids = childrenOf(id).filter((k) => visible.has(k.id))
    kids.forEach((k) => measure(k.id))

    const mode = e.childLayout ?? 'graph'
    const raw = new Map<string, { x: number; y: number }>() // top-left, pre-norm

    if (mode === 'grid') {
      const n = kids.length
      const cols = n <= 3 ? n : n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3)
      const cellW = Math.max(...kids.map((k) => size.get(k.id)!.w))
      const cellH = Math.max(...kids.map((k) => size.get(k.id)!.h))
      kids.forEach((k, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        raw.set(k.id, { x: col * (cellW + GAP_X), y: row * (cellH + GAP_Y) })
      })
    } else {
      const g = new Dagre.graphlib.Graph()
      g.setGraph({
        rankdir: e.childDir ?? (mode === 'flow' ? 'LR' : 'TB'),
        nodesep: 30,
        ranksep: 54,
        marginx: 0,
        marginy: 0,
      })
      g.setDefaultEdgeLabel(() => ({}))
      kids.forEach((k) => {
        const s = size.get(k.id)!
        g.setNode(k.id, { width: s.w, height: s.h })
      })
      const edges =
        mode === 'flow'
          ? innerFlowEdges(id)
          : [...innerFlowEdges(id), ...innerOrderEdges(id)]
      for (const [s, t] of edges) if (g.hasNode(s) && g.hasNode(t)) g.setEdge(s, t)
      Dagre.layout(g)
      kids.forEach((k) => {
        const nd = g.node(k.id)
        const s = size.get(k.id)!
        raw.set(k.id, { x: nd.x - s.w / 2, y: nd.y - s.h / 2 })
      })
    }

    // Normalize into the header/padding frame and size the container.
    let minX = Infinity
    let minY = Infinity
    for (const k of kids) {
      const p = raw.get(k.id)!
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
    }
    let right = 0
    let bottom = 0
    for (const k of kids) {
      const p = raw.get(k.id)!
      const s = size.get(k.id)!
      const x = p.x - minX + PAD
      const y = p.y - minY + HEADER + PAD
      rel.set(k.id, { x, y })
      right = Math.max(right, x + s.w)
      bottom = Math.max(bottom, y + s.h)
    }
    const s = { w: Math.max(right + PAD, MIN_W), h: bottom + PAD }
    size.set(id, s)
    return s
  }

  // Roots are the entities with no parent.
  const rootEntities = [...byId.values()].filter(
    (e) => !e.parent && visible.has(e.id),
  )
  rootEntities.forEach((e) => measure(e.id))

  // Top-level placement: stratify roots with their ordering edges.
  const tg = new Dagre.graphlib.Graph()
  tg.setGraph({ rankdir: 'TB', nodesep: 64, ranksep: 92, marginx: 24, marginy: 24 })
  tg.setDefaultEdgeLabel(() => ({}))
  const rootIds = new Set(rootEntities.map((e) => e.id))
  rootEntities.forEach((e) => {
    const s = size.get(e.id)!
    tg.setNode(e.id, { width: s.w, height: s.h })
  })
  for (const c of connections) {
    if (!c.ordering) continue
    if (rootIds.has(c.source) && rootIds.has(c.target)) tg.setEdge(c.source, c.target)
  }
  Dagre.layout(tg)

  const abs = new Map<string, { x: number; y: number }>()
  rootEntities.forEach((e) => {
    const nd = tg.node(e.id)
    const s = size.get(e.id)!
    abs.set(e.id, { x: nd.x - s.w / 2, y: nd.y - s.h / 2 })
  })

  // Compose React Flow nodes. Parents must precede children.
  const out: RFNode[] = []
  const emit = (e: Entity) => {
    const open_ = isOpen(e.id)
    const s = size.get(e.id)!
    const position = e.parent ? rel.get(e.id)! : abs.get(e.id)!
    const node: RFNode = {
      id: e.id,
      type: rfType(e, open_),
      position,
      width: s.w,
      height: s.h,
      data: {
        ...e,
        open: open_,
        expandable: isContainer(e.id),
        childCount: childrenOf(e.id).length,
        depth: depthOf(e.id),
      },
      ...(e.parent ? { parentId: e.parent, extent: 'parent' as const } : {}),
      ...(open_ ? { style: { width: s.w, height: s.h } } : {}),
    }
    out.push(node)
    if (open_) childrenOf(e.id).filter((k) => visible.has(k.id)).forEach(emit)
  }
  rootEntities.forEach(emit)

  return out
}
