// lib/roles.ts
// Pure, dependency-free role checks — safe to import into client components.
// lib/permissions.ts re-exports isManagingPartner and adds the session-backed
// async guards (currentIsManagingPartner / requireManagingPartner), which pull
// in Prisma + Auth and must stay server-only.

/** True when a role line marks a managing partner (e.g. "Managing Partner · Build"). */
export function isManagingPartner(role: string | null | undefined): boolean {
  return (role ?? "").toLowerCase().includes("managing partner");
}
