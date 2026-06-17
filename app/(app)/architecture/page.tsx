import { ArchitectureMapLoader } from "@/components/architecture-map/loader";

export const metadata = {
  title: "Architecture · Shift AI Ops",
};

// The map paints its own full-bleed dark canvas (.arch-map is position:absolute
// inset:0), so it needs a positioned parent that fills the main area. The (app)
// layout's <main> is a flex column, so flex-1 + min-h-0 makes this grow to the
// full height; `relative` anchors the map's inset:0.
export default function ArchitecturePage() {
  return (
    <div className="relative flex-1 min-h-0">
      <ArchitectureMapLoader />
    </div>
  );
}
