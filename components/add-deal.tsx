"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ShieldAlert, UserPlus } from "lucide-react";
import { Button, Label, Input, Textarea, Select, SearchInput } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { createDeal } from "@/app/(app)/pipeline/actions";
import { createContact } from "@/app/(app)/contacts/actions";
import { stageLabels, stageOrder, leadSourceLabels } from "@/lib/data/seed";
import { INDUSTRY_VERTICALS, industryLabels } from "@/lib/industries";
import { SubIndustrySelect, reconcileSubIndustry } from "@/components/sub-industry-select";

type ContactOption = { id: string; name: string; company: string; industry: string; subIndustry?: string };
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
  // Contacts created inline within this modal aren't in the server-supplied
  // `contacts` prop, so we hold them locally and merge for display/selection.
  const [adHocContacts, setAdHocContacts] = useState<ContactOption[]>([]);
  // When true, the inline "add a new contact" mini-form is shown instead of
  // the search results.
  const [addingContact, setAddingContact] = useState(false);
  const [company, setCompany] = useState("");
  const [stage, setStage] = useState("lead");
  const [value, setValue] = useState("");
  const [industry, setIndustry] = useState("automotive");
  const [subIndustry, setSubIndustry] = useState("");
  const [closeDate, setCloseDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  // Default to the signed-in partner, but only if they're actually in the
  // roster — a stale session (e.g. after a data wipe) must not select a
  // non-existent partner, which would make the server reject the deal.
  const [partnerLeadId, setPartnerLeadId] = useState(
    defaultPartnerId && partners.some((p) => p.id === defaultPartnerId)
      ? defaultPartnerId
      : partners[0]?.id ?? "",
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Inline-created contacts take precedence in the lookup pool.
  const pool = useMemo(() => [...adHocContacts, ...contacts], [adHocContacts, contacts]);
  const selected = pool.find((c) => c.id === contactId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 50);
    return pool.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)).slice(0, 50);
  }, [query, pool]);

  function pickContact(c: ContactOption) {
    setContactId(c.id);
    if (!company.trim()) setCompany(c.company);
    setIndustry(c.industry);
    setSubIndustry(reconcileSubIndustry(c.industry, c.subIndustry ?? ""));
    setError(null);
  }

  // A contact just created inline: stash it locally, then auto-select it into
  // the deal (populating company + industry + sub-industry from it) and collapse.
  function onContactCreated(c: ContactOption) {
    setAdHocContacts((prev) => [c, ...prev]);
    setAddingContact(false);
    setContactId(c.id);
    if (!company.trim()) setCompany(c.company);
    setIndustry(c.industry);
    setSubIndustry(reconcileSubIndustry(c.industry, c.subIndustry ?? ""));
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
          subIndustry: subIndustry || undefined,
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
    <ModalShell onClose={onClose}>
      <div className="w-full max-w-[620px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden mb-20" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Plus size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label gold>New deal</Label>
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
              <div className="flex items-center justify-between gap-3 px-3 h-9 bg-bitumen rounded-[var(--radius)]">
                <span className="text-[14px] text-bone truncate">{selected.name} · <span className="text-bone-mute">{selected.company}</span></span>
                <button type="button" onClick={() => setContactId("")} className="text-bone-mute hover:text-bone shrink-0">
                  <X size={14} strokeWidth={1.5} />
                </button>
              </div>
            ) : addingContact ? (
              <InlineAddContact
                partners={partners}
                defaultPartnerId={partnerLeadId || defaultPartnerId}
                onCreated={onContactCreated}
                onCancel={() => setAddingContact(false)}
              />
            ) : (
              <>
                <SearchInput
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search contacts by name or company…"
                />
                <div className="bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] overflow-hidden max-h-[180px] overflow-y-auto">
                  {/* Always-available "create new" entry, pinned to the top. */}
                  <button
                    type="button"
                    onClick={() => setAddingContact(true)}
                    className="w-full text-left px-4 py-2.5 flex items-center gap-2 text-[13px] text-track-gold hover:bg-[var(--color-row-hover)]"
                  >
                    <UserPlus size={13} strokeWidth={1.5} /> Add a new contact
                  </button>
                  {filtered.length === 0 ? (
                    <div className="px-4 py-3 text-[12px] text-bone-mute">
                      {pool.length === 0 ? "No contacts yet — add one above." : "No match — add a new contact above."}
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

          {/* Deal detail + submit hide while the inline contact form is open,
              so the only active submit is the contact mini-form's. */}
          {!addingContact && (
            <>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Defaults to the contact's company" disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Stage</Label>
              <Select value={stage} onChange={(e) => setStage(e.target.value)} disabled={isPending}>
                {stageOrder.map((s) => (
                  <option key={s} value={s}>{stageLabels[s]}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Est. value (CAD)</Label>
              <Input type="number" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 250000" disabled={isPending} />
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
              <Label>Target close</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} disabled={isPending} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Deal lead</Label>
              <Select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={isPending}>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where this lead came from, the opening, anything worth carrying forward…" disabled={isPending} />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
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
            </>
          )}
        </form>
      </div>
    </ModalShell>
  );
}

// InlineAddContact — the "add a new contact" mini-form shown inside the new-deal
// modal. Same fields as the standalone Add contact form; on submit it calls the
// existing createContact server action, then hands the created contact back up
// so the deal form auto-selects it. Nested inside the deal <form>, so its submit
// is its own button (type="button" → calls create directly), never the deal's.
function InlineAddContact({
  partners,
  defaultPartnerId,
  onCreated,
  onCancel,
}: {
  partners: PartnerOption[];
  defaultPartnerId?: string;
  onCreated: (c: ContactOption) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [industry, setIndustry] = useState("automotive");
  const [subIndustry, setSubIndustry] = useState("");
  const [source, setSource] = useState("");
  const [sourceCategory, setSourceCategory] = useState("intro");
  const [partnerLeadId, setPartnerLeadId] = useState(
    defaultPartnerId && partners.some((p) => p.id === defaultPartnerId)
      ? defaultPartnerId
      : partners[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [dupConfirm, setDupConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function create(force = false) {
    setError(null);
    if (!name.trim() || !company.trim() || !email.trim()) {
      setError("Name, company, and email are required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createContact({
          name,
          title,
          company,
          email,
          phone,
          industry,
          subIndustry: subIndustry || undefined,
          source,
          sourceCategory,
          partnerLeadId,
          force,
        });
        if ("id" in res) {
          onCreated({ id: res.id, name: name.trim(), company: company.trim(), industry, subIndustry: subIndustry || undefined });
        } else {
          // Possible duplicate — name the match and let the partner add anyway.
          const hit = res.match ?? res.candidates[0];
          setDupConfirm(true);
          setError(
            hit
              ? `Possible duplicate: ${hit.name} · ${hit.company}. Click "Add anyway" to create a new contact.`
              : "Possible duplicate found. Click \"Add anyway\" to proceed.",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add contact");
      }
    });
  }

  return (
    <div className="bg-bitumen rounded-[var(--radius-lg)] p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <UserPlus size={13} strokeWidth={1.5} className="text-track-gold" />
        <Label gold>New contact</Label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Name <span className="text-flag-red">*</span></Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoFocus disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. COO" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Company <span className="text-flag-red">*</span></Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Email <span className="text-flag-red">*</span></Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" disabled={isPending} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" disabled={isPending} />
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
          <Select value={partnerLeadId} onChange={(e) => setPartnerLeadId(e.target.value)} disabled={isPending}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={() => create(dupConfirm)}
          disabled={isPending || !name.trim() || !company.trim() || !email.trim()}
        >
          {isPending ? "Saving…" : dupConfirm ? "Add anyway" : "Save & use contact"}
        </Button>
      </div>
    </div>
  );
}
