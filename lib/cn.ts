import clsx, { type ClassValue } from "clsx";

// Class merge with a NARROW, width-only conflict resolver.
//
// Base UI components bake in `w-full` (Input, Select, …). When a caller appends a
// width override via className (`w-[76px]`, `w-20`, `w-auto`), plain clsx keeps
// BOTH classes and lets the CSS cascade pick a winner — which is source-order, not
// the author's intent. That let a base `w-full` swallow an override and collapse
// siblings in flex rows (the finance amount box, the commission % inputs, …).
//
// We resolve ONLY the width groups (`w-`, `min-w-`, `max-w-`), keeping the LAST
// occurrence per responsive/state variant — i.e. the appended override wins, every
// time. Colors, padding, height, and everything else are left exactly as clsx
// emitted them, so the custom design tokens (text-bone, bg-bitumen, …) are never
// touched. This is a deliberately tiny subset of what tailwind-merge does, chosen
// so it's safe without configuring the full custom theme.

// Match a width utility's group after any variant prefix: min-w / max-w / w.
const WIDTH_GROUP = /^(min-w|max-w|w)-/;

/** The conflict key for a class, or null if it isn't a width utility. Keyed by
 *  variant prefix + group so `sm:w-1/2` and `w-full` never collide. */
function widthKey(cls: string): string | null {
  const colon = cls.lastIndexOf(":");
  const variant = colon === -1 ? "" : cls.slice(0, colon + 1); // "", "sm:", "hover:"…
  const core = colon === -1 ? cls : cls.slice(colon + 1);
  const m = core.match(WIDTH_GROUP);
  return m ? `${variant}${m[1]}` : null;
}

export function cn(...inputs: ClassValue[]): string {
  const classes = clsx(inputs).split(/\s+/).filter(Boolean);

  // Record the LAST index of each width group; drop earlier duplicates only.
  const lastIndex = new Map<string, number>();
  classes.forEach((c, i) => {
    const k = widthKey(c);
    if (k) lastIndex.set(k, i);
  });

  return classes
    .filter((c, i) => {
      const k = widthKey(c);
      return k === null || lastIndex.get(k) === i;
    })
    .join(" ");
}
