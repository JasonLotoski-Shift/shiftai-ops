import { createContext, useContext } from 'react'

// Callbacks the custom node components fire back into the app. One canvas, so
// everything is expand / collapse / select / reveal — no view switching.
export interface MapActions {
  toggleOpen: (id: string) => void // open if closed, close if open
  open: (id: string) => void // open a container (no-op if already open)
  select: (id: string | null) => void // show in the info panel
  reveal: (id: string) => void // open every ancestor, select, and center it
}

export const MapActionsContext = createContext<MapActions>({
  toggleOpen: () => {},
  open: () => {},
  select: () => {},
  reveal: () => {},
})

export const useMapActions = () => useContext(MapActionsContext)
