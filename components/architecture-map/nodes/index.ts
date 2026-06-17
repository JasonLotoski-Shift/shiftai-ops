import type { NodeTypes } from '@xyflow/react'
import { BoxNode } from './BoxNode'
import { GroupNode } from './GroupNode'
import { StoreNode } from './StoreNode'
import { GateNode } from './GateNode'
import { TerminatorNode } from './TerminatorNode'
import { BoundaryNode } from './BoundaryNode'
import { PrincipleNode } from './PrincipleNode'

export const nodeTypes: NodeTypes = {
  box: BoxNode,
  group: GroupNode,
  store: StoreNode,
  gate: GateNode,
  terminator: TerminatorNode,
  boundary: BoundaryNode,
  principle: PrincipleNode,
}
