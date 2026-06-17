import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { ownerColor } from '../lib/tokens'
import { FloatHandles } from './handles'
import { useMapActions } from '../lib/actions'
import { NoteBadge } from './NoteBadge'

function tagClass(tone?: string) {
  switch (tone) {
    case 'gold':
      return 'stat stat-gold'
    case 'steel':
      return 'stat stat-steel'
    case 'red':
      return 'stat stat-red'
    default:
      return 'stat stat-muted'
  }
}

// Standard node. Also the collapsed look of any container — when it has
// children, it carries an "＋ N" badge and clicking it expands in place.
function BoxNodeImpl({ id, data, selected }: NodeProps<RFNode>) {
  const actions = useMapActions()
  const accent = ownerColor[data.owner]
  const cls = [
    'node',
    'box',
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
      <div className="node-head">
        <span className="node-title">{data.title}</span>
        {data.isNew && <span className="tag tag-new">NEW</span>}
        {data.revised && <span className="tag tag-rev">REVISED</span>}
        <NoteBadge n={data.noteCount} />
      </div>
      {data.subtitle && <div className="node-sub">{data.subtitle}</div>}

      {data.chips && data.chips.length > 0 && (
        <div className="node-chips">
          {data.chips.map((c) => (
            <span key={c.label} className={`chip chip-${c.kind}`}>
              {c.label}
            </span>
          ))}
        </div>
      )}

      {(data.pin || data.status) && (
        <div className="node-foot">
          {data.pin && <span className="pin">{data.pin}</span>}
          {data.status && (
            <span className={tagClass(data.status.tone)}>{data.status.text}</span>
          )}
        </div>
      )}

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

export const BoxNode = memo(BoxNodeImpl)
