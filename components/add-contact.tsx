"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus, X, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Textarea, Select } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { createContact } from "@/app/(app)/contacts/actions";
import { industryLabels, leadSourceLabels } from "@/lib/data/seed";

type PartnerOption = { id: string; name: string };

// Add contact — fast capture (ROADMAP A4). Lives on the Contacts list as a
// header button, and auto-opens when the dashboard Quick Action routes here
// with ?qa=add. A mutation, not a generative action — no skill, no Drive.
export function AddContact({
  partners,
  defaultPartnerId,
}: {
  partners: PartnerOption[];
  defaultPartnerId?: string;
}) {
  const [open, setOpen] = useState(false);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("qa") === "add") setOpen(true);
  }, [searchParams]);

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus size={13} strokeWidth={1.5} />
        Add contact
      </Button>
      {open && (
        <AddContactModal
          partners={partners}
          defaultPartnerId={defaultPartnerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddContactModal({
  partners,
  defaultPartnerId,
  onClose,
}: {
  partners: PartnerOption[];
  defaultPartnerId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("automotive");
  const [source, setSource] = useState("");
  const [sourceCategory, setSourceCategory] = useState("intro");
  const [notes, setNotes] = useState("");
  const [partnerLeadId, setPartnerLeadId] = useState(
    defaultPartnerId ?? partners[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createContact({
          name,
          title,
          company,
          email,
          phone,
          industry,
          source,
          sourceCategory,
          notes,
          partnerLeadId,
        });
        router.push(`/contacts/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add contact");
      }
    });
  }

  return (
    <ModalShell onClose={onClose} positionClassName="items-start justify-center pt-20 px-4">
      <div
        className="w-full max-w-[600px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <UserPlus size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>Add contact</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Name <span className="text-flag-red">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. COO" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Company <span className="text-flag-red">*</span></Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Email <span className="text-flag-red">*</span></Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" required disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <Select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={isPending}
              >
                {Object.entries(industryLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Source category</Label>
              <Select value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)} disabled={isPending}>
                {Object.entries(leadSourceLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Source (detail)</Label>
              <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Referral from Jay, LinkedIn, SEMA" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Partner lead</Label>
              <Select
                value={partnerLeadId}
                onChange={(e) => setPartnerLeadId(e.target.value)}
                disabled={isPending}
              >
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering about this contact…" disabled={isPending} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !name.trim() || !company.trim() || !email.trim()}>
              {isPending ? "Adding…" : "Add contact"}
            </Button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
