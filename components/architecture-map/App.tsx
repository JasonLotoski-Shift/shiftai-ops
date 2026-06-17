"use client";

import { useCallback, useMemo, useState } from 'react'
import { Header } from './components/Header'
import { Toolbar } from './components/Toolbar'
import { InfoPanel } from './components/InfoPanel'
import { Legend } from './components/Legend'
import { Map } from './Map'
import { MapActionsContext, type MapActions } from './lib/actions'
import { computeVisible } from './lib/graph'
import { roots, isContainer, ancestorsOf, byId } from './model'
// Stylesheet imported last so it overrides React Flow's base styles (which are
// imported inside Map.tsx). Every rule is scoped under .arch-map — see index.css.
import './index.css'

// Optional deep-link: ?node=<id> opens to that node and selects it.
function initialState(): { open: Set<string>; selected: string | null } {
  const want = new URLSearchParams(window.location.search).get('node')
  if (want && byId.has(want)) {
    return { open: new Set(ancestorsOf(want)), selected: want }
  }
  return { open: new Set(), selected: null }
}

export default function App() {
  const init = useMemo(initialState, [])
  const [open, setOpen] = useState<Set<string>>(init.open)
  const [selectedId, setSelectedId] = useState<string | null>(init.selected)
  const [search, setSearch] = useState('')
  const [valveOnly, setValveOnly] = useState(false)
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({
    id: init.selected,
    nonce: 0,
  })

  const visible = useMemo(() => computeVisible(open), [open])

  const bumpFocus = useCallback(
    (id: string | null) => setFocus((f) => ({ id, nonce: f.nonce + 1 })),
    [],
  )

  const select = useCallback(
    (id: string | null) => {
      setSelectedId(id)
      if (id) bumpFocus(id)
    },
    [bumpFocus],
  )

  const openNode = useCallback((id: string) => {
    setOpen((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const toggleOpen = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const reveal = useCallback(
    (id: string) => {
      setOpen((prev) => {
        const next = new Set(prev)
        for (const a of ancestorsOf(id)) next.add(a)
        return next
      })
      setSelectedId(id)
      bumpFocus(id)
    },
    [bumpFocus],
  )

  const actions = useMemo<MapActions>(
    () => ({ toggleOpen, open: openNode, select, reveal }),
    [toggleOpen, openNode, select, reveal],
  )

  const expandZones = useCallback(() => {
    setOpen(new Set(roots.filter((r) => isContainer(r.id)).map((r) => r.id)))
  }, [])

  const collapseAll = useCallback(() => {
    setOpen(new Set())
    bumpFocus(null)
  }, [bumpFocus])

  const reset = useCallback(() => bumpFocus(null), [bumpFocus])

  return (
    <MapActionsContext.Provider value={actions}>
      <div className="arch-map">
        <Header />

        <div className="subbar">
          <div className="subbar-left">
            <div className="view-meta">
              <span className="view-eyebrow">Systems architecture</span>
              <span className="view-title">The whole firm, one map</span>
            </div>
          </div>
          <Toolbar
            search={search}
            onSearch={setSearch}
            valveOnly={valveOnly}
            onToggleValve={() => setValveOnly((v) => !v)}
            onExpandZones={expandZones}
            onCollapseAll={collapseAll}
            onReset={reset}
            anyOpen={open.size > 0}
          />
        </div>

        <div className="canvas">
          <div className="flow-wrap">
            <Map
              open={open}
              visible={visible}
              selectedId={selectedId}
              search={search}
              valveOnly={valveOnly}
              focus={focus}
            />
            <Legend />
          </div>
          <InfoPanel
            selectedId={selectedId}
            open={open}
            onClose={() => setSelectedId(null)}
          />
        </div>
      </div>
    </MapActionsContext.Provider>
  )
}
