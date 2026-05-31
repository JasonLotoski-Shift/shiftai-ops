import { Header } from "@/components/header";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureFirmChannels, ensureSystemChannel } from "@/lib/messaging";
import { MessagesView, type Conversation } from "@/components/messages-view";

export default async function MessagesPage() {
  const session = await auth();
  const partnerId = session?.user?.partnerId;
  if (!partnerId) return null; // middleware gates this; defensive.

  // Guarantee the firm channels exist + everyone's a member (idempotent).
  await ensureFirmChannels();
  // Guarantee this partner's personal "Claude" system channel exists (idempotent).
  await ensureSystemChannel(prisma, partnerId);

  const memberships = await prisma.channelMember.findMany({
    where: { partnerId },
    select: {
      lastReadAt: true,
      channel: {
        select: {
          id: true,
          kind: true,
          name: true,
          createdAt: true,
          members: { select: { partner: { select: { id: true, name: true, initials: true } } } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true, taskId: true, kind: true },
          },
        },
      },
    },
  });

  // Unread = messages newer than this member's lastReadAt.
  const unreadCounts = await Promise.all(
    memberships.map((m) =>
      prisma.message.count({
        where: {
          channelId: m.channel.id,
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      }),
    ),
  );

  const conversations: Conversation[] = memberships.map((m, i) => {
    const ch = m.channel;
    const last = ch.messages[0] ?? null;
    const isDM = ch.kind === "dm";
    const isSystem = ch.kind === "system";
    const other = isDM
      ? ch.members.map((mm) => mm.partner).find((p) => p.id !== partnerId)
      : null;
    // Preview for the rail. System notes show a typed label; chat shows the body.
    let lastPreview: string | null = null;
    if (last) {
      if (last.taskId) lastPreview = "Task assigned";
      else if (last.kind && last.kind !== "chat") lastPreview = systemPreview(last.kind);
      else lastPreview = last.body;
    }
    return {
      id: ch.id,
      kind: ch.kind,
      label: isSystem
        ? "Claude"
        : isDM
          ? other?.name ?? "Direct message"
          : `#${ch.name ?? "channel"}`,
      initials: isDM ? other?.initials ?? "··" : null,
      unread: unreadCounts[i],
      lastTs: last?.createdAt.toISOString() ?? null,
      lastPreview,
    };
  });

  // Sort: the "Claude" system channel pinned at the very top, then channels
  // (by name), then DMs by most-recent activity.
  const rank = (k: Conversation["kind"]) => (k === "system" ? 0 : k === "channel" ? 1 : 2);
  conversations.sort((a, b) => {
    if (rank(a.kind) !== rank(b.kind)) return rank(a.kind) - rank(b.kind);
    if (a.kind === "channel") return a.label.localeCompare(b.label);
    return (b.lastTs ?? "").localeCompare(a.lastTs ?? "");
  });

  // Partners available to DM (everyone but me).
  const partners = await prisma.partner.findMany({
    where: { id: { not: partnerId } },
    select: { id: true, name: true, initials: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <Header eyebrow="Firm · Messages" title="Messages." />
      <div className="px-8 py-8">
        <MessagesView conversations={conversations} partners={partners} currentPartnerId={partnerId} />
      </div>
    </>
  );
}

// Short rail preview for a typed system note (no chat body to show).
function systemPreview(kind: string): string {
  switch (kind) {
    case "task_assigned":
      return "Task assigned";
    case "deliverable_added":
      return "Deliverable added";
    case "approval_needed":
      return "Approval needed";
    default:
      return "Update";
  }
}
