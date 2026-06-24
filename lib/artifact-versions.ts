// Collapse an Artifact list into version lineages. A "head" is an artifact that
// nothing else supersedes (the current version). Each head carries its prior
// versions (older, newest-first) walked back through supersedesId. Pure — used by
// the deal Documents card + client Deliverables to show one record + a history.

export function groupArtifactVersions<T extends { id: string; supersedesId: string | null }>(
  arts: T[],
): { head: T; versions: T[] }[] {
  const byId = new Map(arts.map((a) => [a.id, a]));
  const superseded = new Set(arts.map((a) => a.supersedesId).filter((x): x is string => !!x));
  // Heads keep the input order (callers pass newest-first), so the card order holds.
  const heads = arts.filter((a) => !superseded.has(a.id));
  return heads.map((head) => {
    const versions: T[] = [];
    const seen = new Set<string>([head.id]); // cycle guard
    let cur = head.supersedesId;
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      const v = byId.get(cur)!;
      versions.push(v);
      cur = v.supersedesId;
    }
    return { head, versions };
  });
}
