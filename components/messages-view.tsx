"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  kind: "channel" | "dm";
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
            return (
              <button
                key={c.id}
                onClick={() => selectConversation(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
                  on ? "bg-bitumen" : "hover:bg-[var(--color-row-hover)]",
                )}
              >
                <span className="shrink-0">
                  {c.kind === "channel" ? (
                    <Hash size={15} strokeWidth={1.5} className={on ? "text-track-gold" : "text-bone-mute"} />
                  ) : (
                    <Avatar initials={c.initials ?? ""} size="md" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("text-[13px] truncate", on ? "text-bone" : "text-bone-dim")}>{c.label}</span>
                    {c.unread > 0 && (
                      <span className="shrink-0 mono text-[9px] bg-track-gold text-ink px-1.5 py-0.5 tabular-nums">{c.unread}</span>
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
          <EmptyState icon={MessageSquare} title="No conversations yet" />
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
                <EmptyState icon={MessageSquare} title="No other partners" compact />
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
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

  return (
    <Card className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-3 flex items-center gap-2">
        {conversation.kind === "channel" ? (
          <Hash size={15} strokeWidth={1.5} className="text-track-gold" />
        ) : (
          <Avatar initials={conversation.initials ?? ""} size="sm" />
        )}
        <span className="text-[14px] text-bone">{conversation.label}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {loading ? (
          <EmptyState icon={MessageSquare} title="Loading…" compact />
        ) : messages.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No messages yet" hint="Say something." compact />
        ) : (
          messages.map((m) => (
            <MessageRow key={m.id} m={m} mine={m.authorId === currentPartnerId} onTaskToggle={onTaskToggle} />
          ))
        )}
      </div>

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
    </Card>
  );
}

function MessageRow({
  m,
  mine,
  onTaskToggle,
}: {
  m: ChatMessage;
  mine: boolean;
  onTaskToggle: (taskId: string) => void;
}) {
  const isSystem = m.authorId === null;

  // Task card
  if (m.task) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <ClipboardList size={12} strokeWidth={1.5} className="text-track-gold" />
          <span className="label text-[9px]">{m.authorName ?? "System"}</span>
          <span className="label text-[9px]">{timeLabel(m.createdAt)}</span>
        </div>
        <div className="bg-track-gold-dim/10 rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] px-4 py-3 flex items-center gap-3 max-w-[440px]">
          <button onClick={() => onTaskToggle(m.task!.id)} className="shrink-0 text-track-gold hover:text-track-gold/80">
            {m.task.done ? <CheckSquare size={16} strokeWidth={1.5} /> : <Square size={16} strokeWidth={1.5} />}
          </button>
          <div className="min-w-0">
            <p className={cn("text-[13px]", m.task.done ? "text-bone-mute line-through" : "text-bone")}>{m.task.title}</p>
            <p className="text-[11px] text-bone-mute">
              {m.body} · due {new Date(m.task.due).toLocaleDateString("en-CA", { month: "short", day: "numeric" })} · {m.task.priority}
            </p>
          </div>
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
