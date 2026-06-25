import { Card, Skeleton } from "@/components/ui";

// Instant fallback shown on every in-app navigation while the destination
// route's server render + DB queries resolve. Without this, the App Router
// holds the OLD page frozen on screen until the new render finishes — this
// file is what turns a tab click into "instant skeleton, then content" and
// re-enables <Link> prefetch for the whole (app) group.
//
// It mirrors the common page chrome (header band + 3-up stat row + a list)
// so the swap to real content lands with minimal layout shift. It is ALWAYS
// replaced by a fresh dynamic render — it can never show stale data.
export default function AppLoading() {
  return (
    <>
      {/* Header band — matches components/header.tsx layout */}
      <div className="bg-bitumen">
        <div className="flex items-center justify-between px-8 py-3">
          <Skeleton className="h-9 w-[400px]" />
          <Skeleton className="h-7 w-7 rounded-[var(--radius-pill)]" />
        </div>
        <div className="px-8 py-6 flex flex-col gap-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-72" />
        </div>
      </div>

      {/* Content area */}
      <div className="px-8 py-8 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5 flex flex-col gap-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-16" />
            </Card>
          ))}
        </div>

        <Card className="p-5 flex flex-col gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-9 w-9 rounded-[var(--radius-pill)]" />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}
