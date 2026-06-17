import { Handle, Position } from '@xyflow/react'

// Hidden source + target handles. Floating edges compute their own attachment
// points from node geometry, so the handle positions here do not matter — they
// only need to exist for an edge to bind to the node.
export function FloatHandles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="float-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="float-handle"
      />
    </>
  )
}
