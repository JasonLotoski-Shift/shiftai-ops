// Server-side no-hallucination gate.
//
// The UI marks user-supplied blanks as [NEEDS INPUT — <what>] (see
// components/contact-actions.tsx DraftEmailModal). The UI's "Send" button
// is disabled if any marker remains, but a malicious or buggy client could
// still POST a string with [NEEDS INPUT — …] in it. This helper is the
// API-layer enforcement: call it before persisting any user-facing string
// that came through a Quick Action or AI surface, and let it throw.
//
// Phase 3b in docs/ROADMAP.md.

const NEEDS_INPUT_RE = /\[NEEDS INPUT\b/;

/**
 * Throws if `text` contains a [NEEDS INPUT — ...] marker. Use this on any
 * user-facing string before it's persisted as an Artifact, Interaction, or
 * Client/Contact field — the marker means "this is a known unknown, do not
 * commit it." `label` is purely for the error message (e.g. "email body").
 */
export function assertNoNeedsInput(text: string, label = "field"): void {
  if (NEEDS_INPUT_RE.test(text)) {
    const matches = text.match(/\[NEEDS INPUT[^\]]*\]/g) ?? [];
    throw new Error(
      `Refusing to persist ${label}: ${matches.length} [NEEDS INPUT] marker(s) remain. ` +
        `Fill them in before committing. First: ${matches[0]}`,
    );
  }
}
