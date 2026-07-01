"use client";

// Add Expense or Invoice — the one action that adds anything to the AP/AR tab.
// Two modes: Invoice → a vendor bill (AP); Expense → a team spend. The receipt
// IS the file you attach to an expense — it's optional, and saving without one
// flags the expense "needs photo". Files base64-upload to the server action,
// which files them to Drive and writes the row.
//
// When you add a PHOTO, Claude vision scans it and prefills these fields — you
// confirm/correct before saving. PDFs skip the scan (entered by hand). Saving an
// expense without any file flags it "needs photo".

import { useRef, useState, useTransition } from "react";
import { X, Upload, ShieldAlert, FileCheck, Sparkles } from "lucide-react";
import { Button, Label, Input, Textarea, Select } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import { EXPENSE_CATEGORY_OPTIONS, EXPENSE_KIND_LABELS } from "@/lib/finance";
import type { ExpenseCategory, ExpenseKind, MileageUnit } from "@/lib/types";
import { createBill, createExpense, scanReceipt, type FinanceFile, type ScanResult } from "@/app/(app)/financials/finance-actions";
import { VendorPicker, type VendorPick } from "@/components/billing/vendor-picker";

type Mode = "expense" | "invoice";
// Vercel caps a serverless request body at ~4.5 MB — a HARD platform limit the
// Next bodySizeLimit can't lift. base64 inflates ~33%, so keep the raw file under
// ~3 MB (→ ~4 MB encoded) to stay under it. Phase 2 can downscale images here.
const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB

function readFileAsBase64(file: File): Promise<FinanceFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      resolve({ base64, mimeType: file.type || "application/octet-stream", fileName: file.name });
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function UploadFinanceModal({
  consultants,
  clients,
  projects,
  onClose,
  onSaved,
}: {
  consultants: { id: string; name: string }[];
  clients: { id: string; company: string }[];
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<Mode>("expense");
  const isBill = mode === "invoice";

  // shared
  const [file, setFile] = useState<FinanceFile | null>(null);
  const [vendor, setVendor] = useState("");
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");

  // bill
  const [number, setNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState(todayISO());
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");

  // expense
  const [kind, setKind] = useState<ExpenseKind>("reimbursable");
  const [category, setCategory] = useState<ExpenseCategory>("travel_meals");
  const [description, setDescription] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [paidById, setPaidById] = useState("");
  const [mileageUnit, setMileageUnit] = useState<MileageUnit>("km");
  const [mileageKm, setMileageKm] = useState("");
  const [renewalDate, setRenewalDate] = useState("");

  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isMileageKm = !isBill && category === "fuel_mileage" && mileageUnit === "km";

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    setScanNote(null);
    if (f.size > MAX_FILE_BYTES) {
      setErr(`"${f.name}" is too large (max 3 MB). Use a smaller photo or PDF.`);
      return;
    }
    let ff: FinanceFile;
    try {
      ff = await readFileAsBase64(f);
      setFile(ff);
    } catch {
      setErr("Couldn't read that file. Try another.");
      return;
    }
    // Auto-scan photos with Claude vision and prefill the form; PDFs are entered
    // by hand. scanReceipt swallows its own failures (returns empty), so a bad
    // read just leaves the fields for manual entry.
    if (f.type.startsWith("image/")) {
      setScanning(true);
      try {
        applyScan(await scanReceipt({ base64: ff.base64, mediaType: ff.mimeType }));
      } finally {
        setScanning(false);
      }
    }
  }

  // Prefill from a scan — overwrite only the fields the scan actually read.
  function applyScan(r: ScanResult) {
    let filled = 0;
    if (r.docType === "invoice") setMode("invoice");
    else if (r.docType === "receipt" && mode === "invoice") setMode("expense");
    if (r.vendor) { setVendor(r.vendor); setVendorId(null); filled++; }
    if (r.amount != null) { setAmount(String(r.amount)); filled++; }
    if (r.date) { setIssuedAt(r.date); setSpentAt(r.date); filled++; }
    if (r.category) { setCategory(r.category); filled++; }
    if (r.invoiceNumber) setNumber(r.invoiceNumber);
    setScanNote(
      filled === 0
        ? "Couldn't read the details from that photo — please fill them in."
        : `Prefilled from the photo${r.confidence ? ` · ${r.confidence} confidence` : ""} — check each field before saving.`,
    );
  }

  // Pick/create a managed vendor, or type a plain name. Picking one carries its
  // default category onto an expense (bills have no category field here).
  function onVendor(v: VendorPick) {
    setVendor(v.name);
    setVendorId(v.id);
    if (!isBill && v.id && v.defaultCategory) setCategory(v.defaultCategory);
  }

  function canSave(): boolean {
    if (isBill) return !!vendor.trim() && Number(amount) > 0;
    if (isMileageKm) return Number(mileageKm) > 0;
    return Number(amount) > 0;
  }

  function save() {
    setErr(null);
    startSave(async () => {
      try {
        if (isBill) {
          await createBill({
            vendor: vendor.trim(),
            vendorId,
            number: number.trim() || null,
            amount: Math.round(Number(amount)),
            category: null,
            issuedAt: issuedAt || null,
            dueAt: dueAt || null,
            notes: notes.trim() || null,
            clientId: clientId || null,
            projectId: projectId || null,
            file,
          });
        } else {
          await createExpense({
            kind,
            category,
            vendor: vendor.trim() || null,
            vendorId,
            description: description.trim() || null,
            amount: isMileageKm ? 0 : Math.round(Number(amount)),
            spentAt,
            mileageUnit: category === "fuel_mileage" ? mileageUnit : null,
            mileageKm: isMileageKm ? Number(mileageKm) : null,
            paidByConsultantId: kind === "reimbursable" ? paidById || null : null,
            recurring: kind === "subscription",
            renewalDate: kind === "subscription" ? renewalDate || null : null,
            clientId: clientId || null,
            projectId: projectId || null,
            file,
          });
        }
        setSaved(true);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  const modeChips: { key: Mode; label: string }[] = [
    { key: "expense", label: "Expense" },
    { key: "invoice", label: "Invoice (AP)" },
  ];

  return (
    <ModalShell onClose={onClose} guard={!saved}>
      <div className="w-full max-w-[680px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Upload size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Add Expense or Invoice</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {saved ? (
          <div className="px-5 py-12 text-center">
            <div className="title-md text-track-gold mb-2 inline-block">Saved</div>
            <p className="text-[13px] text-bone-dim">
              {isBill ? "Bill added to Payable" : "Expense logged"}
              {file ? " · filed to Drive." : " · no photo yet (flagged “needs photo”)."}
            </p>
            <div className="pt-5 flex justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={onSaved}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-5 flex flex-col gap-4">
            {/* mode selector */}
            <div className="flex items-center gap-2">
              {modeChips.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "px-3 py-1.5 text-[12px] font-medium rounded-[var(--radius)] border transition-colors",
                    mode === m.key
                      ? "border-track-gold text-bone bg-track-gold-dim/15"
                      : "border-graphite text-bone-mute hover:text-bone-dim",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* file picker + auto-scan */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onPickFile} className="hidden" />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={isSaving || scanning}>
                  <Upload size={13} strokeWidth={1.5} />
                  {file ? "Replace file" : isBill ? "Add invoice photo / PDF" : "Add receipt photo / PDF"}
                </Button>
                {scanning ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-track-gold">
                    <Sparkles size={13} strokeWidth={1.5} className="animate-pulse" />
                    Scanning…
                  </span>
                ) : file ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-signal-fresh">
                    <FileCheck size={13} strokeWidth={1.5} />
                    {file.fileName}
                  </span>
                ) : (
                  <span className="text-[12px] text-bone-mute">
                    {isBill
                      ? "optional — add the invoice to auto-scan, or save without one to flag “needs photo”"
                      : "optional — add the receipt to auto-scan, or save without one to flag “needs photo”"}
                  </span>
                )}
              </div>
              {scanNote && !scanning && (
                <div className="flex items-start gap-2 px-3 py-2 border border-track-gold/30 bg-track-gold-dim/10 rounded-[var(--radius)]">
                  <Sparkles size={12} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
                  <span className="text-[12px] text-bone-dim">{scanNote}</span>
                </div>
              )}
            </div>

            {isBill ? (
              <BillFields
                vendor={vendor} vendorId={vendorId} onVendor={onVendor}
                number={number} setNumber={setNumber}
                amount={amount} setAmount={setAmount}
                issuedAt={issuedAt} setIssuedAt={setIssuedAt}
                dueAt={dueAt} setDueAt={setDueAt}
                notes={notes} setNotes={setNotes}
                disabled={isSaving}
              />
            ) : (
              <ExpenseFields
                kind={kind} setKind={setKind}
                category={category} setCategory={setCategory}
                vendor={vendor} vendorId={vendorId} onVendor={onVendor}
                description={description} setDescription={setDescription}
                amount={amount} setAmount={setAmount}
                spentAt={spentAt} setSpentAt={setSpentAt}
                paidById={paidById} setPaidById={setPaidById}
                mileageUnit={mileageUnit} setMileageUnit={setMileageUnit}
                mileageKm={mileageKm} setMileageKm={setMileageKm}
                renewalDate={renewalDate} setRenewalDate={setRenewalDate}
                consultants={consultants}
                isMileageKm={isMileageKm}
                disabled={isSaving}
              />
            )}

            {/* optional client / project tag */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>Tag a client (optional)</Label>
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isSaving}>
                  <option value="">— none —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Tag a project (optional)</Label>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={isSaving}>
                  <option value="">— none —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
            </div>

            {err && (
              <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
                <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
                <span className="text-[12px] text-bone-dim">{err}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={!canSave() || isSaving || scanning} onClick={save}>
                {isSaving ? "Saving…" : isBill ? "Add bill" : "Save expense"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function BillFields(p: {
  vendor: string; vendorId: string | null; onVendor: (v: VendorPick) => void;
  number: string; setNumber: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  issuedAt: string; setIssuedAt: (v: string) => void;
  dueAt: string; setDueAt: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Vendor <span className="text-flag-red">*</span></Label>
          <VendorPicker value={{ id: p.vendorId, name: p.vendor }} onChange={p.onVendor} disabled={p.disabled} placeholder="e.g. Stripe" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Invoice number</Label>
          <Input placeholder="INV-0045" value={p.number} onChange={(e) => p.setNumber(e.target.value)} disabled={p.disabled} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Amount (CAD) <span className="text-flag-red">*</span></Label>
          <Input type="number" inputMode="decimal" placeholder="1250" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} disabled={p.disabled} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Issued</Label>
          <Input type="date" value={p.issuedAt} onChange={(e) => p.setIssuedAt(e.target.value)} disabled={p.disabled} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Due</Label>
          <Input type="date" value={p.dueAt} onChange={(e) => p.setDueAt(e.target.value)} disabled={p.disabled} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Notes</Label>
        <Textarea rows={2} placeholder="Optional — what this bill is for" value={p.notes} onChange={(e) => p.setNotes(e.target.value)} disabled={p.disabled} />
      </div>
    </>
  );
}

function ExpenseFields(p: {
  kind: ExpenseKind; setKind: (v: ExpenseKind) => void;
  category: ExpenseCategory; setCategory: (v: ExpenseCategory) => void;
  vendor: string; vendorId: string | null; onVendor: (v: VendorPick) => void;
  description: string; setDescription: (v: string) => void;
  amount: string; setAmount: (v: string) => void;
  spentAt: string; setSpentAt: (v: string) => void;
  paidById: string; setPaidById: (v: string) => void;
  mileageUnit: MileageUnit; setMileageUnit: (v: MileageUnit) => void;
  mileageKm: string; setMileageKm: (v: string) => void;
  renewalDate: string; setRenewalDate: (v: string) => void;
  consultants: { id: string; name: string }[];
  isMileageKm: boolean;
  disabled: boolean;
}) {
  const isMileage = p.category === "fuel_mileage";
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Type</Label>
          <Select value={p.kind} onChange={(e) => p.setKind(e.target.value as ExpenseKind)} disabled={p.disabled}>
            {(Object.keys(EXPENSE_KIND_LABELS) as ExpenseKind[]).map((k) => (
              <option key={k} value={k}>{EXPENSE_KIND_LABELS[k]}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Category <span className="text-flag-red">*</span></Label>
          <Select value={p.category} onChange={(e) => p.setCategory(e.target.value as ExpenseCategory)} disabled={p.disabled}>
            {EXPENSE_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Vendor / merchant</Label>
          <VendorPicker value={{ id: p.vendorId, name: p.vendor }} onChange={p.onVendor} disabled={p.disabled} placeholder="e.g. Air Canada" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Date <span className="text-flag-red">*</span></Label>
          <Input type="date" value={p.spentAt} onChange={(e) => p.setSpentAt(e.target.value)} disabled={p.disabled} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Description</Label>
        <Input placeholder="Optional — what this was for, e.g. client dinner with Acme team" value={p.description} onChange={(e) => p.setDescription(e.target.value)} disabled={p.disabled} />
      </div>

      {isMileage && (
        <div className="flex items-center gap-2">
          {(["km", "receipt"] as MileageUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => p.setMileageUnit(u)}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium rounded-[var(--radius)] border transition-colors",
                p.mileageUnit === u ? "border-track-gold text-bone bg-track-gold-dim/15" : "border-graphite text-bone-mute hover:text-bone-dim",
              )}
            >
              {u === "km" ? "$/km (CRA rate)" : "Fuel receipt"}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {p.isMileageKm ? (
          <div className="flex flex-col gap-2">
            <Label>Kilometres <span className="text-flag-red">*</span></Label>
            <Input type="number" inputMode="decimal" placeholder="120" value={p.mileageKm} onChange={(e) => p.setMileageKm(e.target.value)} disabled={p.disabled} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label>Amount (CAD) <span className="text-flag-red">*</span></Label>
            <Input type="number" inputMode="decimal" placeholder="425" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} disabled={p.disabled} />
          </div>
        )}
        {p.kind === "reimbursable" && (
          <div className="flex flex-col gap-2">
            <Label>Paid by</Label>
            <Select value={p.paidById} onChange={(e) => p.setPaidById(e.target.value)} disabled={p.disabled}>
              <option value="">— me —</option>
              {p.consultants.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        )}
        {p.kind === "subscription" && (
          <div className="flex flex-col gap-2">
            <Label>Next renewal</Label>
            <Input type="date" value={p.renewalDate} onChange={(e) => p.setRenewalDate(e.target.value)} disabled={p.disabled} />
          </div>
        )}
      </div>
    </>
  );
}
