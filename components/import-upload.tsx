"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { FileUp, X, ShieldAlert, CheckCircle2, Sparkles } from "lucide-react";
import { Button, Card, Label, Select } from "@/components/ui";
import {
  applyMapping,
  detectSource,
  heuristicMapping,
  isEmptyRow,
  MAPPABLE_FIELDS,
  type CleanedImportRow,
} from "@/lib/import-shared";
import type { ImportColumnMapping } from "@/lib/types";
import {
  createImportBatch,
  finalizeImport,
  importContactsChunk,
  mapColumns,
} from "@/app/(app)/import/actions";

const CHUNK_SIZE = 500;

type Parsed = {
  filename: string;
  source: "linkedin" | "google" | "other";
  headers: string[];
  rows: Record<string, string>[];
};

type Result = { imported: number; duplicates: number; needsId: number; total: number };

export function ImportUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<ImportColumnMapping>({});
  const [mappingTouched, setMappingTouched] = useState(false);
  const [aiMapping, setAiMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setParsed(null);
    setMapping({});
    setMappingTouched(false);
    setError(null);
    setProgress(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFile(file: File) {
    setError(null);
    setResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        const rows = (res.data ?? []).filter((r) => r && typeof r === "object");
        if (headers.length === 0 || rows.length === 0) {
          setError("Couldn't read any rows from that file. Is it a CSV with a header row?");
          return;
        }
        const source = detectSource(headers);
        const heuristic = heuristicMapping(headers);
        setParsed({ filename: file.name, source, headers, rows });
        setMapping(heuristic);
        setMappingTouched(false);

        // Refine the mapping with the AI mapper — overlays only if the partner
        // hasn't started editing. Failure is silent (heuristic already shown).
        setAiMapping(true);
        mapColumns(headers, rows.slice(0, 5))
          .then((ai) => {
            setMapping((cur) => (mappingTouched ? cur : { ...heuristic, ...ai }));
          })
          .catch(() => {})
          .finally(() => setAiMapping(false));
      },
      error: (err) => setError(`Parse error: ${err.message}`),
    });
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function setField(key: keyof ImportColumnMapping, value: string) {
    setMappingTouched(true);
    setMapping((m) => ({ ...m, [key]: value || undefined }));
  }

  function runImport() {
    if (!parsed) return;
    setError(null);

    const cleaned: CleanedImportRow[] = parsed.rows
      .map((r) => applyMapping(r, mapping))
      .filter((r) => !isEmptyRow(r));

    if (cleaned.length === 0) {
      setError("No usable rows — check the column mapping (at least a name, email, or company).");
      return;
    }

    startTransition(async () => {
      try {
        setProgress({ done: 0, total: cleaned.length });
        const { batchId } = await createImportBatch({
          filename: parsed.filename,
          source: parsed.source,
          columnMapping: mapping,
          totalRows: cleaned.length,
        });

        let done = 0;
        for (let i = 0; i < cleaned.length; i += CHUNK_SIZE) {
          const chunk = cleaned.slice(i, i + CHUNK_SIZE);
          await importContactsChunk(batchId, chunk);
          done += chunk.length;
          setProgress({ done, total: cleaned.length });
        }

        const totals = await finalizeImport(batchId);
        setResult(totals);
        setProgress(null);
        setParsed(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
        setProgress(null);
      }
    });
  }

  // Mapped preview (first 6 non-empty rows).
  const preview = parsed
    ? parsed.rows
        .map((r) => applyMapping(r, mapping))
        .filter((r) => !isEmptyRow(r))
        .slice(0, 6)
    : [];

  const sourceLabel = parsed
    ? { linkedin: "LinkedIn export", google: "Google Contacts export", other: "CSV" }[parsed.source]
    : "";

  return (
    <Card className="p-0 overflow-hidden">
      {!parsed ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="m-5 rounded-[var(--radius-lg)] border-2 border-dashed border-graphite-2 hover:border-bone-mute transition-colors px-8 py-12 flex flex-col items-center gap-4 text-center"
        >
          <FileUp size={30} strokeWidth={1.5} className="text-bone-mute" />
          <div className="flex flex-col gap-1">
            <span className="text-[14px] text-bone">Drop a CSV here, or choose a file</span>
            <span className="text-[12px] text-bone-mute">
              LinkedIn connections, Google Contacts, or any CSV with a header row
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onInputChange}
            className="hidden"
            id="import-csv-input"
          />
          <Button variant="primary" size="sm" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>

          {result && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 border border-track-gold/40 bg-track-gold-dim/10 rounded-[var(--radius)]">
              <CheckCircle2 size={14} strokeWidth={1.5} className="text-track-gold" />
              <span className="text-[12px] text-bone-dim">
                Imported {result.imported} contact{result.imported === 1 ? "" : "s"}
                {result.duplicates > 0 && ` · ${result.duplicates} duplicate skipped`}
                {result.needsId > 0 && ` · ${result.needsId} need identification`}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
            <div className="flex items-center gap-3 min-w-0">
              <FileUp size={14} strokeWidth={1.5} className="text-track-gold shrink-0" />
              <span className="text-[13px] text-bone truncate">{parsed.filename}</span>
              <span className="label text-[9px]">{sourceLabel}</span>
              <span className="text-[11px] text-bone-mute">{parsed.rows.length} rows</span>
            </div>
            <button onClick={reset} className="text-bone-mute hover:text-bone" disabled={isPending}>
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>

          {/* Mapping */}
          <div className="px-5 py-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label gold>Column mapping</Label>
              {aiMapping && (
                <span className="flex items-center gap-1 text-[11px] text-bone-mute">
                  <Sparkles size={11} strokeWidth={1.5} className="text-track-gold" />
                  refining…
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {MAPPABLE_FIELDS.map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <Label>{f.label}</Label>
                  <Select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    disabled={isPending}
                  >
                    <option value="">— none —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="px-5 pb-5">
              <Label>Preview</Label>
              <div className="mt-2 overflow-x-auto rounded-[var(--radius)] border border-graphite">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-graphite">
                      {["Name", "Title", "Company", "Email", "Domain"].map((h) => (
                        <th key={h} className="px-3 py-2 text-[11px] text-bone-dim font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-b border-graphite last:border-0">
                        <td className="px-3 py-2 text-[12px] text-bone truncate max-w-[180px]">{r.name || "—"}</td>
                        <td className="px-3 py-2 text-[12px] text-bone-dim truncate max-w-[160px]">{r.title || "—"}</td>
                        <td className="px-3 py-2 text-[12px] text-bone-dim truncate max-w-[160px]">{r.company || "—"}</td>
                        <td className="px-3 py-2 text-[12px] text-bone-dim truncate max-w-[180px]">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-[12px] text-bone-mute truncate max-w-[140px]">{r.companyDomain || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-5 mb-4 flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-graphite">
            <span className="text-[12px] text-bone-mute">
              {progress
                ? `Importing ${progress.done} / ${progress.total}…`
                : "Contacts import privately — only you will see them."}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={runImport} disabled={isPending}>
                {isPending ? "Importing…" : "Import contacts"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
