import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { ownerColor } from '../lib/tokens'
import { FloatHandles } from './handles'
import { useMapActions } from '../lib/actions'

// An open container — the frame that holds expanded children. A node only
// renders as a group while it is open; collapsed, it renders as its own kind.
function GroupNodeImpl({ id, data, selected }: NodeProps<RFNode>) {
  const actions = useMapActions()
  const accent = ownerColor[data.owner]
  const cls = [
    'node',
    'group',
    `owner-${data.owner}`,
    data.example ? 'example' : '',
    data.dimmed ? 'dimmed' : '',
    data.matched ? 'matched' : '',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ ['--accent' as string]: accent }}>
      <FloatHandles />
      <div className="group-head">
        <button
          className="group-toggle"
          title="Collapse"
          onClick={(e) => {
            e.stopPropagation()
            actions.toggleOpen(id)
          }}
        >
          –
        </button>
        <span className="group-label">{data.title}</span>
        {data.subtitle && <span className="group-sub">{data.subtitle}</span>}
        {data.isNew && <span className="tag tag-new">NEW</span>}
      </div>
    </div>
  )
}

export const GroupNode = memo(GroupNodeImpl)
