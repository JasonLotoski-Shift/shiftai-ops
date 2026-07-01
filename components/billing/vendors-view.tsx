"use client";

// Vendors — the managed payee list (Financials → Vendors, managing partners).
// The curated set the finance pickers draw from: add a vendor, set its default
// category/currency (which pre-fill the finance form on pick), edit, or archive
// it (hidden from the pickers, history kept). Self-fetches so the page's AP/AR
// data load stays untouched; degrades to an empty list pre-migration.

import { useEffect, useState, useTransition } from "react";
import { Building2, Plus, Pencil, Archive, RotateCcw, Check, X } from "lucide-react";
import { Card, Label, Badge, Button, Input, Select, EmptyState } from "@/components/ui";
import { EXPENSE_CATEGORY_OPTIONS, EXPENSE_CATEGORY_LABELS } from "@/lib/finance";
import type { ExpenseCategory } from "@/lib/types";
import {
  listVendors,
  createVendor,
  updateVendor,
  setVendorArchived,
  type VendorRow,
} from "@/app/(app)/financials/vendor-actions";

const currencyOr = (c: string | null) => c || "CAD";

export function VendorsView() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // add form
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [cat, setCat] = useState<ExpenseCategory | "">("");
  const [cur, setCur] = useState("CAD");

  function refresh() {
    listVendors({ includeArchived: true })
      .then(setVendors)
      .catch(() => setErr("Couldn't load vendors."))
      .finally(() => setLoading(false));
  }
  useEffect(refresh, []);

  const active = vendors.filter((v) => !v.archived);
  const archived = vendors.filter((v) => v.archived);

  function add() {
    const n = name.trim();
    if (!n) return;
    setErr(null);
    startBusy(async () => {
      try {
        await createVendor({ name: n, defaultCategory: cat || null, defaultCurrency: cur.trim() || "CAD" });
        setName(""); setCat(""); setCur("CAD"); setAdding(false);
        refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't add the vendor.");
      }
    });
  }

  function archive(id: string, archived: boolean) {
    setErr(null);
    startBusy(async () => {
      try {
        await setVendorArchived(id, archived);
        refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't update the vendor.");
      }
    });
  }

  return (
    <div className="px-8 py-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="title-md">Vendors</h2>
          <p className="text-[12px] text-bone-mute">
            The payees bills and expenses recur against. Defaults pre-fill the finance form when you pick one.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAdding((a) => !a)} disabled={busy}>
          <Plus size={14} strokeWidth={1.5} />
          Add vendor
        </Button>
      </div>

      {err && <div className="px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)] text-[12px] text-bone-dim">{err}</div>}

      {adding && (
        <Card className="p-4 flex flex-col gap-3 border border-track-gold/40">
          <div className="grid grid-cols-[1.4fr_1fr_100px] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Name <span className="text-flag-red">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cloudflare" disabled={busy} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Default category</Label>
              <Select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | "")} disabled={busy}>
                <option value="">— none —</option>
                {EXPENSE_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Currency</Label>
              <Input value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} maxLength={3} className="text-center" disabled={busy} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={add} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add"}</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-[1.6fr_1.2fr_90px_120px] gap-3 px-5 py-2.5">
          <span className="text-[11px] text-bone-dim">Vendor</span>
          <span className="text-[11px] text-bone-dim">Default category</span>
          <span className="text-[11px] text-bone-dim">Currency</span>
          <span className="text-[11px] text-bone-dim text-right">Manage</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-[13px] text-bone-mute">Loading…</div>
        ) : active.length === 0 && archived.length === 0 ? (
          <EmptyState icon={<Building2 size={26} strokeWidth={1.5} />} title="No vendors yet" hint="Add the payees you bill against (Cloudflare, Anthropic, Vercel…) so filing a bill picks a known one." compact />
        ) : (
          <>
            {active.map((v) =>
              editingId === v.id ? (
                <VendorEditRow key={v.id} vendor={v} onDone={() => { setEditingId(null); refresh(); }} onError={setErr} />
              ) : (
                <VendorRowView key={v.id} v={v} onEdit={() => setEditingId(v.id)} onArchive={() => archive(v.id, true)} busy={busy} />
              ),
            )}
            {archived.length > 0 && (
              <div className="px-5 pt-4 pb-1 text-[11px] text-bone-mute uppercase tracking-wide border-t border-graphite/40">Archived</div>
            )}
            {archived.map((v) => (
              <div key={v.id} className="grid grid-cols-[1.6fr_1.2fr_90px_120px] gap-3 px-5 py-3 border-t border-graphite/40 items-center opacity-60">
                <span className="flex items-center gap-2 min-w-0">
                  <Building2 size={13} strokeWidth={1.5} className="text-bone-mute shrink-0" />
                  <span className="text-[13px] text-bone truncate">{v.name}</span>
                </span>
                <span className="text-[12px] text-bone-mute">{v.defaultCategory ? EXPENSE_CATEGORY_LABELS[v.defaultCategory] : "—"}</span>
                <span className="mono text-[12px] text-bone-mute">{currencyOr(v.defaultCurrency)}</span>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => archive(v.id, false)} disabled={busy}>
                    <RotateCcw size={13} strokeWidth={1.5} /> Restore
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

function VendorRowView({ v, onEdit, onArchive, busy }: { v: VendorRow; onEdit: () => void; onArchive: () => void; busy: boolean }) {
  return (
    <div className="grid grid-cols-[1.6fr_1.2fr_90px_120px] gap-3 px-5 py-3 border-t border-graphite/40 items-center">
      <span className="flex items-center gap-2 min-w-0">
        <Building2 size={13} strokeWidth={1.5} className="text-track-gold shrink-0" />
        <span className="text-[13px] text-bone truncate">{v.name}</span>
        {v.notes && <span className="text-[11px] text-bone-mute truncate">· {v.notes}</span>}
      </span>
      <span className="text-[12px] text-bone-dim">
        {v.defaultCategory ? <Badge tone="neutral">{EXPENSE_CATEGORY_LABELS[v.defaultCategory]}</Badge> : <span className="text-bone-mute">—</span>}
      </span>
      <span className="mono text-[12px] text-bone-dim">{currencyOr(v.defaultCurrency)}</span>
      <div className="flex justify-end items-center gap-1">
        <button onClick={onEdit} disabled={busy} title="Edit" className="text-bone-mute hover:text-bone p-1.5"><Pencil size={13} strokeWidth={1.5} /></button>
        <button onClick={onArchive} disabled={busy} title="Archive" className="text-bone-mute hover:text-flag-red p-1.5"><Archive size={13} strokeWidth={1.5} /></button>
      </div>
    </div>
  );
}

function VendorEditRow({ vendor, onDone, onError }: { vendor: VendorRow; onDone: () => void; onError: (e: string | null) => void }) {
  const [name, setName] = useState(vendor.name);
  const [cat, setCat] = useState<ExpenseCategory | "">(vendor.defaultCategory ?? "");
  const [cur, setCur] = useState(currencyOr(vendor.defaultCurrency));
  const [busy, startBusy] = useTransition();

  function save() {
    onError(null);
    startBusy(async () => {
      try {
        await updateVendor(vendor.id, { name: name.trim(), defaultCategory: cat || null, defaultCurrency: cur.trim() || "CAD" });
        onDone();
      } catch (e) {
        onError(e instanceof Error ? e.message : "Couldn't save the vendor.");
      }
    });
  }

  return (
    <div className="grid grid-cols-[1.6fr_1.2fr_90px_120px] gap-3 px-5 py-3 border-t border-graphite/40 items-center bg-track-gold-dim/5">
      <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className="h-8 text-[12px]" />
      <Select value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory | "")} disabled={busy} className="h-8 text-[12px]">
        <option value="">— none —</option>
        {EXPENSE_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      <Input value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} maxLength={3} disabled={busy} className="h-8 text-[12px] text-center" />
      <div className="flex justify-end items-center gap-1">
        <button onClick={save} disabled={busy || !name.trim()} title="Save" className="text-track-gold hover:text-bone p-1.5"><Check size={14} strokeWidth={1.5} /></button>
        <button onClick={onDone} disabled={busy} title="Cancel" className="text-bone-mute hover:text-bone p-1.5"><X size={14} strokeWidth={1.5} /></button>
      </div>
    </div>
  );
}
