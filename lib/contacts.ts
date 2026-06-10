// Contact creation write path — transaction-composable, shared by the manual
// createContact action and ingest approveUnified. Lives here (not in a
// "use server" file) so it is never registered as a client-invocable action
// endpoint: every exported server action carries its own auth() guard, and
// this helper has none by design — the CALLER owns auth, Activity, and
// revalidation (mirrors lib/contact-links.ts).
//
// Server-only (touches Prisma).

import { prisma } from "@/lib/prisma";
import { writeAudit, type Actor } from "@/lib/audit";
import type {
  Industry,
  LeadSource,
  PreferredChannel,
  RelationshipStrength,
} from "@/lib/generated/prisma/enums";

// The client handed to a prisma.$transaction(async (tx) => …) callback
// (mirrors lib/contact-links.ts).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ──────────────────────────────────────────────────────────────────────
// createContactTx — the transaction-composable core of createContact.
//
// Creates the Contact row + ONE writeAudit("create.contact") inside the
// GIVEN tx. No Activity, no revalidate — the caller owns those. Built so
// other flows (ingest approveUnified) can create contacts inside their own
// transaction without double-auditing. actorLabel is a partner display name
// or "AGENT · CLAUDE"; pass actorPartnerId when the actor is a partner so
// the audit row keys on the partner id (matches every other mutation).
// ──────────────────────────────────────────────────────────────────────

export type CreateContactTxInput = {
  name: string;
  email: string;
  title?: string;
  company?: string;
  phone?: string | null;
  industry?: Industry;
  source?: string;
  sourceCategory?: LeadSource | null;
  notes?: string | null;
  partnerLeadId: string;
  // Reach & personal (D40) — optional; the manual form supplies these,
  // ingest never proposes relationshipStrength (partner judgment).
  linkedinUrl?: string | null;
  location?: string | null;
  timezone?: string | null;
  mobilePhone?: string | null;
  preferredChannel?: PreferredChannel | null;
  relationshipStrength?: RelationshipStrength | null;
  importantDates?: string[];
};

export async function createContactTx(
  tx: Tx,
  input: CreateContactTxInput,
  actorLabel: string,
  actorPartnerId?: string,
): Promise<{ id: string; name: string; email: string }> {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");
  if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: ${email}`);

  const industry: Industry = input.industry ?? "other";

  // Resolve the audit actor from the label: "AGENT · X" → agent actor;
  // a partner label keys on actorPartnerId when given (label-only fallback
  // stores the label in both columns — better than misattributing an id).
  const actor: Actor = actorLabel.startsWith("AGENT · ")
    ? { kind: "agent", name: actorLabel.slice("AGENT · ".length).toLowerCase() }
    : { kind: "partner", id: actorPartnerId ?? actorLabel, label: actorLabel };

  const created = await tx.contact.create({
    data: {
      name,
      title: input.title?.trim() || "",
      company: input.company?.trim() || "",
      email,
      phone: input.phone?.trim() || null,
      industry,
      source: input.source?.trim() || "Ingest",
      sourceCategory: input.sourceCategory ?? null,
      notes: input.notes?.trim() || null,
      // A brand-new contact counts as touched now — keeps it out of the
      // "cold 30d+" bucket on the day it's added.
      lastTouchAt: new Date(),
      partnerLeadId: input.partnerLeadId,
      linkedinUrl: input.linkedinUrl?.trim() || null,
      location: input.location?.trim() || null,
      timezone: input.timezone?.trim() || null,
      mobilePhone: input.mobilePhone?.trim() || null,
      preferredChannel: input.preferredChannel ?? null,
      relationshipStrength: input.relationshipStrength ?? null,
      importantDates: (input.importantDates ?? []).map((d) => d.trim()).filter(Boolean),
    },
  });

  await writeAudit(tx, {
    actor,
    action: "create.contact",
    targetType: "Contact",
    targetId: created.id,
    changes: {
      name,
      company: created.company,
      email,
      industry,
      partnerLeadId: input.partnerLeadId,
    },
  });

  return { id: created.id, name: created.name, email: created.email };
}
