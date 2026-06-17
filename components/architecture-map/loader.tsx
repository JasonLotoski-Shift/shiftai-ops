"use client";

import dynamic from "next/dynamic";
import type { ArchitectureNoteDTO } from "./lib/notes";

// The map reads window.location at init and React Flow measures the DOM to lay
// out, so it must render client-side only — no SSR. A dynamic import with
// ssr:false is the supported way to do that, and Next 15 only allows ssr:false
// from inside a client component, which is why this thin wrapper exists.
const ArchitectureMap = dynamic(() => import("./App"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-bitumen">
      <span className="label">Loading map…</span>
    </div>
  ),
});

export function ArchitectureMapLoader({
  initialNotes,
}: {
  initialNotes: Record<string, ArchitectureNoteDTO[]>;
}) {
  return <ArchitectureMap initialNotes={initialNotes} />;
}
