import { Header } from "@/components/header";
import { HowItWorksView } from "@/components/how-it-works-view";

// Internal reference. A real themed page (server shell + client tabbed view), kept
// in step with the design system. (Replaced a static public/docs/how-it-works.html,
// removed in the 2026-06-29 cleanup.)

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
