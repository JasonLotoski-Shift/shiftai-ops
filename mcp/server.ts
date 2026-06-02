#!/usr/bin/env tsx
// Ops-tool MCP server (Phase 4) — the "door for Claudes outside the app."
//
// Same Prisma client / same Postgres as the web UI; a different surface.
// Claude Code workspaces and scheduled agents register this server and call
// its tools to read/write firm state. Contract: docs/mcp-contract.md.
//
// Transport: stdio (the simple, local default — resolves the contract's open
// "transport" question for the Claude-Code-on-a-laptop case). HTTP transport is
// the documented upgrade path for off-machine scheduled agents.
//
// Writes follow the canonical recipe: every mutation calls writeAudit (and
// writeActivity when feed-worthy) so an agent's actions round-trip into the
// ledger exactly like a partner's. Actor is tagged "AGENT · MCP".
//
// Run:  npm run mcp   (needs DATABASE_URL in env — same .env as the web app)
//
// NOTE: the contract lists log_hours / get_team_hours; Hours was removed from
// the tool (HoursEntry deleted 2026-05-28), so those tools are intentionally
// omitted here.

// Load .env first — tsx doesn't auto-load it for a standalone process, and
// lib/prisma reads DATABASE_URL at import time. Must precede the lib import.
import "dotenv/config";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { prisma } from "../lib/prisma";
import { writeAudit, writeActivity, agentActor } from "../lib/audit";
import type { EngagementStatus, TaskPriority, ArtifactType, InteractionType } from "../lib/generated/prisma/enums";

const ACTOR = agentActor("mcp");

type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const tools: Tool[] = [
  // ── Read tools ──
  {
    name: "get_client",
    description: "Full client record: contract terms, status, partner lead, primary contact, driveFolderUrl, workspacePath, projects.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (a) => {
      const id = str(a.id);
      return prisma.client.findUnique({
        where: { id },
        include: {
          partnerLead: { select: { name: true, email: true } },
          primaryContact: { select: { name: true, email: true } },
          projects: { select: { id: true, name: true, phase: true, status: true } },
        },
      });
    },
  },
  {
    name: "get_project",
    description: "Project record: scope, phase, status, budget, milestones, parent client.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (a) =>
      prisma.project.findUnique({
        where: { id: str(a.id) },
        include: {
          client: { select: { id: true, company: true } },
          partnerLead: { select: { name: true } },
          milestones: { select: { title: true, dueDate: true, status: true } },
        },
      }),
  },
  {
    name: "list_pipeline",
    description: "Open deals, optionally filtered by stage. Returns stage, value, last-touch, stage-entered, owner.",
    inputSchema: {
      type: "object",
      properties: { stage: { type: "string", description: "lead|qualified|discovery|discussion|proposal|negotiation|signed (optional)" } },
    },
    handler: async (a) => {
      const stage = str(a.stage);
      return prisma.deal.findMany({
        where: stage ? { stage: stage as never } : undefined,
        orderBy: { stageEnteredAt: "asc" },
        select: {
          id: true, company: true, stage: true, valueEstimate: true,
          lastTouchAt: true, stageEnteredAt: true,
          partnerLead: { select: { name: true } },
        },
      });
    },
  },
  {
    name: "list_active_engagements",
    description: "Clients whose engagement is on-track / at-risk / blocked / closing (i.e. not closed).",
    inputSchema: { type: "object", properties: {} },
    handler: async () =>
      prisma.client.findMany({
        where: { status: { not: "closed" } },
        select: { id: true, company: true, status: true, contractValue: true, partnerLead: { select: { name: true } } },
      }),
  },
  {
    name: "list_artifacts",
    description: "Deliverables for a scope. Pass exactly one of clientId / projectId / dealId.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" }, projectId: { type: "string" }, dealId: { type: "string" } },
    },
    handler: async (a) => {
      const where = str(a.clientId)
        ? { clientId: str(a.clientId) }
        : str(a.projectId)
          ? { projectId: str(a.projectId) }
          : str(a.dealId)
            ? { dealId: str(a.dealId) }
            : {};
      return prisma.artifact.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, title: true, driveUrl: true, reviewStatus: true, generatedFromSkill: true, createdBy: true, createdAt: true },
      });
    },
  },
  {
    name: "get_contact",
    description: "Full contact record incl. enrichment fields and recent interactions.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (a) =>
      prisma.contact.findUnique({
        where: { id: str(a.id) },
        include: { interactions: { orderBy: { date: "desc" }, take: 10 } },
      }),
  },
  {
    name: "list_contacts",
    description: "Contacts, optionally filtered by a name/company query.",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    handler: async (a) => {
      const q = str(a.query);
      return prisma.contact.findMany({
        where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] } : undefined,
        orderBy: { lastTouchAt: "desc" },
        take: 50,
        select: { id: true, name: true, title: true, company: true, email: true, lastTouchAt: true },
      });
    },
  },

  // ── Write tools (canonical recipe: mutate + writeAudit in one transaction) ──
  {
    name: "create_artifact",
    description: "Register a deliverable (e.g. a doc Claude produced in a client workspace). Pass one of clientId/projectId/dealId.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", description: "proposal|deck|email|sow|invoice|report|other" },
        title: { type: "string" },
        driveUrl: { type: "string" },
        clientId: { type: "string" },
        projectId: { type: "string" },
        dealId: { type: "string" },
        generatedFromSkill: { type: "string" },
      },
      required: ["type", "title", "driveUrl"],
    },
    handler: async (a) => {
      const created = await prisma.$transaction(async (tx) => {
        const art = await tx.artifact.create({
          data: {
            type: (str(a.type) ?? "other") as ArtifactType,
            title: str(a.title)!,
            driveUrl: str(a.driveUrl)!,
            createdBy: "AGENT · MCP",
            generatedFromSkill: str(a.generatedFromSkill) ?? null,
            reviewStatus: "draft",
            clientId: str(a.clientId) ?? null,
            projectId: str(a.projectId) ?? null,
            dealId: str(a.dealId) ?? null,
          },
        });
        await writeAudit(tx, { actor: ACTOR, action: "create.artifact", targetType: "Artifact", targetId: art.id, changes: { via: "mcp" } });
        await writeActivity(tx, { actor: ACTOR, type: "doc", target: art.title, detail: "Registered a deliverable via MCP" });
        return art;
      });
      return { id: created.id };
    },
  },
  {
    name: "update_project_status",
    description: "Update a project's engagement status from inside a client workspace.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        status: { type: "string", description: "on_track|at_risk|blocked|closing|closed" },
        notes: { type: "string" },
      },
      required: ["projectId", "status"],
    },
    handler: async (a) => {
      const projectId = str(a.projectId)!;
      const status = str(a.status)! as EngagementStatus;
      const before = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true, name: true } });
      if (!before) throw new Error("Project not found");
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: projectId }, data: { status } });
        await writeAudit(tx, { actor: ACTOR, action: "update.project.status", targetType: "Project", targetId: projectId, changes: { status: { before: before.status, after: status }, notes: str(a.notes) } });
        await writeActivity(tx, { actor: ACTOR, type: "status", target: before.name, detail: `Status → ${status.replace("_", "-")}${str(a.notes) ? ` — ${str(a.notes)}` : ""}`, link: `/projects/${projectId}` });
      });
      return { ok: true };
    },
  },
  {
    name: "create_task",
    description: "Create a task assigned to a partner. Every task carries context.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        ownerId: { type: "string", description: "Partner id (assignee)" },
        priority: { type: "string", description: "high|medium|low" },
        due: { type: "string", description: "YYYY-MM-DD" },
        context: { type: "string" },
        clientId: { type: "string" },
        projectId: { type: "string" },
      },
      required: ["title", "ownerId", "due"],
    },
    handler: async (a) => {
      const owner = await prisma.partner.findUnique({ where: { id: str(a.ownerId) }, select: { id: true, name: true } });
      if (!owner) throw new Error("Owner (partner) not found");
      const due = new Date(str(a.due)!);
      if (Number.isNaN(due.getTime())) throw new Error("Invalid due date");
      const created = await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            title: str(a.title)!,
            ownerId: owner.id,
            priority: ((str(a.priority) ?? "medium")) as TaskPriority,
            due,
            context: str(a.context) ?? null,
            clientId: str(a.clientId) ?? null,
            projectId: str(a.projectId) ?? null,
          },
        });
        await writeAudit(tx, { actor: ACTOR, action: "create.task", targetType: "Task", targetId: task.id, changes: { via: "mcp", ownerId: owner.id } });
        await writeActivity(tx, { actor: ACTOR, type: "status", target: task.title, detail: `Created task for ${owner.name} via MCP`, link: "/tasks" });
        return task;
      });
      return { id: created.id };
    },
  },
  {
    name: "log_interaction",
    description: "Log a call/meeting/email against a contact (advances last-touch).",
    inputSchema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        type: { type: "string", description: "call|meeting|email_sent|email_received|other" },
        date: { type: "string", description: "YYYY-MM-DD" },
        summary: { type: "string" },
      },
      required: ["contactId", "type", "date", "summary"],
    },
    handler: async (a) => {
      const contact = await prisma.contact.findUnique({ where: { id: str(a.contactId) }, select: { id: true, name: true, lastTouchAt: true } });
      if (!contact) throw new Error("Contact not found");
      const date = new Date(str(a.date)!);
      if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
      const created = await prisma.$transaction(async (tx) => {
        const i = await tx.interaction.create({
          data: { contactId: contact.id, type: str(a.type)! as InteractionType, date, summary: str(a.summary)!, loggedBy: "AGENT · MCP" },
        });
        if (date > contact.lastTouchAt) await tx.contact.update({ where: { id: contact.id }, data: { lastTouchAt: date } });
        await writeAudit(tx, { actor: ACTOR, action: "create.interaction", targetType: "Interaction", targetId: i.id, changes: { via: "mcp", contactId: contact.id } });
        await writeActivity(tx, { actor: ACTOR, type: "touch", target: contact.name, detail: "Logged interaction via MCP", link: `/contacts/${contact.id}` });
        return i;
      });
      return { id: created.id };
    },
  },
];

const server = new Server(
  { name: "shiftai-ops", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so it doesn't corrupt the stdio JSON-RPC stream on stdout.
  process.stderr.write("shiftai-ops MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`MCP server failed: ${err}\n`);
  process.exit(1);
});
