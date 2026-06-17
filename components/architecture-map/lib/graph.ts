import type { Conn, EdgeType } from './types'
import { byId, ancestorsOf, connections } from '../model'

// ── Visibility ────────────────────────────────────────────────────────────
// A node is on screen when every one of its ancestors is open. Roots have no
// ancestors, so they are always on screen. A visible container that is itself
// open renders as a frame holding its children; otherwise it renders as a
// single collapsed box.
export function computeVisible(open: Set<string>): Set<string> {
  const visible = new Set<string>()
  for (const e of byId.values()) {
    const anc = ancestorsOf(e.id)
    if (anc.every((a) => open.has(a))) visible.add(e.id)
  }
  return visible
}

// The visible node that stands in for an id. If the id is on screen, it is its
// own representative; otherwise it is the nearest ancestor that is on screen
// (a collapsed container). Roots are always visible, so this always resolves.
export function representative(
  id: string,
  visible: Set<string>,
): string | null {
  if (visible.has(id)) return id
  let cur = byId.get(id)?.parent
  while (cur) {
    if (visible.has(cur)) return cur
    cur = byId.get(cur)?.parent
  }
  return null
}

export interface RenderEdge {
  id: string
  source: string
  target: string
  type: EdgeType
  label?: string
  valve?: 1 | 2 | 3
  detail?: string
  structural?: boolean // an ordering hint between siblings
  lifted?: boolean // re-anchored to an ancestor — the true endpoint is deeper
}

// Strength order for merging two edges that collapse onto the same visible
// pair: a never-cross dominates, then a valve, then a labelled edge.
function strength(e: RenderEdge): number {
  return (e.type === 'never' ? 4 : 0) + (e.valve ? 2 : 0) + (e.label ? 1 : 0)
}

export function liftEdges(visible: Set<string>): RenderEdge[] {
  const out = new Map<string, RenderEdge>()

  for (const c of connections as Conn[]) {
    if (c.ordering) {
      // Ordering hints are never lifted. Draw faint only when both ends are
      // themselves visible (i.e. siblings currently on screen).
      if (visible.has(c.source) && visible.has(c.target)) {
        const id = `ord__${c.source}__${c.target}`
        out.set(id, {
          id,
          source: c.source,
          target: c.target,
          type: 'one-way',
          structural: true,
        })
      }
      continue
    }

    const s = representative(c.source, visible)
    const t = representative(c.target, visible)
    if (!s || !t || s === t) continue

    const lifted = s !== c.source || t !== c.target
    const candidate: RenderEdge = {
      id: `${s}__${t}`,
      source: s,
      target: t,
      type: c.type,
      label: c.label,
      valve: c.valve,
      detail: c.detail,
      lifted,
    }
    const existing = out.get(candidate.id)
    if (!existing || strength(candidate) > strength(existing)) {
      // When a lifted edge loses its specific label, keep a generic hint so the
      // viewer still sees the relationship exists at this altitude.
      if (lifted && !candidate.label) candidate.label = undefined
      out.set(candidate.id, candidate)
    }
  }

  return [...out.values()]
}

// Node ids touched by any valve edge in the current render — drives the
// "show only the valves" filter.
export function valveNodeIds(edges: RenderEdge[]): Set<string> {
  const s = new Set<string>()
  for (const e of edges) {
    if (e.valve) {
      s.add(e.source)
      s.add(e.target)
    }
  }
  return s
}
