import { Header } from "@/components/header";

// Static internal docs — the HTML lives at public/docs/how-it-works.html so it's
// self-contained (no React, no design-system imports) and can be opened
// standalone if needed. The page just frames it.

export default function HowItWorksPage() {
  return (
    <>
      <Header eyebrow="Reference" title="How the ops tool works" />
      <div className="flex-1 min-h-0">
        <iframe
          src="/docs/how-it-works.html"
          className="w-full h-[calc(100vh-145px)] border-0 bg-bitumen"
          title="How the ops tool works"
        />
      </div>
    </>
  );
}
