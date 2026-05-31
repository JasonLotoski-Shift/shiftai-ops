"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Hash,
  Send,
  Plus,
  X,
  CheckSquare,
  Square,
  ClipboardList,
  MessageSquare,
  Sparkles,
  FileText,
  AlertCircle,
  ArrowUpRight,
} from "lucide-react";
import { Button, Label, Input, Card, Avatar, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  getMessagesSince,
  postMessage,
  markChannelRead,
  openDM,
  type ChatMessage,
} from "@/app/(app)/messages/actions";
import { toggleTaskDone } from "@/app/(app)/dashboard/actions";

export type Conversation = {
  id: string;
  kind: "channel" | "dm" | "system";
  label: string;
  initials: string | null;
  unread: number;
  lastTs: string | null;
  lastPreview: string | null;
};

const POLL_MS = 4000;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

export function MessagesView({
  conversations,
  partners,
  currentPartnerId,
}: {
  conversations: Conversation[];
  partners: { id: string; name: string; initials: string }[];
  currentPartnerId: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const [newDMOpen, setNewDMOpen] = useState(false);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function selectConversation(id: string) {
    setSelectedId(id);
    void markChannelRead(id);
  }

  function startDM(partnerId: string) {
    setNewDMOpen(false);
    void openDM(partnerId).then(({ channelId }) => {
      setSelectedId(channelId);
      router.refresh(); // pull the new DM into the conversation list
    });
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-180px)]">
      {/* Conversation rail */}
      <Card className="w-[260px] shrink-0 flex flex-col overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <Label>Conversations</Label>
          <button onClick={() => setNewDMOpen(true)} className="text-bone-mute hover:text-track-gold" title="New direct message">
            <Plus size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const on = c.id === selectedId;
            const isSystem = c.kind === "system";
            return (
              <button
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
                  isSystem && "border-b border-[var(--color-row-hover)]",
                  on
                    ? "bg-bitumen"
                    : isSystem
                      ? "bg-track-gold-dim/5 hover:bg-track-gold-dim/10"
                      : "hover:bg-[var(--color-row-hover)]",
                )}
              >
                <span className="shrink-0">
                  {isSystem ? (
                    <span className="w-6 h-6 inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-track-gold-dim/30 border border-track-gold/40">
                      <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
                    </span>
                  ) : c.kind === "channel" ? (
                    <Hash size={15} strokeWidth={1.5} className={on ? "text-track-gold" : "text-bone-mute"} />
                  ) : (
                    <Avatar initials={c.initials ?? ""} size="md" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[13px] truncate",
                        isSystem ? "text-track-gold" : on ? "text-bone" : "text-bone-dim",
                      )}
                    >
                      {c.label}
                    </span>
                    {c.unread > 0 && (
                      <span
                        className="shrink-0 w-2 h-2 rounded-full bg-flag-red"
                        title={`${c.unread} unread`}
                      />
                    )}
                  </span>
                  {c.lastPreview && <span className="block text-[11px] text-bone-mute truncate">{c.lastPreview}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Message pane */}
      {selected ? (
        <ChannelPane
          key={selected.id}
          conversation={selected}
          currentPartnerId={currentPartnerId}
        />
      ) : (
        <Card className="flex-1 flex items-center justify-center">
          <EmptyState icon={<MessageSquare size={28} strokeWidth={1.5} />} title="No conversations yet" />
        </Card>
      )}

      {/* New DM picker */}
      {newDMOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-28 px-4 bg-bitumen/85 backdrop-blur-sm" onClick={() => setNewDMOpen(false)}>
          <div className="w-full max-w-[400px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4">
              <Label gold>New direct message</Label>
              <button onClick={() => setNewDMOpen(false)} className="text-bone-mute hover:text-bone">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <div>
              {partners.length === 0 ? (
                <EmptyState icon={<MessageSquare size={22} strokeWidth={1.5} />} title="No other partners" compact />
              ) : (
                partners.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => startDM(p.id)}
                    className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-[var(--color-row-hover)] transition-colors"
                  >
                    <Avatar initials={p.initials} size="md" />
                    <span className="text-[14px] text-bone">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelPane({
  conversation,
  currentPartnerId,
}: {
  conversation: Conversation;
  currentPartnerId: string;
}) {
  const isSystem = conversation.kind === "system";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"newest" | "type">("newest");
  const [, startSend] = useTransition();
  const cursorRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Initial load when the conversation changes (component is keyed on id, so
  // this mounts fresh per conversation).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getMessagesSince(conversation.id)
      .then((msgs) => {
        if (cancelled) return;
        setMessages(msgs);
        cursorRef.current = msgs.length ? msgs[msgs.length - 1].createdAt : null;
        setLoading(false);
        scrollToBottom();
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id, scrollToBottom]);

  // Poll for new messages.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const fresh = await getMessagesSince(conversation.id, cursorRef.current ?? undefined);
        if (fresh.length > 0) {
          setMessages((prev) => {
            // De-dupe by id (our own optimistic posts may already be present).
            const seen = new Set(prev.map((m) => m.id));
            const add = fresh.filter((m) => !seen.has(m.id));
            return add.length ? [...prev, ...add] : prev;
          });
          cursorRef.current = fresh[fresh.length - 1].createdAt;
          scrollToBottom();
          void markChannelRead(conversation.id);
        }
      } catch {
        /* transient — next tick retries */
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [conversation.id, scrollToBottom]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    startSend(async () => {
      try {
        const msg = await postMessage(conversation.id, text);
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        cursorRef.current = msg.createdAt;
        scrollToBottom();
      } catch {
        setDraft(text); // restore on failure
      }
    });
  }

  function onTaskToggle(taskId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.task?.id === taskId ? { ...m, task: { ...m.task, done: !m.task.done } } : m)),
    );
    void toggleTaskDone(taskId).catch(() => {
      // revert on failure
      setMessages((prev) =>
        prev.map((m) => (m.task?.id === taskId ? { ...m, task: { ...m.task!, done: !m.task!.done } } : m)),
      );
    });
  }

  // The system channel can be re-ordered client-side by the sort control.
  // Chat channels always render in arrival order.
  const rendered = useMemo(() => {
    if (!isSystem || sort === "newest") return messages;
    // Sort by kind, keeping newest-first within each group.
    const order: Record<string, number> = {
      approval_needed: 0,
      task_assigned: 1,
      deliverable_added: 2,
      chat: 3,
    };
    return [...messages].sort((a, b) => {
      const ra = order[a.kind] ?? 9;
      const rb = order[b.kind] ?? 9;
      if (ra !== rb) return ra - rb;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [isSystem, sort, messages]);

  return (
    <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isSystem ? (
            <span className="w-6 h-6 inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-track-gold-dim/30 border border-track-gold/40 shrink-0">
              <Sparkles size={13} strokeWidth={1.5} className="text-track-gold" />
            </span>
          ) : conversation.kind === "channel" ? (
            <Hash size={15} strokeWidth={1.5} className="text-track-gold" />
          ) : (
            <Avatar initials={conversation.initials ?? ""} size="sm" />
          )}
          <span className="text-[14px] text-bone truncate">{conversation.label}</span>
          {isSystem && <span className="label text-[9px]">Notifications · read-only</span>}
        </div>
        {isSystem && messages.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="label text-[9px]">Sort</span>
            <button
              onClick={() => setSort("newest")}
              className={cn(
                "text-[11px] px-2 py-1 rounded-[var(--radius-sm)] transition-colors",
                sort === "newest" ? "bg-track-gold-dim/15 text-bone" : "text-bone-mute hover:text-bone",
              )}
            >
              Newest
            </button>
            <button
              onClick={() => setSort("type")}
              className={cn(
                "text-[11px] px-2 py-1 rounded-[var(--radius-sm)] transition-colors",
                sort === "type" ? "bg-track-gold-dim/15 text-bone" : "text-bone-mute hover:text-bone",
              )}
            >
              Type
            </button>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {loading ? (
          <EmptyState icon={<MessageSquare size={22} strokeWidth={1.5} />} title="Loading…" compact />
        ) : rendered.length === 0 ? (
          isSystem ? (
            <EmptyState icon={<Sparkles size={22} strokeWidth={1.5} />} title="Nothing here yet" hint="Task assignments, deliverables, and approvals will land here." compact />
          ) : (
            <EmptyState icon={<MessageSquare size={22} strokeWidth={1.5} />} title="No messages yet" hint="Say something." compact />
          )
        ) : (
          rendered.map((m) => (
            <MessageRow key={m.id} m={m} mine={m.authorId === currentPartnerId} onTaskToggle={onTaskToggle} />
          ))
        )}
      </div>

      {!isSystem && (
        <form onSubmit={send} className="px-6 py-4 flex items-center gap-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${conversation.label}…`}
            className="flex-1"
          />
          <Button variant="primary" size="md" type="submit" disabled={!draft.trim()}>
            <Send size={13} strokeWidth={1.5} />
            Send
          </Button>
        </form>
      )}
    </Card>
  );
}

// Visual treatment per typed system-note kind: color + icon.
const KIND_STYLE: Record<
  Exclude<ChatMessage["kind"], "chat">,
  { Icon: typeof ClipboardList; accent: string; bg: string; label: string }
> = {
  task_assigned: {
    Icon: ClipboardList,
    accent: "text-track-gold",
    bg: "bg-track-gold-dim/10",
    label: "Task assigned",
  },
  deliverable_added: {
    Icon: FileText,
    accent: "text-signal-fresh",
    bg: "bg-signal-fresh/10",
    label: "Deliverable added",
  },
  approval_needed: {
    Icon: AlertCircle,
    accent: "text-signal-warming",
    bg: "bg-signal-warming/10",
    label: "Approval needed",
  },
};

function MessageRow({
  m,
  mine,
  onTaskToggle,
}: {
  m: ChatMessage;
  mine: boolean;
  onTaskToggle: (taskId: string) => void;
}) {
  const router = useRouter();
  const isSystem = m.authorId === null;
  const typed = m.kind !== "chat" ? KIND_STYLE[m.kind] : null;

  // Task card (keeps the existing rendering; gains the typed accent + optional
  // click-through when a link is present).
  if (m.task) {
    const accent = typed?.accent ?? "text-track-gold";
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ClipboardList size={12} strokeWidth={1.5} className={accent} />
          <span className="label text-[9px]">{typed?.label ?? m.authorName ?? "System"}</span>
          <span className="label text-[9px]">{timeLabel(m.createdAt)}</span>
        </div>
        <div
          className={cn(
            "bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex items-center gap-3 max-w-[440px]",
            m.link && "cursor-pointer hover:bg-track-gold-dim/15 transition-colors",
          )}
          onClick={m.link ? () => router.push(m.link!) : undefined}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTaskToggle(m.task!.id);
            }}
            className="shrink-0 text-track-gold hover:text-track-gold/80"
          >
            {m.task.done ? <CheckSquare size={16} strokeWidth={1.5} /> : <Square size={16} strokeWidth={1.5} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13px]", m.task.done ? "text-bone-mute line-through" : "text-bone")}>{m.task.title}</p>
            <p className="text-[11px] text-bone-mute">
              {m.body} · due {new Date(m.task.due).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} · {m.task.priority}
            </p>
          </div>
          {m.link && <ArrowUpRight size={14} strokeWidth={1.5} className="shrink-0 text-bone-mute" />}
        </div>
      </div>
    );
  }

  // Typed system note (no task card) — colored, icon'd, optionally click-through.
  if (typed) {
    const { Icon, accent, bg } = typed;
    const clickable = !!m.link;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Icon size={12} strokeWidth={1.5} className={accent} />
          <span className="label text-[9px]">{typed.label}</span>
          <span className="label text-[9px]">{timeLabel(m.createdAt)}</span>
        </div>
        <div
          className={cn(
            "rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex items-center gap-3 max-w-[440px]",
            bg,
            clickable && "cursor-pointer hover:brightness-105 transition-all",
          )}
          onClick={clickable ? () => router.push(m.link!) : undefined}
        >
          <Icon size={16} strokeWidth={1.5} className={cn("shrink-0", accent)} />
          <p className="text-[13px] text-bone min-w-0 flex-1 whitespace-pre-wrap">{m.body}</p>
          {clickable && <ArrowUpRight size={14} strokeWidth={1.5} className="shrink-0 text-bone-mute" />}
        </div>
      </div>
    );
  }

  if (isSystem) {
    return (
      <div className="self-center text-[11px] text-bone-mute italic px-3 py-1">{m.body}</div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1 max-w-[560px]", mine && "self-end items-end")}>
      <div className="flex items-center gap-2">
        <span className="label text-[9px]">{mine ? "You" : m.authorName}</span>
        <span className="label text-[9px]">{timeLabel(m.createdAt)}</span>
      </div>
      <div className={cn("px-4 py-2 text-[13px] leading-relaxed whitespace-pre-wrap rounded-lg", mine ? "bg-track-gold-dim/15 text-bone" : "bg-bitumen text-bone-dim")}>
        {m.body}
      </div>
    </div>
  );
}
