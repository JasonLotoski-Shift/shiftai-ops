import Link from "next/link";
import { Sparkles, FileInput, ShieldAlert } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";

// Repointed to the unified ingest composer. The old bespoke drop/extract UI
// (paste → extractProjectDrop → one-shot project proposal) is superseded by the
// single composer at /ingest, which proposes changes across one-or-many records
// and reviews every ADD / OVERWRITE before anything is written. We pre-focus the
// composer on this project so a drop here lands scoped exactly as before.
export function ProjectDropPanel({ projectId }: { projectId: string }) {
  return (
    <Card className="border border-track-gold/40 bg-track-gold-dim/5">
      <CardHeader className="flex items-center gap-2">
        <Sparkles size={14} strokeWidth={1.5} className="text-track-gold" />
        <h2 className="title-md text-track-gold">Ingest into this project</h2>
      </CardHeader>
      <div className="px-5 pb-5 flex flex-col gap-4">
        <p className="text-[12px] text-bone-mute leading-relaxed">
          Drop a doc, an email thread, or paste notes in the composer. Claude detects which records the
          content touches, proposes milestones, tasks, contact facts, and a summary — pre-focused on this
          project — and holds it all for your review. Nothing is written until you approve it.
        </p>

        <div className="flex items-start gap-2 px-3 py-2 bg-bitumen rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-track-gold shrink-0 mt-0.5" />
          <span className="text-[12px] text-bone-dim">
            Every ADD is approved and every OVERWRITE shows before → after. Propose-never-auto-write.
          </span>
        </div>

        <Link
          href={`/ingest?focus=project:${projectId}`}
          className="inline-flex items-center justify-center gap-2 font-medium rounded-[var(--radius)] transition-colors focus-gold bg-track-gold text-ink hover:bg-track-gold/90 h-7 px-3 text-[12px] w-fit self-end"
        >
          <FileInput size={13} strokeWidth={1.5} />
          Open composer
        </Link>
      </div>
    </Card>
  );
}
