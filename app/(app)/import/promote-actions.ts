"use server";

// Promote imported contacts → firm-wide ProspectLeads (the new Pipeline
// "Promoted Leads" sub-tab).
//
// A promoted lead is COMPANY-centric and keyed on the normalized domain, so two
// contacts at the same company merge into ONE lead with two people (no
// domain-unique collision). Each person carries a roleType (decision_maker |
// connector) that steers the later enrichment SEARCH. Name-only / no-domain
// rows are not promotable (the table disables them) and are skipped here too.
//
// Privacy asymmetry: the SOURCE rows are private (scoped to the partner), but
// the ProspectLeads created here are FIRM-WIDE by design — so this is where a
// private import becomes shared firm work, and where we DO write the Activity
// feed.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/import-auth";
import { writeAudit, writeActivity, partnerActor } from "@/lib/audit";
import { companySlug } from "@/lib/import-shared";
import type { ProspectPerson } from "@/lib/types";

// Identity key for de-duping people within a lead's people[] array.
function personKey(p: ProspectPerson): string {
  const email = p.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return `nt:${(p.name ?? "").toLowerCase()}|${(p.title ?? "").toLowerCase()}`;
}

// Merge an incoming person into an existing people[] — update in place when it
// matches (fill missing email/linkedin/roleType), else append. Never dupes.
function mergePerson(people: ProspectPerson[], incoming: ProspectPerson): ProspectPerson[] {
  const inKey = personKey(incoming);
  const idx = people.findIndex((p) => personKey(p) === inKey);
  if (idx === -1) return [...people, incoming];
  const merged: ProspectPerson = { ...people[idx] };
  if (incoming.email && !merged.email) {
    merged.email = incoming.email;
    merged.emailRevealed = true;
  }
  if (incoming.linkedin && !merged.linkedin) merged.linkedin = incoming.linkedin;
  if (incoming.roleType && !merged.roleType) merged.roleType = incoming.roleType;
  const next = [...people];
  next[idx] = merged;
  return next;
}

export async function promoteImportedContacts(
  ids: string[],
): Promise<{ promoted: number; skipped: number; errors: number }> {
  const { partnerId, label } = await requirePartner();
  const actor = partnerActor(partnerId, label);

  let promoted = 0;
  let skipped = 0;
  let errors = 0;

  for (const id of ids) {
    try {
      const contact = await prisma.importedContact.findFirst({
        where: { id, partnerLeadId: partnerId },
      });
      // Skip the unpromotable: gone, already promoted, or name-only.
      if (
        !contact ||
        contact.promotion === "promoted" ||
        contact.completeness === "needs_identification"
      ) {
        skipped++;
        continue;
      }
      const realDomain = (contact.domain ?? "").trim().toLowerCase();
      const company = (contact.company ?? "").trim();
      // Need at least a domain or a company to key the company lead on.
      if (!realDomain && !company) {
        skipped++;
        continue;
      }
      // Key on a real domain when we have one (the 12/1357 with email/website),
      // else a stable company-name slug. Enrichment resolves the slug → real
      // domain via Apollo. Two contacts at the same company share a key → merge.
      const key = realDomain || companySlug(company);

      const roleType: "decision_maker" | "connector" =
        contact.leadType === "connector" ? "connector" : "decision_maker";
      const person: ProspectPerson = {
        name: contact.name,
        title: contact.title || "—",
        email: contact.email?.trim() || null,
        linkedin: contact.linkedin?.trim() || undefined,
        source: "import",
        emailRevealed: !!contact.email?.trim(),
        roleType,
      };
      const score = contact.scanScore ?? 5;
      const rationale =
        contact.scanRationale?.trim() || `Imported and promoted by ${label}.`;

      await prisma.$transaction(async (tx) => {
        const existing = await tx.prospectLead.findUnique({ where: { domain: key } });
        let leadId: string;

        if (existing) {
          const mergedPeople = mergePerson(
            (existing.people as unknown as ProspectPerson[]) ?? [],
            person,
          );
          await tx.prospectLead.update({
            where: { id: existing.id },
            data: {
              people: mergedPeople as unknown as object,
              // Never downgrade an existing lead's score; fill an empty segment.
              score: Math.max(existing.score, score),
              segmentId: existing.segmentId ?? contact.matchedSegmentId ?? null,
              promotedBy: existing.promotedBy ?? label,
            },
          });
          leadId = existing.id;
        } else {
          const created = await tx.prospectLead.create({
            data: {
              companyName: company || key,
              domain: key,
              industryTags: [],
              score,
              rationale,
              status: "pending",
              origin: "imported",
              promotedBy: label,
              segmentId: contact.matchedSegmentId ?? null,
              people: [person] as unknown as object,
              foundBy: ["import"],
              createdBy: label,
              generatedFromSkill: "contact-scan",
            },
          });
          leadId = created.id;
        }

        await tx.importedContact.update({
          where: { id: contact.id },
          data: {
            promotion: "promoted",
            promotedProspectLeadId: leadId,
            promotedAt: new Date(),
          },
        });

        await writeAudit(tx, {
          actor,
          action: "promote.importedContact",
          targetType: "ProspectLead",
          targetId: leadId,
          changes: {
            contact: contact.name,
            company: contact.company,
            domain: key,
            roleType,
            fromImportedContact: contact.id,
          },
        });
      });

      promoted++;
    } catch (err) {
      console.error("[promote] failed for", id, err);
      errors++;
    }
  }

  // Promoted leads are firm-wide — this transition IS feed-worthy (unlike the
  // private import itself).
  if (promoted > 0) {
    await writeActivity(prisma, {
      actor,
      type: "ai",
      target: "Pipeline",
      detail: `Promoted ${promoted} imported contact${promoted === 1 ? "" : "s"} to Pipeline leads`,
      link: "/pipeline?tab=promoted",
    }).catch(() => {});
  }

  revalidatePath("/import");
  revalidatePath("/pipeline");
  return { promoted, skipped, errors };
}
