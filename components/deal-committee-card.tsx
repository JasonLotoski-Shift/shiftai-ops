"use client";

// Buying committee — the deal page's Contact↔Deal links (D40).
//
// Two dimensions per person: `relationship` = how they connect to the
// company (works there / introduced us / advisor); `role` = their pull in
// the buying decision (mainly for works-there people). The star marks the
// main contact. Add / star / remove go through the link-actions server
// actions, which write via lib/contact-links (the single write path).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, Label, Badge, Button, Select } from "@/components/ui";
import {
  addDealContactLink,
  updateDealContactLink,
  removeDealContactLink,
} from "@/app/(app)/pipeline/[id]/link-actions";
import type { RelationshipType, StakeholderRole } from "@/lib/types";
import { Star, X, Plus, ShieldAlert, Users } from "lucide-react";

const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  works_there: "Works there",
  introduced_us: "Introduced us",
  advisor: "Advisor",
  other: "Other",
};

const ROLE_LABELS: Record<StakeholderRole, string> = {
  decision_maker: "Decision maker",
  champion: "Champion",
  influencer: "Influencer",
  budget_holder: "Budget holder",
  technical: "Technical",
  gatekeeper: "Gatekeeper",
  blocker: "Blocker",
  other: "Other",
};

const RELATIONSHIP_OPTIONS = Object.keys(RELATIONSHIP_LABELS) as RelationshipType[];
const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as StakeholderRole[];

export type CommitteeLink = {
  id: string;
  relationship: RelationshipType;
  role: StakeholderRole | null;
  roleLabel: string | null;
  isPrimary: boolean;
  addedBy: string;
  contact: { id: string; name: string; title: string; company: string };
};

export type CommitteePickerContact = {
  id: string;
  name: string;
  title: string;
  company: string;
};

export function DealCommitteeCard({
  dealId,
  links,
  contacts,
}: {
  dealId: string;
  links: CommitteeLink[];
  contacts: CommitteePickerContact[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [contactId, setContactId] = useState("");
  const [relationship, setRelationship] = useState<RelationshipType>("works_there");
  const [role, setRole] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // People not already on the committee.
  const linkedIds = new Set(links.map((l) => l.contact.id));
  const pickable = contacts.filter((c) => !linkedIds.has(c.id));

  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) return;
    setError(null);
    startTransition(async () => {
      try {
        await addDealContactLink(dealId, {
          contactId,
          relationship,
          role: relationship === "works_there" ? role || null : null,
        });
        setContactId("");
        setRelationship("works_there");
        setRole("");
        setAdding(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add person");
      }
    });
  }

  function makePrimary(linkId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await updateDealContactLink(linkId, { isPrimary: true });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      }
    });
  }

  function remove(linkId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeDealContactLink(linkId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
      }
    });
  }

  return (
    <Card>
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <span className="title-md">Buying committee</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="label-gold hover:underline flex items-center gap-1"
            disabled={isPending}
          >
            <Plus size={11} strokeWidth={1.5} />
            Add person
          </button>
        )}
      </div>

      {links.length === 0 && !adding && (
        <CardBody className="pt-0">
          <div className="flex items-start gap-2 text-[12px] text-bone-mute">
            <Users size={13} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>No one linked yet — add the people in this deal: who decides, who champions it, who introduced us.</span>
          </div>
        </CardBody>
      )}

      {links.length > 0 && (
        <div className="flex flex-col pb-2">
          {links.map((l, i) => (
            <div
              key={l.id}
              className={`px-5 py-3 flex items-start gap-3 ${i > 0 ? "border-t border-graphite/30" : ""}`}
            >
              <button
                onClick={() => !l.isPrimary && makePrimary(l.id)}
                disabled={isPending || l.isPrimary}
                title={l.isPrimary ? "Main contact" : "Make main contact"}
                className={l.isPrimary ? "text-track-gold cursor-default" : "text-bone-mute hover:text-track-gold"}
              >
                <Star size={13} strokeWidth={1.5} fill={l.isPrimary ? "currentColor" : "none"} className="mt-0.5" />
              </button>

              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <Link href={`/contacts/${l.contact.id}`} className="text-[13px] text-bone hover:underline truncate">
                  {l.relationship === "introduced_us" ? `Introduced us — ${l.contact.name}` : l.contact.name}
                </Link>
                <span className="text-[11px] text-bone-mute truncate">
                  {l.roleLabel || l.contact.title}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  <Badge tone={l.relationship === "introduced_us" ? "gold" : "neutral"}>
                    {RELATIONSHIP_LABELS[l.relationship]}
                  </Badge>
                  {l.role && <Badge tone="steel">{ROLE_LABELS[l.role]}</Badge>}
                </div>
              </div>

              <button
                onClick={() => remove(l.id)}
                disabled={isPending}
                title="Remove from this deal"
                className="text-bone-mute hover:text-flag-red"
              >
                <X size={13} strokeWidth={1.5} className="mt-0.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form onSubmit={addPerson} className="px-5 pb-5 pt-1 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Person</Label>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={isPending} required>
              <option value="">Pick a contact…</option>
              {pickable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.title}, {c.company}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>How they connect</Label>
              <Select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as RelationshipType)}
                disabled={isPending}
              >
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>{RELATIONSHIP_LABELS[r]}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role in the decision</Label>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isPending || relationship !== "works_there"}
              >
                <option value="">—</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setAdding(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending || !contactId}>
              {isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      )}

      {error && !adding && (
        <div className="mx-5 mb-4 flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius-sm)]">
          <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">{error}</span>
        </div>
      )}
    </Card>
  );
}
