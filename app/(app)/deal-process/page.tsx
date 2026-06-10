import { Header } from "@/components/header";
import { DealProcessMap } from "@/components/deal-process-map";

// Internal reference — the firm's deal process as a visual track, from finding
// the lead to a signed engagement. Static content, no data fetch; the map
// component owns the hover-to-expand behavior.

export default function DealProcessPage() {
  return (
    <>
      <Header eyebrow="Reference" title="The deal process" />

      <div className="px-8 py-8">
        <DealProcessMap />
      </div>
    </>
  );
}
