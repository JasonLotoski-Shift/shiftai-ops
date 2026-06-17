import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { FloatHandles } from './handles'

// The ownership boundary band. The line where Shift's IP ends and the client's
// instance begins. The build keeps it there.
function BoundaryNodeImpl({ data }: NodeProps<RFNode>) {
  return (
    <div className={`node boundary ${data.dimmed ? 'dimmed' : ''}`}>
      <FloatHandles />
      <span className="boundary-label">{data.title}</span>
    </div>
  )
}

export const BoundaryNode = memo(BoundaryNodeImpl)
