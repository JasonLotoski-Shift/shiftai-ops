"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ShieldAlert } from "lucide-react";
import { Button, Label, Input, Select, SearchInput } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { createClient } from "@/app/(app)/clients/actions";
import { INDUSTRY_VERTICALS, industryLabels } from "@/lib/industries";
import { SubIndustrySelect, reconcileSubIndustry } from "@/components/sub-industry-select";

type ContactOption = { id: string; name: string; company: string; industry: string };
type PartnerOption = { id: string; name: string };

// Add client — manual engagement entry, for clients that didn't come through
// the pipeline. A Client needs a primary Contact, so you pick an existing one
// (search-picker, same pattern as the new-deal modal). Company + industry
// default from the picked contact.
export function AddClient({
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
        New client
      </Button>
      {open && (
        <AddClientModal
          contacts={contacts}
          partners={partners}
          defaultPartnerId={defaultPartnerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddClientModal({
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
  const [industry, setIndustry] = useState("automotive");
  const [subIndustry, setSubIndustry] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [contractSignedAt, setContractSignedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [revenue, setRevenue] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  // Default to the signed-in partner, but only if they're actually in the
  // roster — a stale session must not select a non-existent partner, which
  // would make the server reject the client.
  const [partnerLeadId, setPartnerLeadId] = useState(
    defaultPartnerId && partners.some((p) => p.id === defaultPartnerId)
      ? defaultPartnerId
      : partners[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = contacts.find((c) => c.id === contactId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50);
    return contacts
      .filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q))
      .slice(0, 50);
  }, [query, contacts]);

  function pickContact(c: ContactOption) {
    setContactId(c.id);
    if (!company.trim()) setCompany(c.company);
    setIndustry(c.industry);
    setSubIndustry((cur) => reconcileSubIndustry(c.industry, cur));
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contactId) {
      setError("Pick a primary contact for this client");
      return;
    }
    if (!company.trim()) {
      setError("Company is required");
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createClient({
          company,
          industry,
          subIndustry: subIndustry || undefined,
          revenue,
          contractValue: Number(contractValue || 0),
          contractSignedAt,
          partnerLeadId,
          primaryContactId: contactId,
          paymentTerms,
        });
        router.push(`/clients/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add client");
      }
    });
  }

  return (
    <ModalShell onClose={onClose}>
      <div
        className="w-full max-w-[620px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Plus size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>New client</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          {/* Primary contact picker */}
          <div className="flex flex-col gap-2">
            <Label>Primary contact <span className="text-flag-red">*</span></Label>
            {selected ? (
              <div className="flex items-center justify-between gap-3 px-3 h-9 bg-bitumen rounded-[var(--radius)]">
                <span className="text-[14px] text-bone truncate">
                  {selected.name} · <span className="text-bone-mute">{selected.company}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setContactId("")}
                  className="text-bone-mute hover:text-bone shrink-0"
                >
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <SearchInput
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts by name or company…"
                />
                <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden max-h-[180px] overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-3 text-[12px] text-bone-mute">
                      {contacts.length === 0
                        ? "No contacts yet — add one from the Contacts page first."
                        : "No match."}
                    </div>
                  ) : (
                    filtered.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => pickContact(c)}
                        className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--color-row-hover)]"
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
              <Label>Company <span className="text-flag-red">*</span></Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Defaults to the contact's company"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Industry</Label>
              <Select
                value={industry}
                onChange={(e) => {
                  const next = e.target.value;
                  setIndustry(next);
                  setSubIndustry((cur) => reconcileSubIndustry(next, cur));
                }}
                disabled={isPending}
              >
                {INDUSTRY_VERTICALS.map((k) => (
                  <option key={k} value={k}>{industryLabels[k]}</option>
                ))}
              </Select>
            </div>
            <SubIndustrySelect
              vertical={industry}
              value={subIndustry}
              onChange={setSubIndustry}
              disabled={isPending}
            />
            <div className="flex flex-col gap-2">
              <Label>Contract value (CAD)</Label>
              <Input
                type="number"
                min={0}
                step={1000}
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="e.g. 250000"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Contract signed</Label>
              <Input
                type="date"
                value={contractSignedAt}
                onChange={(e) => setContractSignedAt(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Partner lead</Label>
              <Select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={isPending}>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Annual revenue</Label>
              <Input
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="Optional — e.g. $50M"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2 col-span-2">
              <Label>Payment terms</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="Optional — e.g. Net 30, 50% upfront"
                disabled={isPending}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !contactId || !company.trim()}>
              {isPending ? "Adding…" : "Add client"}
            </Button>
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
