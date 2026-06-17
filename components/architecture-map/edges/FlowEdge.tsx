import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from '@xyflow/react'
import type { RFEdge } from '../lib/types'
import { edgeColor } from '../lib/tokens'
import { getEdgeParams } from '../lib/floating'

// One edge component for all three edge types: one-way (gold), two-way (bone),
// never-cross (red dashed). Floating geometry keeps it attached cleanly.
function FlowEdgeImpl({ id, source, target, markerEnd, markerStart, data }: EdgeProps<RFEdge>) {
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  if (!sourceNode || !targetNode) return null

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(
    sourceNode,
    targetNode,
  )
  const [path, labelX, labelY] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    sourcePosition: sourcePos,
    targetX: tx,
    targetY: ty,
    targetPosition: targetPos,
    curvature: 0.28,
  })

  const type = data?.edgeType ?? 'one-way'
  const dimmed = data?.dimmed
  const isValve = !!data?.valve
  const structural = !!data?.structural
  const color = structural ? '#3a3a40' : edgeColor[type]

  const style: React.CSSProperties = {
    stroke: color,
    strokeWidth: structural ? 1 : isValve ? 2.4 : type === 'two-way' ? 1.3 : 1.7,
    strokeDasharray: type === 'never' && !structural ? '7 5' : undefined,
    opacity: dimmed ? 0.05 : structural ? 0.55 : 1,
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />
      {(data?.label || data?.valve) && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label etype-${type} ${dimmed ? 'dimmed' : ''} ${
              isValve ? 'valve' : ''
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.valve && <span className="edge-valve">V{data.valve}</span>}
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const FlowEdge = memo(FlowEdgeImpl)
