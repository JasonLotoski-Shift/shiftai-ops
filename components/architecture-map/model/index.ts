import type { Entity, Conn } from '../lib/types'
import { controlPlane } from './zones/controlPlane'
import { filing, brain } from './zones/filingBrain'
import { platform } from './zones/platform'
import { boundary } from './zones/boundary'
import { clients } from './zones/clientFfwh'
import { acctPillar } from './zones/acctPillar'
import { fleet } from './zones/fleet'
import { enterprise } from './zones/enterprise'
import { external } from './zones/external'
import { connections } from './connections'

export { connections }

// One flat list, assembled in display order. Roots come out in this order; a
// container's children come out in the order they appear here.
export const entities: Entity[] = [
  ...controlPlane,
  ...filing,
  ...brain,
  ...platform,
  ...boundary,
  ...clients,
  ...acctPillar,
  ...fleet,
  ...enterprise,
  ...external,
]

export const byId = new Map<string, Entity>(entities.map((e) => [e.id, e]))

// Children indexed by parent, preserving declaration order.
const childIndex = new Map<string, Entity[]>()
for (const e of entities) {
  if (!e.parent) continue
  const list = childIndex.get(e.parent) ?? []
  list.push(e)
  childIndex.set(e.parent, list)
}

export const childrenOf = (id: string): Entity[] => childIndex.get(id) ?? []
export const isContainer = (id: string): boolean => childIndex.has(id)
export const roots: Entity[] = entities.filter((e) => !e.parent)

// Root → … → parent (excludes the node itself).
export function ancestorsOf(id: string): string[] {
  const chain: string[] = []
  const guard = new Set<string>()
  let cur = byId.get(id)?.parent
  while (cur && !guard.has(cur)) {
    chain.unshift(cur)
    guard.add(cur)
    cur = byId.get(cur)?.parent
  }
  return chain
}

export const depthOf = (id: string): number => ancestorsOf(id).length

// Every connection that touches a node (either end).
export function connsOf(id: string): Conn[] {
  return connections.filter((c) => c.source === id || c.target === id)
}

// ── Integrity check, run once at load. A bad parent or a dangling edge is the
// exact class of bug that made the old six-graph model drift, so we fail loud.
export function validateModel(): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  for (const e of entities) {
    if (seen.has(e.id)) issues.push(`duplicate id: ${e.id}`)
    seen.add(e.id)
    if (e.parent && !byId.has(e.parent))
      issues.push(`${e.id} → missing parent "${e.parent}"`)
  }
  for (const c of connections) {
    if (!byId.has(c.source)) issues.push(`edge source missing: ${c.source}`)
    if (!byId.has(c.target)) issues.push(`edge target missing: ${c.target}`)
  }
  return issues
}

// Dev-only integrity check. Was Vite's import.meta.env.DEV in the standalone
// app; in Next, process.env.NODE_ENV is statically replaced at build time.
if (process.env.NODE_ENV !== "production") {
  const issues = validateModel()
  if (issues.length) {
    // eslint-disable-next-line no-console
    console.error(`[architecture-map] model integrity (${issues.length}):\n` + issues.join('\n'))
  }
}
