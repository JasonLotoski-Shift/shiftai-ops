import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { RFNode } from '../lib/types'
import { FloatHandles } from './handles'

// A load-bearing-rule callout — the three hard rules, the agent-inherits-scope
// rule. The rule the whole design rests on.
function PrincipleNodeImpl({ data, selected }: NodeProps<RFNode>) {
  const cls = [
    'node',
    'principle',
    data.dimmed ? 'dimmed' : '',
    data.matched ? 'matched' : '',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <FloatHandles />
      <div className="principle-label">Load-bearing rule</div>
      <div className="principle-head">{data.title}</div>
      {data.subtitle && <div className="principle-sub">{data.subtitle}</div>}
    </div>
  )
}

export const PrincipleNode = memo(PrincipleNodeImpl)
