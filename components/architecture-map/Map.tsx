import { useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  useNodesInitialized,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { RFNode, RFEdge } from './lib/types'
import { layout } from './lib/layout'
import { liftEdges, valveNodeIds } from './lib/graph'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import { C, ownerColor, edgeColor } from './lib/tokens'
import { useMapActions } from './lib/actions'
import { useNotes } from './lib/notes'

interface Props {
  open: Set<string>
  visible: Set<string>
  selectedId: string | null
  search: string
  valveOnly: boolean
  focus: { id: string | null; nonce: number }
}

function FlowCanvas({ open, visible, selectedId, search, valveOnly, focus }: Props) {
  const rf = useReactFlow()
  const actions = useMapActions()
  const { notesByNode } = useNotes()

  const openKey = useMemo(() => [...open].sort().join(','), [open])

  const baseNodes = useMemo(
    () => layout(open, visible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openKey],
  )
  const baseEdges = useMemo(
    () => liftEdges(visible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openKey],
  )
  const valveNodes = useMemo(() => valveNodeIds(baseEdges), [baseEdges])

  const q = search.trim().toLowerCase()

  const nodes = useMemo<RFNode[]>(() => {
    return baseNodes.map((n) => {
      const title = (n.data.title ?? '').toLowerCase()
      const sub = (n.data.subtitle ?? '').toLowerCase()
      const about = (n.data.about ?? '').toLowerCase()
      const matched =
        q.length > 1 && (title.includes(q) || sub.includes(q) || about.includes(q))
      const dimByValve = valveOnly && !valveNodes.has(n.id)
      const dimBySearch = q.length > 1 && !matched
      return {
        ...n,
        selected: n.id === selectedId,
        data: {
          ...n.data,
          dimmed: dimByValve || dimBySearch,
          matched,
          noteCount: notesByNode[n.id]?.length ?? 0,
        },
      }
    })
  }, [baseNodes, q, valveOnly, valveNodes, selectedId, notesByNode])

  const edges = useMemo<RFEdge[]>(() => {
    const matchedNode = (id: string) => {
      const n = baseNodes.find((b) => b.id === id)
      if (!n) return false
      const t = (n.data.title ?? '').toLowerCase()
      const s = (n.data.subtitle ?? '').toLowerCase()
      return t.includes(q) || s.includes(q)
    }
    return baseEdges.map((e) => {
      const color = e.structural ? '#3a3a40' : edgeColor[e.type]
      const dimmed =
        (valveOnly && !e.valve) ||
        (q.length > 1 && !(matchedNode(e.source) && matchedNode(e.target)))
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'flow',
        data: {
          // A lifted edge is an aggregation — its specific label is misleading
          // at this altitude, so suppress the text but keep the valve badge.
          label: e.structural || e.lifted ? undefined : e.label,
          edgeType: e.type,
          valve: e.valve,
          structural: e.structural,
          lifted: e.lifted,
          dimmed,
        },
        markerEnd:
          e.type === 'never' || e.structural
            ? undefined
            : { type: MarkerType.ArrowClosed, color, width: 15, height: 15 },
        markerStart:
          e.type === 'two-way' && !e.structural
            ? { type: MarkerType.ArrowClosed, color, width: 15, height: 15 }
            : undefined,
      }
    })
  }, [baseEdges, baseNodes, q, valveOnly])

  // Re-frame whenever the expansion state changes.
  const initialized = useNodesInitialized()
  useEffect(() => {
    if (!initialized) return
    const t = setTimeout(
      () => rf.fitView({ padding: 0.16, duration: 420, maxZoom: 1.05 }),
      60,
    )
    return () => clearTimeout(t)
  }, [initialized, openKey, rf])

  // Center on a node when it is selected or revealed.
  useEffect(() => {
    if (!focus.id) return
    const t = setTimeout(() => {
      rf.fitView({
        nodes: [{ id: focus.id! }],
        padding: 0.55,
        duration: 480,
        maxZoom: 1.25,
      })
    }, 130)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.nonce])

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    const d = (node as RFNode).data
    actions.select(node.id)
    if (d.expandable && !d.open) actions.open(node.id)
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={() => actions.select(null)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      minZoom={0.08}
      maxZoom={2.2}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1.05 }}
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'flow' }}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color={C.graphite} bgColor={C.bitumen} />
      <Controls
        showInteractive={false}
        style={{ background: C.asphalt, border: `1px solid ${C.graphite}`, borderRadius: 8 }}
      />
      <MiniMap
        pannable
        zoomable
        bgColor={C.asphalt}
        maskColor="rgba(10,10,11,0.7)"
        nodeColor={(n) => {
          const owner = (n.data as RFNode['data'])?.owner
          return owner ? ownerColor[owner] : C.graphite
        }}
        nodeStrokeColor={C.graphite}
        style={{ background: C.asphalt, border: `1px solid ${C.graphite}` }}
      />
    </ReactFlow>
  )
}

export function Map(props: Props) {
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  )
}
