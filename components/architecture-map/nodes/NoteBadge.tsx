// Small "N notes" marker shown on a card that has team notes. Rendered inline
// in the node head, styled like the existing tags. Renders nothing when zero.
export function NoteBadge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="tag tag-note" title={`${n} team note${n === 1 ? "" : "s"}`}>
      ✎ {n}
    </span>
  );
}
