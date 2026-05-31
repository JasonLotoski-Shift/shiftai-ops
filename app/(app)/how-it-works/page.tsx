import { Header } from "@/components/header";
import { HowItWorksView } from "@/components/how-it-works-view";

// Internal reference. The old static doc at public/docs/how-it-works.html stays
// on disk but is no longer used — this is a real themed page (server shell +
// client tabbed view) so it stays in step with the design system.

export default function HowItWorksPage() {
  return (
    <>
      <Header eyebrow="Reference" title="How the ops tool works" />

      <div className="px-8 py-8">
        <HowItWorksView />
      </div>
    </>
  );
}
