import { C } from '../lib/tokens'

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-group">
        <span className="legend-title">Ownership</span>
        <span className="legend-item">
          <i className="sw-box" style={{ borderColor: C.gold }} /> Shift owns the IP
        </span>
        <span className="legend-item">
          <i className="sw-box" style={{ borderColor: C.steel }} /> Client owns it
        </span>
        <span className="legend-item">
          <i className="sw-box" style={{ borderColor: C.muted2 }} /> External, bought
        </span>
        <span className="legend-item">
          <i className="sw-box dash" style={{ borderColor: C.gold }} /> Shift R&D, unpriced
        </span>
      </div>
      <div className="legend-group">
        <span className="legend-title">Flow</span>
        <span className="legend-item">
          <i className="sw-line" style={{ background: C.gold }} /> One-way
        </span>
        <span className="legend-item">
          <i className="sw-line" style={{ background: C.boneEdge }} /> Two-way
        </span>
        <span className="legend-item">
          <i className="sw-line dash" style={{ background: C.red }} /> Never cross
        </span>
      </div>
      <div className="legend-group">
        <span className="legend-title">The three valves</span>
        <span className="legend-item">
          <b className="vnum">V1</b> Patterns up, never data
        </span>
        <span className="legend-item">
          <b className="vnum">V2</b> One client never reaches another
        </span>
        <span className="legend-item">
          <b className="vnum">V3</b> Metrics up, never records
        </span>
      </div>
    </div>
  )
}
