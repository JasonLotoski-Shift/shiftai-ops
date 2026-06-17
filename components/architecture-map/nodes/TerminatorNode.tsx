import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { ownerColor } from '../lib/tokens'
import { FloatHandles } from './handles'

// Terminator node — an external endpoint, bought not owned. Pill-shaped.
function TerminatorNodeImpl({ data, selected }: NodeProps<RFNode>) {
  const accent = ownerColor[data.owner]
  const cls = [
    'node',
    'terminator',
    `owner-${data.owner}`,
    data.dimmed ? 'dimmed' : '',
    data.matched ? 'matched' : '',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ ['--accent' as string]: accent }}>
      <FloatHandles />
      <div className="node-head">
        <span className="node-title">{data.title}</span>
      </div>
      {data.subtitle && <div className="node-sub">{data.subtitle}</div>}
    </div>
  )
}

export const TerminatorNode = memo(TerminatorNodeImpl)
