import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { ownerColor } from '../lib/tokens'
import { FloatHandles } from './handles'
import { useMapActions } from '../lib/actions'
import { NoteBadge } from './NoteBadge'

// A governed point — a person or a rule clears it. The harvest gate, the tier
// engine, the sanitization gate, the security gateway, the review gate.
function GateNodeImpl({ id, data, selected }: NodeProps<RFNode>) {
  const actions = useMapActions()
  const accent = ownerColor[data.owner]
  const cls = [
    'node',
    'gate',
    `owner-${data.owner}`,
    data.example ? 'example' : '',
    data.dimmed ? 'dimmed' : '',
    data.matched ? 'matched' : '',
    selected ? 'selected' : '',
    data.expandable ? 'expandable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ ['--accent' as string]: accent }}>
      <FloatHandles />
      <span className="gate-mark" aria-hidden>
        ◇
      </span>
      <div className="gate-body">
        <div className="node-head">
          <span className="node-title">{data.title}</span>
          {data.isNew && <span className="tag tag-new">NEW</span>}
          <NoteBadge n={data.noteCount} />
        </div>
        {data.subtitle && <div className="node-sub">{data.subtitle}</div>}
      </div>
      {data.expandable && (
        <button
          className="expand-badge"
          title={`Expand — ${data.childCount} inside`}
          onClick={(e) => {
            e.stopPropagation()
            actions.open(id)
          }}
        >
          ＋ {data.childCount}
        </button>
      )}
    </div>
  )
}

export const GateNode = memo(GateNodeImpl)
