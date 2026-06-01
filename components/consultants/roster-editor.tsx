"use client";

// Consultant roster editor — manage the firm's pay rate card in-app.
// Add a consultant, edit name/role/pay-rate/email/partner-link inline, and
// deactivate (soft delete). Pay rates are entered in DOLLARS/hr; the action
// converts to cents. Mirrors the inline-edit + add-form patterns used by the
// billing-schedule-editor.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Check, X, UserMinus, UserPlus } from "lucide-react";
import { Card, CardHeader, CardBody, Input, Select, Button, Badge, Label, EmptyState } from "@/components/ui";
import { createConsultant, updateConsultant, deactivateConsultant } from "@/lib/consultants/actions";

export type RosterConsultant = {
  id: string;
  name: string;
  role: string;
  payRateCents: number;
  email: string | null;
  active: boolean;
  partnerId: string | null;
  partnerName: string | null;
};

export type RosterPartner = { id: string; name: string };

const rate = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}/hr`;

export function RosterEditor({
  consultants,
  partners,
}: {
  consultants: RosterConsultant[];
  partners: RosterPartner[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = consultants.filter((c) => c.active);
  const inactive = consultants.filter((c) => !c.active);

  function run(fn: () => Promise<unknown>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h2 className="title-md">Consultant roster</h2>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => { setAdding(true); setEditingId(null); }}>
            <Plus size={13} strokeWidth={1.5} />
            Add consultant
          </Button>
        )}
      </CardHeader>

      {adding && (
        <div className="px-5 pb-4">
          <ConsultantForm
            partners={partners}
            isPending={isPending}
            onCancel={() => setAdding(false)}
            onSubmit={(v) => run(() => createConsultant(v), () => setAdding(false))}
          />
        </div>
      )}

      {consultants.length === 0 && !adding ? (
        <EmptyState title="No consultants yet" hint="Add the people you pay on projects — their fixed pay rate seeds each project's economics." compact />
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[1.4fr_1.2fr_120px_1fr_100px_72px] gap-3 px-5 py-2.5">
            <span className="text-[11px] text-bone-dim">Name</span>
            <span className="text-[11px] text-bone-dim">Role</span>
            <span className="text-[11px] text-bone-dim">Pay rate</span>
            <span className="text-[11px] text-bone-dim">E-transfer email</span>
            <span className="text-[11px] text-bone-dim">Partner</span>
            <span className="text-[11px] text-bone-dim text-right">Edit</span>
          </div>

          {active.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="px-5 py-3 border-t border-graphite/40">
                <ConsultantForm
                  partners={partners}
                  initial={c}
                  isPending={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(v) => run(() => updateConsultant(c.id, v), () => setEditingId(null))}
                />
              </div>
            ) : (
              <div key={c.id} className="grid grid-cols-[1.4fr_1.2fr_120px_1fr_100px_72px] gap-3 px-5 py-3 border-t border-graphite/40 items-center">
                <span className="text-[13px] text-bone truncate">{c.name}</span>
                <span className="text-[13px] text-bone-dim truncate">{c.role}</span>
                <span className="mono text-[13px] text-track-gold tabular-nums">{rate(c.payRateCents)}</span>
                <span className="text-[12px] text-bone-dim truncate">{c.email ?? "—"}</span>
                <span className="text-[12px] text-bone-mute truncate">{c.partnerName ?? "—"}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <button onClick={() => { setEditingId(c.id); setAdding(false); }} className="text-bone-mute hover:text-track-gold" title="Edit">
                    <Pencil size={13} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => run(() => deactivateConsultant(c.id))} disabled={isPending} className="text-bone-mute hover:text-flag-red disabled:opacity-40" title="Deactivate">
                    <UserMinus size={13} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            ),
          )}

          {inactive.length > 0 && (
            <>
              <div className="px-5 pt-4 pb-1">
                <Label>Inactive</Label>
              </div>
              {inactive.map((c) => (
                <div key={c.id} className="grid grid-cols-[1.4fr_1.2fr_120px_1fr_100px_72px] gap-3 px-5 py-2.5 border-t border-graphite/40 items-center opacity-60">
                  <span className="text-[13px] text-bone-dim truncate flex items-center gap-2">
                    {c.name} <Badge tone="neutral">inactive</Badge>
                  </span>
                  <span className="text-[12px] text-bone-mute truncate">{c.role}</span>
                  <span className="mono text-[12px] text-bone-mute tabular-nums">{rate(c.payRateCents)}</span>
                  <span className="text-[12px] text-bone-mute truncate">{c.email ?? "—"}</span>
                  <span className="text-[12px] text-bone-mute truncate">{c.partnerName ?? "—"}</span>
                  <div className="flex items-center justify-end">
                    <button onClick={() => run(() => updateConsultant(c.id, { active: true }))} disabled={isPending} className="text-bone-mute hover:text-track-gold disabled:opacity-40" title="Reactivate">
                      <UserPlus size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {error && <CardBody className="pt-0"><span className="text-[12px] text-flag-red">{error}</span></CardBody>}
    </Card>
  );
}

function ConsultantForm({
  partners,
  initial,
  isPending,
  onCancel,
  onSubmit,
}: {
  partners: RosterPartner[];
  initial?: RosterConsultant;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; role: string; payRate: number; email: string; partnerId: string | null }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [payRate, setPayRate] = useState(initial ? String(initial.payRateCents / 100) : "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [partnerId, setPartnerId] = useState(initial?.partnerId ?? "");

  function submit() {
    onSubmit({ name, role, payRate: Number(payRate || 0), email, partnerId: partnerId || null });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-[1.4fr_1.2fr_120px_1fr_120px] gap-3">
        <Input placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} className="h-8 text-[13px]" />
        <Input placeholder="Role (e.g. Engineer)" value={role} onChange={(e) => setRole(e.target.value)} className="h-8 text-[13px]" />
        <Input type="number" min={0} step="1" placeholder="$/hr" value={payRate} onChange={(e) => setPayRate(e.target.value)} className="h-8 text-[13px]" />
        <Input placeholder="E-transfer email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-[13px]" />
        <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="h-8 text-[13px]">
          <option value="">No partner</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={isPending} className="inline-flex items-center gap-1.5 text-[12px] text-track-gold hover:text-bone disabled:opacity-40">
          <Check size={14} strokeWidth={1.5} />
          {initial ? "Save" : "Add"}
        </button>
        <button onClick={onCancel} disabled={isPending} className="inline-flex items-center gap-1.5 text-[12px] text-bone-mute hover:text-bone">
          <X size={14} strokeWidth={1.5} />
          Cancel
        </button>
      </div>
    </div>
  );
}
