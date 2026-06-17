import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { ownerColor } from '../lib/tokens'
import { FloatHandles } from './handles'
import { useMapActions } from '../lib/actions'
import { NoteBadge } from './NoteBadge'

// Data-store node — Drives, databases, the library, the vault.
function StoreNodeImpl({ id, data, selected }: NodeProps<RFNode>) {
  const actions = useMapActions()
  const accent = ownerColor[data.owner]
  const cls = [
    'node',
    'store',
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
      <span className="store-disk" aria-hidden />
      <div className="node-head">
        <span className="node-title">{data.title}</span>
        {data.isNew && <span className="tag tag-new">NEW</span>}
        {data.revised && <span className="tag tag-rev">REVISED</span>}
        <NoteBadge n={data.noteCount} />
      </div>
      {data.subtitle && <div className="node-sub">{data.subtitle}</div>}
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

export const StoreNode = memo(StoreNodeImpl)
