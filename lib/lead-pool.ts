import { normalizeDomain } from "@/lib/apollo";

export type PoolLead = {
  domain: string;
  origin: string;
  status: string;
  reviewedBy: string | null;
  segmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** A discovery ghost that predates the last optimization and was never human-reviewed
 *  or re-scored since — eligible for one fresh look under the new criteria. */
export function isReadmissible(
  lead: Pick<PoolLead, "origin" | "status" | "reviewedBy" | "createdAt" | "updatedAt">,
  lastOptimizedAt: Date | null,
): boolean {
  if (!lastOptimizedAt) return false;
  return (
    lead.origin === "discovery" &&
    lead.status === "ghost" &&
    lead.reviewedBy == null &&
    lead.createdAt < lastOptimizedAt &&
    lead.updatedAt < lastOptimizedAt
  );
}

export function assemblePool<T extends { domain: string }>(input: {
  fresh: T[];
  existingLeads: PoolLead[];
  contactDomains: string[];
  segmentId: string;
  lastOptimizedAt: Date | null;
}): { freshCompanies: T[]; readmitLeads: PoolLead[] } {
  const norm = (d: string) => normalizeDomain(d);

  const readmitLeads = input.existingLeads.filter(
    (l) => l.segmentId === input.segmentId && isReadmissible(l, input.lastOptimizedAt),
  );
  const readmitDomains = new Set(readmitLeads.map((l) => norm(l.domain)));

  // Block any domain already stored as a NON-readmissible lead, or held as a Contact.
  const blocked = new Set<string>();
  for (const l of input.existingLeads) {
    const d = norm(l.domain);
    if (d && !readmitDomains.has(d)) blocked.add(d);
  }
  for (const d of input.contactDomains) {
    const n = norm(d);
    if (n) blocked.add(n);
  }

  const freshCompanies = input.fresh.filter((c) => {
    const d = norm(c.domain);
    return !!d && !blocked.has(d) && !readmitDomains.has(d);
  });

  return { freshCompanies, readmitLeads };
}
