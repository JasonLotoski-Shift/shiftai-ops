// The top bar. One canvas now, so there is no view switcher · just the brand
// and a one-line cue for how the map works.
export function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="wordmark">
          <span className="w-shift">SHIFT</span> <span className="w-ai">AI</span>
        </span>
        <span className="w-partners">Partners</span>
        <span className="header-divider" />
        <span className="header-sub">Master architecture map</span>
      </div>
      <div className="header-cue">
        Click a box to open it · click deeper to go further · color is ownership
      </div>
    </header>
  )
}
