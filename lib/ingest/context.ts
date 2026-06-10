// Unified ingest — build the agent context block from a focus record + target
// records. For each target we print its CURRENT overwritable field values (from
// the apply.ts allowlists) so the model can tell what's already on file and the
// server can later diff add vs replace. Project targets also list current
// milestones, deliverable titles, and OPEN TASKS (with ids) so the model can
// propose reassignTaskId against a real task. The partner roster is included so
// ownerHint is groundable.
//
// Server-only (touches Prisma). Mirrors the context-block style in
// app/(app)/ingest/actions.ts and projects/[id]/drop-actions.ts.

import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import type { IngestType, IngestTargetKind } from "@/lib/ingest/types";
import {
  CONTACT_SCALAR_FIELDS,
  CONTACT_LIST_FIELDS,
  CLIENT_SCALAR_FIELDS,
  CLIENT_LIST_FIELDS,
  DEAL_SCALAR_FIELDS,
  DEAL_LIST_FIELDS,
} from "@/lib/ingest/apply";

export type TargetRef = { kind: IngestTargetKind; id: string };

// A person already linked to a deal/client — printed so the model never
// re-proposes an existing link.
export type LinkedPerson = {
  name: string;
  email: string;
  relationship: string;
  role: string | null;
  isPrimary: boolean;
};

// Loaded data for one target, used both to build context and (by the caller's
// stamping step) as a convenience. Shape is loose — only what we print.
export type TargetData =
  | { kind: "contact"; id: string; label: string; data: Record<string, unknown> }
  | { kind: "client"; id: string; label: string; data: Record<string, unknown>; people: LinkedPerson[] }
  | {
      kind: "project";
      id: string;
      label: string;
      data: Record<string, unknown>;
      milestones: { id: string; title: string; status: string }[];
      deliverables: string[];
      openTasks: { id: string; title: string; owner: string; due: string }[];
    }
  | { kind: "deal"; id: string; label: string; data: Record<string, unknown>; people: LinkedPerson[] };

const display = (v: unknown): string => {
  if (v === null || v === undefined) return "(empty)";
  if (Array.isArray(v)) return v.length ? v.join("; ") : "(empty)";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s ? s.replace(/_/g, "-") : "(empty)";
};

// Map a ContactLink select row to the printable LinkedPerson shape.
const toPerson = (l: {
  relationship: string;
  role: string | null;
  isPrimary: boolean;
  contact: { name: string; email: string };
}): LinkedPerson => ({
  name: l.contact.name,
  email: l.contact.email,
  relationship: l.relationship,
  role: l.role,
  isPrimary: l.isPrimary,
});

const CONTACT_LINK_SELECT = {
  select: {
    relationship: true,
    role: true,
    isPrimary: true,
    contact: { select: { name: true, email: true } },
  },
} as const;

/**
 * Load one target's current data. Returns null if the record doesn't exist
 * (so a bad/stale target id is silently dropped from context).
 */
export async function fetchTargetData(ref: TargetRef): Promise<TargetData | null> {
  if (ref.kind === "contact") {
    const c = await prisma.contact.findUnique({
      where: { id: ref.id },
      select: {
        name: true, company: true,
        persona: true, communicationStyle: true, background: true, title: true, phone: true, notes: true,
        linkedinUrl: true, location: true, timezone: true, mobilePhone: true, preferredChannel: true,
        keyFacts: true, hobbies: true, networkAffiliations: true, importantDates: true,
      },
    });
    if (!c) return null;
    return { kind: "contact", id: ref.id, label: `${c.name} · ${c.company}`, data: c as Record<string, unknown> };
  }

  if (ref.kind === "client") {
    const c = await prisma.client.findUnique({
      where: { id: ref.id },
      select: {
        company: true,
        description: true, headquarters: true, founded: true, website: true, ownership: true,
        companySize: true, logoMonogram: true, revenue: true, paymentTerms: true, notes: true,
        linkedinUrl: true, instagramUrl: true, subIndustry: true, locations: true,
        revenueEstimate: true, employeeCount: true, renewalDate: true,
        companyKeyFacts: true, brandColors: true,
        currentSystems: true, painPoints: true, keyServices: true, competitors: true,
        contactLinks: CONTACT_LINK_SELECT,
      },
    });
    if (!c) return null;
    const { contactLinks, renewalDate, ...rest } = c;
    return {
      kind: "client",
      id: ref.id,
      label: c.company,
      // renewalDate → "YYYY-MM-DD" so the diff stamp + context print stay readable.
      data: { ...rest, renewalDate: renewalDate ? renewalDate.toISOString().slice(0, 10) : null } as Record<
        string,
        unknown
      >,
      people: contactLinks.map(toPerson),
    };
  }

  if (ref.kind === "project") {
    const p = await prisma.project.findUnique({
      where: { id: ref.id },
      select: {
        name: true, phase: true, status: true, description: true,
        objectives: true, statusNote: true,
        successMetrics: true, systemsBuilt: true, risks: true,
        milestones: { select: { id: true, title: true, status: true }, orderBy: { dueDate: "asc" } },
        artifacts: { select: { title: true }, orderBy: { createdAt: "desc" }, take: 20 },
        tasks: {
          where: { done: false },
          select: { id: true, title: true, due: true, owner: { select: { name: true } } },
          orderBy: { due: "asc" },
        },
      },
    });
    if (!p) return null;
    return {
      kind: "project",
      id: ref.id,
      label: p.name,
      data: {
        phase: p.phase,
        status: p.status,
        description: p.description,
        objectives: p.objectives,
        statusNote: p.statusNote,
        successMetrics: p.successMetrics,
        systemsBuilt: p.systemsBuilt,
        risks: p.risks,
      },
      milestones: p.milestones.map((m) => ({ id: m.id, title: m.title, status: m.status })),
      deliverables: p.artifacts.map((a) => a.title),
      openTasks: p.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        owner: t.owner?.name ?? "—",
        due: formatDate(t.due),
      })),
    };
  }

  // deal
  const d = await prisma.deal.findUnique({
    where: { id: ref.id },
    select: {
      company: true, stage: true, valueEstimate: true,
      website: true, linkedinUrl: true, instagramUrl: true, headquarters: true,
      companySize: true, founded: true, ownership: true, description: true,
      subIndustry: true, revenueEstimate: true, employeeCount: true,
      nextStep: true, competitor: true, budget: true,
      companyKeyFacts: true, currentSystems: true, painPoints: true,
      contactLinks: CONTACT_LINK_SELECT,
    },
  });
  if (!d) return null;
  const { contactLinks, company, stage, valueEstimate, ...profile } = d;
  void valueEstimate;
  return {
    kind: "deal",
    id: ref.id,
    label: `${company} (deal)`,
    data: { stage, ...profile },
    people: contactLinks.map(toPerson),
  };
}

// An email participant — `known` = already a Contact on file. Optional input:
// callers that have parsed the to/cc list pass it; everyone else omits it.
export type IngestParticipant = {
  name: string | null;
  email: string;
  known: boolean;
};

export type BuildIngestContextArgs = {
  ingestType: IngestType;
  title: string;
  date: string; // YYYY-MM-DD
  focus?: TargetRef | null;
  targets: TargetData[];
  participants?: IngestParticipant[];
};

/** Build the full context block string passed to generate({ context }). */
export function buildIngestContext(args: BuildIngestContextArgs): string {
  const lines: string[] = [
    `## Ingest`,
    `Type: ${args.ingestType}`,
    `Title: ${args.title}`,
    `Date: ${args.date}`,
  ];

  if (args.focus) {
    const f = args.targets.find((t) => t.kind === args.focus!.kind && t.id === args.focus!.id);
    lines.push(`Focus record: ${args.focus.kind} — ${f ? f.label : args.focus.id}`);
  } else {
    lines.push(`Focus record: none — unassigned.`);
  }

  // Email participants (when the caller has them) — known = already a Contact,
  // so only unknown people are candidates for proposedContacts.
  if (args.participants?.length) {
    lines.push("", "## Participants");
    for (const p of args.participants) {
      lines.push(`- ${p.name ?? "(no name)"} <${p.email}> — ${p.known ? "known contact" : "NOT on file"}`);
    }
  }

  if (args.targets.length === 0) {
    lines.push("", "## Targets", "No target records — propose firm-level summary/keyPoints/tasks only.");
  }

  for (const t of args.targets) {
    lines.push("", `## Target — ${t.kind} · ${t.label}`, `recordId: ${t.id}`);

    if (t.kind === "contact") {
      for (const f of CONTACT_SCALAR_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
      for (const f of CONTACT_LIST_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
    } else if (t.kind === "client") {
      for (const f of CLIENT_SCALAR_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
      for (const f of CLIENT_LIST_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
      pushPeople(lines, t.people);
    } else if (t.kind === "project") {
      lines.push(`phase: ${display(t.data.phase)}`, `status: ${display(t.data.status)}`, `description: ${display(t.data.description)}`);
      lines.push(`objectives: ${display(t.data.objectives)}`, `statusNote: ${display(t.data.statusNote)}`);
      lines.push(
        `successMetrics: ${display(t.data.successMetrics)}`,
        `systemsBuilt: ${display(t.data.systemsBuilt)}`,
        `risks: ${display(t.data.risks)}`,
      );
      lines.push(t.milestones.length ? "Current milestones (a task may attach to one via milestoneId):" : "Current milestones: (none)");
      for (const m of t.milestones) lines.push(`  - [${m.id}] "${m.title}" — ${display(m.status)}`);
      lines.push(t.deliverables.length ? "Current deliverables:" : "Current deliverables: (none)");
      for (const d of t.deliverables) lines.push(`  - "${d}"`);
      lines.push(t.openTasks.length ? "Open tasks (use the id for reassignTaskId):" : "Open tasks: (none)");
      for (const ot of t.openTasks) lines.push(`  - [${ot.id}] "${ot.title}" — owner: ${ot.owner}, due ${ot.due}`);
    } else {
      // deal
      lines.push(`stage: ${display(t.data.stage)}`);
      for (const f of DEAL_SCALAR_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
      for (const f of DEAL_LIST_FIELDS) lines.push(`${f}: ${display(t.data[f])}`);
      pushPeople(lines, t.people);
    }
  }

  return lines.join("\n");
}

// CURRENT PEOPLE — already-linked contacts on a deal/client, so the model
// never re-proposes an existing link (it may still propose role updates as
// contactLinks; linkContact upserts in place).
function pushPeople(lines: string[], people: LinkedPerson[]): void {
  if (!people.length) {
    lines.push("CURRENT PEOPLE: (none linked yet)");
    return;
  }
  lines.push("CURRENT PEOPLE (already linked — do NOT re-propose these as new contacts or links):");
  for (const p of people) {
    const role = p.role ? `, ${display(p.role)}` : "";
    lines.push(`  - ${p.name} <${p.email}> (${display(p.relationship)}${role}${p.isPrimary ? ", primary" : ""})`);
  }
}

export type PartnerRosterEntry = { id: string; name: string };

/**
 * Build a roster context block (id + name) so the model can ground ownerHint.
 * Returned separately so the caller can append it to the main context.
 */

export function formatPartnerRoster(partners: PartnerRosterEntry[]): string {
  const lines: string[] = ["", "## Partner roster (for ownerHint)"];
  if (partners.length === 0) lines.push("(none)");
  for (const p of partners) lines.push(`- ${p.name} (${p.id})`);
  return lines.join("\n");
}
