"use client";

// People card — the client's ContactLinks (D40 records model).
//
// Lists everyone connected to the company, grouped by how they connect
// (works there / introduced us / advisor), with role badges and the primary
// star. Add / edit / remove call the link-actions server actions; the page
// revalidates so the list stays live. Contacts themselves are untouched —
// this card only manages the links.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardBody, Label, Badge, Button, Input, Select, EmptyState } from "@/components/ui";
import {
  addClientContactLink,
  updateClientContactLink,
  removeClientContactLink,
} from "@/app/(app)/clients/[id]/link-actions";
import type { RelationshipType, StakeholderRole } from "@/lib/generated/prisma/enums";
import { Star, UserPlus, Users, Pencil, X } from "lucide-react";

export type ClientContactLinkItem = {
  id: string;
  relationship: RelationshipType;
  role: StakeholderRole | null;
  roleLabel: string | null;
  isPrimary: boolean;
  addedBy: string;
  contact: { id: string; name: string; title: string; company: string };
};

export type ContactPickerOption = {
  id: string;
  name: string;
  title: string;
  company: string;
};

const relationshipLabels: Record<RelationshipType, string> = {
  works_there: "Works there",
  introduced_us: "Introduced us",
  advisor: "Advisor",
  other: "Other",
};

const relationshipTone: Record<RelationshipType, "steel" | "gold" | "bone" | "neutral"> = {
  works_there: "steel",
  introduced_us: "gold",
  advisor: "bone",
  other: "neutral",
};

const roleLabels: Record<StakeholderRole, string> = {
  decision_maker: "Decision maker",
  champion: "Champion",
  influencer: "Influencer",
  budget_holder: "Budget holder",
  technical: "Technical",
  gatekeeper: "Gatekeeper",
  blocker: "Blocker",
  other: "Other",
};

const RELATIONSHIP_ORDER: RelationshipType[] = ["works_there", "introduced_us", "advisor", "other"];

export function ClientContactsCard({
  clientId,
  links,
  contacts,
}: {
  clientId: string;
  links: ClientContactLinkItem[];
  contacts: ContactPickerOption[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Contacts not yet linked to this client — the add picker's universe.
  const linkedIds = useMemo(() => new Set(links.map((l) => l.contact.id)), [links]);
  const available = useMemo(
    () => contacts.filter((c) => !linkedIds.has(c.id)),
    [contacts, linkedIds],
  );

  const grouped = RELATIONSHIP_ORDER.map((rel) => ({
    rel,
    items: links.filter((l) => l.relationship === rel),
  })).filter((g) => g.items.length > 0);

  function remove(linkId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeClientContactLink(clientId, linkId);
        setConfirmRemoveId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
      }
    });
  }

  return (
    <Card>
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <span className="title-md">People</span>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); setError(null); }}
            className="label-gold hover:underline flex items-center gap-1.5"
          >
            <UserPlus size={11} strokeWidth={1.5} />
            Add person
          </button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <EmptyState
          compact
          icon={<Users size={22} strokeWidth={1.5} />}
          title="No people linked yet"
          hint="Link the contacts who work here, introduced us, or advise the account."
        />
      )}

      {grouped.length > 0 && (
        <div className="flex flex-col pb-2">
          {grouped.map((g) => (
            <div key={g.rel} className="flex flex-col">
              <div className="px-5 pt-3 pb-1">
                <Label>{relationshipLabels[g.rel]}</Label>
              </div>
              {g.items.map((l) =>
                editingId === l.id ? (
                  <LinkEditRow
                    key={l.id}
                    clientId={clientId}
                    link={l}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <div key={l.id} className="px-5 py-2.5 flex flex-col gap-1.5 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {l.isPrimary && (
                            <Star size={11} strokeWidth={1.5} className="text-track-gold fill-track-gold shrink-0" />
                          )}
                          <Link href={`/contacts/${l.contact.id}`} className="text-[13px] text-bone hover:text-track-gold truncate">
                            {l.contact.name}
                          </Link>
                        </div>
                        <div className="text-[11px] text-bone-mute truncate">
                          {l.roleLabel ?? l.contact.title}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(l.id); setAdding(false); setConfirmRemoveId(null); setError(null); }}
                          className="text-bone-mute hover:text-bone"
                          title="Edit"
                        >
                          <Pencil size={11} strokeWidth={1.5} />
                        </button>
                        {confirmRemoveId === l.id ? (
                          <button
                            onClick={() => remove(l.id)}
                            disabled={isPending}
                            className="text-[10px] text-flag-red hover:underline"
                          >
                            {isPending ? "Removing…" : "Confirm remove"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmRemoveId(l.id)}
                            className="text-bone-mute hover:text-flag-red"
                            title="Remove from this client"
                          >
                            <X size={12} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge tone={relationshipTone[l.relationship]}>{relationshipLabels[l.relationship]}</Badge>
                      {l.role && <Badge tone="neutral">{roleLabels[l.role]}</Badge>}
                    </div>
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddPersonForm
          clientId={clientId}
          available={available}
          onDone={() => setAdding(false)}
        />
      )}

      {error && (
        <div className="px-5 pb-3">
          <span className="text-[11px] text-flag-red">{error}</span>
        </div>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Add-person flow — picker over existing contacts + the two link dimensions
   ────────────────────────────────────────────────────────────────────── */

function AddPersonForm({
  clientId,
  available,
  onDone,
}: {
  clientId: string;
  available: ContactPickerOption[];
  onDone: () => void;
}) {
  const [contactId, setContactId] = useState("");
  const [relationship, setRelationship] = useState<RelationshipType>("works_there");
  const [role, setRole] = useState<StakeholderRole | "">("");
  const [roleLabel, setRoleLabel] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!contactId) {
      setError("Pick a contact first");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await addClientContactLink(clientId, {
          contactId,
          relationship,
          role: role || null,
          roleLabel: roleLabel.trim() || null,
          isPrimary,
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add");
      }
    });
  }

  if (available.length === 0) {
    return (
      <CardBody className="pt-2 flex flex-col gap-2">
        <p className="text-[12px] text-bone-dim leading-relaxed">
          Every contact on file is already linked here. Add the person on the contacts page first.
        </p>
        <Button variant="ghost" size="sm" onClick={onDone}>Close</Button>
      </CardBody>
    );
  }

  return (
    <CardBody className="pt-2 flex flex-col gap-3 border-t border-graphite/30">
      <div className="flex flex-col gap-1.5">
        <Label>Contact</Label>
        <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">Pick a contact…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.company ? ` — ${c.company}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>How they connect</Label>
        <Select value={relationship} onChange={(e) => setRelationship(e.target.value as RelationshipType)}>
          {RELATIONSHIP_ORDER.map((r) => (
            <option key={r} value={r}>{relationshipLabels[r]}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Role in the decision (optional)</Label>
        <Select value={role} onChange={(e) => setRole(e.target.value as StakeholderRole | "")}>
          <option value="">—</option>
          {(Object.keys(roleLabels) as StakeholderRole[]).map((r) => (
            <option key={r} value={r}>{roleLabels[r]}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Label (optional)</Label>
        <Input
          value={roleLabel}
          onChange={(e) => setRoleLabel(e.target.value)}
          placeholder={'e.g. "VP Ops" or "met at SEMA"'}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-bone-dim">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="accent-track-gold"
        />
        Main contact for this client
      </label>

      {error && <span className="text-[11px] text-flag-red">{error}</span>}

      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={submit} disabled={isPending}>
          {isPending ? "Adding…" : "Add"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </CardBody>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Inline edit — relationship / role / label / primary star on one link
   ────────────────────────────────────────────────────────────────────── */

function LinkEditRow({
  clientId,
  link,
  onDone,
}: {
  clientId: string;
  link: ClientContactLinkItem;
  onDone: () => void;
}) {
  const [relationship, setRelationship] = useState<RelationshipType>(link.relationship);
  const [role, setRole] = useState<StakeholderRole | "">(link.role ?? "");
  const [roleLabel, setRoleLabel] = useState(link.roleLabel ?? "");
  const [isPrimary, setIsPrimary] = useState(link.isPrimary);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await updateClientContactLink(clientId, link.id, {
          relationship,
          role: role || null,
          roleLabel: roleLabel.trim() || null,
          isPrimary,
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <div className="px-5 py-3 flex flex-col gap-2 bg-bitumen/40">
      <span className="text-[13px] text-bone">{link.contact.name}</span>

      <Select value={relationship} onChange={(e) => setRelationship(e.target.value as RelationshipType)}>
        {RELATIONSHIP_ORDER.map((r) => (
          <option key={r} value={r}>{relationshipLabels[r]}</option>
        ))}
      </Select>

      <Select value={role} onChange={(e) => setRole(e.target.value as StakeholderRole | "")}>
        <option value="">No decision role</option>
        {(Object.keys(roleLabels) as StakeholderRole[]).map((r) => (
          <option key={r} value={r}>{roleLabels[r]}</option>
        ))}
      </Select>

      <Input
        value={roleLabel}
        onChange={(e) => setRoleLabel(e.target.value)}
        placeholder={'Label — e.g. "VP Ops"'}
      />

      <label className="flex items-center gap-2 cursor-pointer text-[12px] text-bone-dim">
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(e) => setIsPrimary(e.target.checked)}
          className="accent-track-gold"
        />
        Main contact for this client
      </label>

      {error && <span className="text-[11px] text-flag-red">{error}</span>}

      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
