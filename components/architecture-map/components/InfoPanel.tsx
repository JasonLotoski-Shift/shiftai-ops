import { useState } from 'react'
import type { Source } from '../lib/types'
import { ownerColor, ownerLabel } from '../lib/tokens'
import { byId, childrenOf, ancestorsOf, connsOf, isContainer } from '../model'
import { useMapActions } from '../lib/actions'
import { useNotes, relTime } from '../lib/notes'

interface Props {
  selectedId: string | null
  open: Set<string>
  onClose: () => void
}

const SOURCE_LABEL: Record<Source, { text: string; tone: string }> = {
  real: { text: 'Running today', tone: 'gold' },
  'in-build': { text: 'In build', tone: 'gold' },
  scoped: { text: 'Scoped', tone: 'steel' },
  planned: { text: 'Planned', tone: 'muted' },
  example: { text: 'Illustrative', tone: 'muted' },
}

export function InfoPanel({ selectedId, open, onClose }: Props) {
  const actions = useMapActions()
  const node = selectedId ? byId.get(selectedId) ?? null : null

  if (!node) {
    return (
      <aside className="side-panel empty">
        <div className="sp-eyebrow">Master architecture map</div>
        <p className="sp-blurb">
          One firm, one system. The seven zones, the ownership boundary, and the
          three valves. Click any zone to expand it in place; click again, deeper.
        </p>
        <div className="sp-block">
          <div className="sp-label">How to read it</div>
          <ul className="sp-list">
            <li>Color is ownership · gold is Shift, steel is the client, grey is external, dashed gold is R&amp;D.</li>
            <li>Click a box with a <b className="inline-plus">＋</b> to open it. Connections re-route to the depth you are at.</li>
            <li>The three valves are the load-bearing edges. Use <b>Show valves</b> to see only them.</li>
          </ul>
        </div>
        <p className="sp-hint">
          Select any node to see what is inside it, who owns it, the rule that
          holds it, and everything it connects to.
        </p>
      </aside>
    )
  }

  const accent = ownerColor[node.owner]
  const crumbs = ancestorsOf(node.id)
  const kids = childrenOf(node.id)
  const conns = connsOf(node.id)
  const isOpen = open.has(node.id) && isContainer(node.id)
  const src = node.source ? SOURCE_LABEL[node.source] : null

  return (
    <aside className="side-panel">
      <button className="sp-close" onClick={onClose} title="Close">
        ×
      </button>

      {crumbs.length > 0 && (
        <div className="sp-crumbs">
          {crumbs.map((c, i) => (
            <span key={c} className="sp-crumb-wrap">
              <button className="sp-crumb" onClick={() => actions.reveal(c)}>
                {byId.get(c)?.title}
              </button>
              {i < crumbs.length - 1 && <span className="sp-crumb-sep">›</span>}
            </span>
          ))}
        </div>
      )}

      <div className="sp-owner" style={{ ['--accent' as string]: accent }}>
        <span className="sp-dot" />
        {ownerLabel[node.owner]}
        {src && <span className={`sp-source tone-${src.tone}`}>{src.text}</span>}
        {node.isNew && <span className="tag tag-new">NEW</span>}
        {node.revised && <span className="tag tag-rev">REVISED</span>}
      </div>

      <h2 className="sp-title">{node.title}</h2>
      {node.subtitle && <div className="sp-sub">{node.subtitle}</div>}

      {node.status && (
        <div className={`sp-status tone-${node.status.tone ?? 'muted'}`}>
          {node.status.text}
        </div>
      )}
      {node.pin && <span className="sp-pin">{node.pin}</span>}

      {isContainer(node.id) && (
        <button
          className="sp-expand"
          onClick={() => actions.toggleOpen(node.id)}
        >
          {isOpen ? 'Collapse ▴' : `Expand ▾  ·  ${kids.length} inside`}
        </button>
      )}

      {node.about && <p className="sp-about">{node.about}</p>}

      {node.chips && node.chips.length > 0 && (
        <div className="sp-block">
          <div className="sp-label">Enabled modules</div>
          <div className="sp-chips">
            {node.chips.map((c) => (
              <span key={c.label} className={`chip chip-${c.kind}`}>
                {c.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {kids.length > 0 && (
        <div className="sp-block">
          <div className="sp-label">What is inside · {kids.length}</div>
          <div className="sp-children">
            {kids.map((k) => (
              <button
                key={k.id}
                className={`sp-child owner-${k.owner}`}
                onClick={() => actions.reveal(k.id)}
                title={k.subtitle}
              >
                <span className="sp-child-dot" style={{ background: ownerColor[k.owner] }} />
                <span className="sp-child-title">{k.title}</span>
                {isContainer(k.id) && <span className="sp-child-more">›</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {node.inside && node.inside.length > 0 && (
        <div className="sp-block">
          <div className="sp-label">Detail</div>
          <ul className="sp-list">
            {node.inside.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      {node.rule && (
        <div className="sp-block">
          <div className="sp-label">The rule that holds it</div>
          <p className="sp-rule">{node.rule}</p>
        </div>
      )}

      {conns.length > 0 && (
        <div className="sp-block">
          <div className="sp-label">Connections · {conns.length}</div>
          <div className="sp-conns">
            {conns.map((c, i) => {
              const out = c.source === node.id
              const otherId = out ? c.target : c.source
              const other = byId.get(otherId)
              const arrow =
                c.type === 'never' ? '✕' : c.type === 'two-way' ? '↔' : out ? '→' : '←'
              return (
                <button
                  key={`${otherId}-${i}`}
                  className={`sp-conn etype-${c.type}`}
                  onClick={() => actions.reveal(otherId)}
                >
                  <span className="sp-conn-row">
                    <span className="sp-conn-arrow">{arrow}</span>
                    {c.valve && <span className="sp-conn-valve">V{c.valve}</span>}
                    <span className="sp-conn-target">{other?.title}</span>
                  </span>
                  {(c.label || c.detail) && (
                    <span className="sp-conn-label">{c.detail ?? c.label}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {node.note && <p className="sp-note">{node.note}</p>}

      <NotesSection nodeId={node.id} />
    </aside>
  )
}

// Team notes for one card. A thread anyone can add to; anyone can delete any
// note. Optimistic via the NotesContext — the list updates the moment the
// server action resolves, without re-rendering the page or resetting the map.
function NotesSection({ nodeId }: { nodeId: string }) {
  const { notesByNode, addNote, deleteNote, busy } = useNotes()
  const [draft, setDraft] = useState('')
  const notes = notesByNode[nodeId] ?? []

  const submit = async () => {
    const body = draft.trim()
    if (!body || busy) return
    setDraft('')
    await addNote(nodeId, body)
  }

  return (
    <div className="sp-block sp-notes-block">
      <div className="sp-label">Team notes · {notes.length}</div>

      {notes.length > 0 ? (
        <div className="sp-notes">
          {notes.map((n) => (
            <div key={n.id} className="sp-note-item">
              <div className="sp-note-head">
                <span className="sp-note-author">{n.authorName}</span>
                <span className="sp-note-time">{relTime(n.createdAt)}</span>
                <button
                  className="sp-note-del"
                  title="Delete note"
                  disabled={busy}
                  onClick={() => deleteNote(nodeId, n.id)}
                >
                  ×
                </button>
              </div>
              <p className="sp-note-body">{n.body}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="sp-note-empty">No notes yet — add the first.</p>
      )}

      <textarea
        className="sp-note-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note for the team…"
        rows={2}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            void submit()
          }
        }}
      />
      <button
        className="sp-note-add"
        disabled={busy || draft.trim().length === 0}
        onClick={() => void submit()}
      >
        {busy ? 'Saving…' : 'Add note'}
      </button>
    </div>
  )
}
