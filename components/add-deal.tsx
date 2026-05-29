"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ShieldAlert, Search, UserPlus } from "lucide-react";
import { Button, Label, Input, Textarea } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createDeal } from "@/app/(app)/pipeline/actions";
import { industryLabels, stageLabels, stageOrder } from "@/lib/data/seed";

type ContactOption = { id: string; name: string; company: string; industry: string };
type PartnerOption = { id: string; name: string };

// Add deal/lead — manual funnel entry. A Deal needs a Contact, so you pick an
// existing contact (or add one first). Company + industry default from them.
export function AddDeal({
  contacts,
  partners,
  defaultPartnerId,
}: {
  contacts: ContactOption[];
  partners: PartnerOption[];
  defaultPartnerId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
        <Plus size={13} strokeWidth={1.5} />
        New deal
      </Button>
      {open && (
        <AddDealModal
          contacts={contacts}
          partners={partners}
          defaultPartnerId={defaultPartnerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddDealModal({
  contacts,
  partners,
  defaultPartnerId,
  onClose,
}: {
  contacts: ContactOption[];
  partners: PartnerOption[];
  defaultPartnerId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState("");
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState("lead");
  const [value, setValue] = useState("");
  const [industry, setIndustry] = useState("automotive");
  const [closeDate, setCloseDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [partnerLeadId, setPartnerLeadId] = useState(defaultPartnerId ?? partners[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = contacts.find((c) => c.id === contactId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50);
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)).slice(0, 50);
  }, [query, contacts]);

  function pickContact(c: ContactOption) {
    setContactId(c.id);
    if (!company.trim()) setCompany(c.company);
    setIndustry(c.industry);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contactId) {
      setError("Pick a contact for this deal");
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createDeal({
          contactId,
          company,
          stage,
          valueEstimate: Number(value || 0),
          industry,
          closeTargetDate: closeDate,
          partnerLeadId,
          notes,
        });
        router.push(`/pipeline/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add deal");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-bitumen/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-[620px] bg-asphalt border border-graphite mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-graphite">
          <div className="flex items-center gap-3">
            <Plus size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>— New deal</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          {/* Contact picker */}
          <div className="flex flex-col gap-2">
            <Label>Contact <span className="text-flag-red">*</span></Label>
            {selected ? (
              <div className="flex items-center justify-between gap-3 px-3 h-9 border border-graphite bg-bitumen">
                <span className="text-[14px] text-bone truncate">{selected.name} · <span className="text-bone-mute">{selected.company}</span></span>
                <button type="button" onClick={() => setContactId("")} className="text-bone-mute hover:text-bone shrink-0">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 px-3 h-9 border border-graphite bg-bitumen">
                  <Search size={13} strokeWidth={1.5} className="text-bone-mute shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search contacts by name or company…"
                    className="bg-transparent border-0 text-[14px] text-bone placeholder:text-bone-mute focus:outline-none w-full"
                  />
                </div>
                <div className="border border-graphite max-h-[180px] overflow-y-auto">
                  {contacts.length === 0 ? (
                    <a href="/contacts?qa=add" className="flex items-center gap-2 px-4 py-3 text-[13px] text-track-gold hover:bg-graphite/40">
                      <UserPlus size={13} strokeWidth={1.5} /> No contacts yet — add one first
                    </a>
                  ) : filtered.length === 0 ? (
                    <div className="px-4 py-3 text-[12px] text-bone-mute">No match. <a href="/contacts?qa=add" className="text-track-gold hover:underline">Add a contact</a> first.</div>
                  ) : (
                    filtered.map((c, i) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => pickContact(c)}
                        className={cn("w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-graphite/40", i < filtered.length - 1 && "border-b border-graphite")}
                      >
                        <span className="text-[13px] text-bone truncate">{c.name}</span>
                        <span className="text-[12px] text-bone-mute truncate">{c.company}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Defaults to the contact's company" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Stage</Label>
              <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={isPending} className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px] focus:border-track-gold focus:outline-none">
                {stageOrder.map((s) => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Est. value (CAD)</Label>
              <Input type="number" min={0} step={1000} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 250000" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <select value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={isPending} className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px] focus:border-track-gold focus:outline-none">
                {Object.entries(industryLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Target close</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Deal lead</Label>
              <select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={isPending} className="h-9 px-3 bg-bitumen border border-graphite text-bone text-[14px] focus:border-track-gold focus:outline-none">
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where this lead came from, the opening, anything worth carrying forward…" disabled={isPending} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !contactId}>
              {isPending ? "Adding…" : "Add to pipeline"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
