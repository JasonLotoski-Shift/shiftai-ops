import { Position, type InternalNode, type Node } from '@xyflow/react'

// Floating-edge geometry. Edges attach to the point on each node's boundary
// that faces the other node, so connections stay clean regardless of which
// layout direction (TB vs LR) a node was placed by. Adapted from the React
// Flow floating-edges example for v12.

function center(node: InternalNode<Node>) {
  const w = node.measured?.width ?? (node.width as number) ?? 200
  const h = node.measured?.height ?? (node.height as number) ?? 60
  const p = node.internals.positionAbsolute
  return { x: p.x + w / 2, y: p.y + h / 2, w, h }
}

function intersection(
  node: InternalNode<Node>,
  target: InternalNode<Node>,
) {
  const a = center(node)
  const b = center(target)
  const w = a.w / 2
  const h = a.h / 2
  const x2 = a.x
  const y2 = a.y
  const x1 = b.x
  const y1 = b.y

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h)
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h)
  const aa = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1)
  const xx3 = aa * xx1
  const yy3 = aa * yy1
  const x = w * (xx3 + yy3) + x2
  const y = h * (-xx3 + yy3) + y2
  return { x, y }
}

function edgePosition(
  node: InternalNode<Node>,
  point: { x: number; y: number },
): Position {
  const c = center(node)
  const px = Math.round(point.x)
  const py = Math.round(point.y)
  const nx = Math.round(c.x - c.w / 2)
  const ny = Math.round(c.y - c.h / 2)
  if (px <= nx + 1) return Position.Left
  if (px >= nx + c.w - 1) return Position.Right
  if (py <= ny + 1) return Position.Top
  return Position.Bottom
}

export function getEdgeParams(
  source: InternalNode<Node>,
  target: InternalNode<Node>,
) {
  const sp = intersection(source, target)
  const tp = intersection(target, source)
  return {
    sx: sp.x,
    sy: sp.y,
    tx: tp.x,
    ty: tp.y,
    sourcePos: edgePosition(source, sp),
    targetPos: edgePosition(target, tp),
  }
}
