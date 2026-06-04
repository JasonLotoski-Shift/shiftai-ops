"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Tabs } from "@/components/ui";
import { ImportUpload } from "@/components/import-upload";
import { ImportMasterTable, type MasterRow } from "@/components/import-master-table";
import { ScanReportView } from "@/components/scan-report-view";
import { NewScanModal, type SegmentSeed } from "@/components/new-scan-modal";
import { getScanRunStatus } from "@/app/(app)/import/scan-actions";
import type { ScanCriteria } from "@/lib/types";

export type ReportMeta = {
  id: string;
  title: string;
  status: string;
  scoredCount: number;
  totalCount: number;
  criteria: ScanCriteria | null;
};

export function ImportView({
  masterRows,
  totalContacts,
  cap,
  batchCount,
  reports,
  segments,
  activeScanRunId,
}: {
  masterRows: MasterRow[];
  totalContacts: number;
  cap: number;
  batchCount: number;
  reports: ReportMeta[];
  segments: SegmentSeed[];
  activeScanRunId: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<string>("master");
  const [modalOpen, setModalOpen] = useState(false);
  const [runningScanId, setRunningScanId] = useState<string | null>(activeScanRunId);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Poll a running scan; refresh + reveal its report when it finishes.
  const refreshRef = useRef(router.refresh);
  refreshRef.current = router.refresh;
  useEffect(() => {
    if (!runningScanId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const s = await getScanRunStatus(runningScanId);
        if (cancelled) return;
        if (!s) {
          setRunningScanId(null);
          setProgress(null);
          return;
        }
        setProgress({ done: s.done, total: s.total });
        if (s.status === "done" || s.status === "error") {
          setRunningScanId(null);
          setProgress(null);
          refreshRef.current();
          return;
        }
        timer = setTimeout(poll, 8000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 8000);
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runningScanId]);

  // If the active tab points at a report that no longer exists, fall back.
  useEffect(() => {
    if (tab !== "master" && !reports.some((r) => r.id === tab)) setTab("master");
  }, [reports, tab]);

  function onScanStarted(scanRunId: string) {
    setModalOpen(false);
    setRunningScanId(scanRunId);
    setProgress({ done: 0, total: 0 });
    setTab(scanRunId);
    router.refresh(); // surface the new (pending) report tab immediately
  }

  const tabs = [
    { key: "master", label: "Master list", count: totalContacts },
    ...reports.map((r) => ({ key: r.id, label: r.title, count: r.scoredCount })),
  ];

  const activeReport = reports.find((r) => r.id === tab) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ImportUpload />

      {runningScanId && (
        <div className="flex items-center gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)]">
          <Loader2 size={13} strokeWidth={1.5} className="text-track-gold animate-spin" />
          <span className="text-[12px] text-bone-dim">
            Scan running{progress && progress.total > 0 ? ` — ${progress.done}/${progress.total}` : "…"}. You can keep working; the report fills in here.
          </span>
        </div>
      )}

      <div className="border-b border-graphite overflow-x-auto">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === "master" ? (
        <ImportMasterTable
          rows={masterRows}
          totalContacts={totalContacts}
          cap={cap}
          batchCount={batchCount}
          reportCount={reports.length}
          onNewScan={() => setModalOpen(true)}
          canScan={totalContacts > 0}
        />
      ) : activeReport ? (
        <ScanReportView
          key={activeReport.id}
          scanRunId={activeReport.id}
          title={activeReport.title}
          criteria={activeReport.criteria}
          status={activeReport.status}
          scanning={runningScanId === activeReport.id}
          onDeleted={() => setTab("master")}
        />
      ) : null}

      {modalOpen && (
        <NewScanModal
          segments={segments}
          onClose={() => setModalOpen(false)}
          onStarted={onScanStarted}
        />
      )}
    </div>
  );
}
