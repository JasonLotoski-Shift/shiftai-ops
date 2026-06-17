interface Props {
  search: string
  onSearch: (v: string) => void
  valveOnly: boolean
  onToggleValve: () => void
  onExpandZones: () => void
  onCollapseAll: () => void
  onReset: () => void
  anyOpen: boolean
}

export function Toolbar({
  search,
  onSearch,
  valveOnly,
  onToggleValve,
  onExpandZones,
  onCollapseAll,
  onReset,
  anyOpen,
}: Props) {
  return (
    <div className="toolbar">
      <div className="search">
        <span className="search-icon">⌕</span>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Find anything"
          spellCheck={false}
        />
        {search && (
          <button className="search-clear" onClick={() => onSearch('')}>
            ×
          </button>
        )}
      </div>
      <button
        className={`tool-btn ${valveOnly ? 'on' : ''}`}
        onClick={onToggleValve}
        title="Show only the three valves · the data boundaries"
      >
        Show valves
      </button>
      <button className="tool-btn" onClick={onExpandZones} title="Open every top-level zone one level">
        Expand zones
      </button>
      <button
        className="tool-btn"
        onClick={onCollapseAll}
        disabled={!anyOpen}
        title="Collapse everything back to the seven zones"
      >
        Collapse all
      </button>
      <button className="tool-btn" onClick={onReset} title="Re-center the map">
        Reset view
      </button>
    </div>
  )
}
