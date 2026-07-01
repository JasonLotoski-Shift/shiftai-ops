"use client";

// IntrosBoard — the firm-level Intro pipeline (Lane 4, Phase 8). A Kanban by
// IntroStatus, mirroring the deal pipeline board so BD-via-relationship reads
// next to BD-via-outbound. Each card shows the introducer (channel partner),
// the target company, the owner, and — once converted — a link to the deal it
// produced.
//
// The board is a client component fed typed rows by app/(app)/intros/page.tsx
// (a server component). Drag-drop is optimistic with revert-on-error, matching
// pipeline-board / tasks-board. "Converted" is not a drop target — converting
// runs the Deal handoff (convertIntro) from a modal, not a bare status flip.

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, Label, Badge, Button, Input, Textarea, Select, Avatar } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { formatDate } from "@/lib/format";
import {
  createIntro,
  updateIntro,
  updateIntroStatus,
  deleteIntro,
  convertIntro,
} from "@/app/(app)/intros/actions";
import { cn } from "@/lib/cn";
import { Plus, X, Link2, Trash2, ArrowRightLeft, AlertTriangle, Handshake } from "lucide-react";
import type { IntroStatus } from "@/lib/generated/prisma/enums";

/* ──────────────────────────────────────────────────────────────────────
   Shapes + maps
   ────────────────────────────────────────────────────────────────────── */

export type PartnerOption = { id: string; name: string; initials: string };
// Contacts eligible to introduce (channel partners) + every contact for the
// optional target-contact picker.
export type ContactOption = { id: string; name: string; company: string; isChannelPartner: boolean };

type OwnerRef = { id: string; name: string; initials: string } | null;

export type BoardIntro = {
  id: string;
  targetCompany: string;
  status: IntroStatus;
  notes: string | null;
  introducerId: string;
  introducer: { id: string; name: string; company: string };
  targetContactId: string | null;
  targetContact: { id: string; name: string } | null;
  ownerId: string | null;
  owner: OwnerRef;
  dealId: string | null;
  deal: { id: string; company: string } | null;
  createdAt: string; // ISO
};

// Board columns in pipeline order. "converted" is a terminal lane the convert
// handoff fills; the earlier lanes are drop targets. declined / dead ride in a
// single "Closed" column so a dead intro doesn't clutter the live lanes.
export const INTRO_COLUMNS: { key: IntroStatus; label: string }[] = [
  { key: "proposed", label: "Proposed" },
  { key: "requested", label: "Requested" },
  { key: "made", label: "Made" },
  { key: "meeting_set", label: "Meeting Set" },
  { key: "converted", label: "Converted" },
];

// declined + dead share the "Closed" column — status is preserved, the column
// is a display grouping (mirrors the tasks board's Archive column idea).
type IntroColumnKey = IntroStatus | "closed";
export const BOARD_COLUMNS: { key: IntroColumnKey; label: string }[] = [
  ...INTRO_COLUMNS,
  { key: "closed", label: "Closed" },
];

// Columns a card can be dropped into. "converted" is the handoff (a modal, not a
// drop); "closed" is a drop that opens a small reason picker (declined vs dead).
const DROP_STAGES: IntroStatus[] = ["proposed", "requested", "made", "meeting_set"];

export const STATUS_LABEL: Record<IntroStatus, string> = {
  proposed: "Proposed",
  requested: "Requested",
  made: "Made",
  meeting_set: "Meeting Set",
  converted: "Converted",
  declined: "Declined",
  dead: "Dead",
};

// Left-border accent by status — warms from graphite (proposed) toward gold as
// the intro advances, green on convert, muted red when closed.
const STATUS_ACCENT: Record<IntroStatus, string> = {
  proposed: "var(--color-graphite)",
  requested: "var(--color-diagnostic-steel)",
  made: "var(--color-signal-warming)",
  meeting_set: "var(--color-track-gold)",
  converted: "var(--color-signal-fresh)",
  declined: "var(--color-graphite)",
  dead: "var(--color-graphite)",
};

/* ──────────────────────────────────────────────────────────────────────
   Board
   ────────────────────────────────────────────────────────────────────── */

interface IntrosBoardProps {
  initialIntros: BoardIntro[];
  partners: PartnerOption[];
  contacts: ContactOption[];
  currentPartnerId: string;
}

export function IntrosBoard({ initialIntros, partners, contacts, currentPartnerId }: IntrosBoardProps) {
  const router = useRouter();
  const [intros, setIntros] = useState(initialIntros);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<IntroColumnKey | null>(null);

  // Overlays.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BoardIntro | null>(null);
  const [converting, setConverting] = useState<BoardIntro | null>(null);
  // A drop into "Closed" asks whether it's declined or dead.
  const [closing, setClosing] = useState<BoardIntro | null>(null);
  const [deleting, setDeleting] = useState<BoardIntro | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [filterOwner, setFilterOwner] = useState(""); // "" all · "__unassigned__" · partnerId
  const [filterIntroducer, setFilterIntroducer] = useState("");

  useEffect(() => setIntros(initialIntros), [initialIntros]);

  // Keep the open edit/convert modal fresh after a refresh.
  useEffect(() => {
    if (editing) {
      const next = initialIntros.find((i) => i.id === editing.id);
      if (next) setEditing(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIntros]);

  const UNASSIGNED = "__unassigned__";

  // Channel partners present on the board — the introducer filter options.
  const introducersPresent = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of intros) if (!seen.has(i.introducerId)) seen.set(i.introducerId, i.introducer.name);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [intros]);

  const visibleIntros = useMemo(
    () =>
      intros.filter((i) => {
        if (filterIntroducer && i.introducerId !== filterIntroducer) return false;
        if (filterOwner) {
          if (filterOwner === UNASSIGNED) {
            if (i.ownerId) return false;
          } else if (i.ownerId !== filterOwner) return false;
        }
        return true;
      }),
    [intros, filterIntroducer, filterOwner],
  );

  const anyFilter = filterOwner || filterIntroducer;
  function clearFilters() {
    setFilterOwner("");
    setFilterIntroducer("");
  }

  function onDragStart(e: DragEvent, introId: string) {
    setDraggingId(introId);
    e.dataTransfer.setData("text/plain", introId);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
  }

  async function commitStatusMove(introId: string, status: IntroStatus) {
    const prev = intros;
    setIntros((cur) => cur.map((x) => (x.id === introId ? { ...x, status } : x)));
    try {
      await updateIntroStatus(introId, status);
      router.refresh();
    } catch (err) {
      console.error("updateIntroStatus failed:", err);
      setIntros(prev); // revert
    }
  }

  async function onDrop(e: DragEvent, col: IntroColumnKey) {
    e.preventDefault();
    setDragOverCol(null);
    const introId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!introId) return;

    const intro = intros.find((i) => i.id === introId);
    if (!intro) return;
    // A converted intro is frozen — its deal owns it now.
    if (intro.status === "converted") return;

    if (col === "converted") {
      // Convert is a handoff — open the modal instead of a bare status flip.
      setConverting(intro);
      return;
    }
    if (col === "closed") {
      // Ask declined vs dead.
      setClosing(intro);
      return;
    }
    if (intro.status === col) return;
    await commitStatusMove(introId, col);
  }

  async function confirmClose(status: "declined" | "dead") {
    if (!closing) return;
    setActionBusy(true);
    const id = closing.id;
    const prev = intros;
    setIntros((cur) => cur.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await updateIntroStatus(id, status);
      setClosing(null);
      router.refresh();
    } catch (err) {
      console.error("updateIntroStatus (close) failed:", err);
      setIntros(prev);
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setActionBusy(true);
    const id = deleting.id;
    const prev = intros;
    setIntros((cur) => cur.filter((x) => x.id !== id));
    try {
      await deleteIntro(id);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      console.error("deleteIntro failed:", err);
      setIntros(prev);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      {/* Filters + create bar */}
      <div className="flex flex-wrap items-center gap-3 px-8 pt-6">
        <div className="w-[170px]">
          <Select value={filterOwner} onChange={(e) => setFilterOwner(e.target.value)}>
            <option value="">All owners</option>
            <option value={UNASSIGNED}>Unassigned</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === currentPartnerId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
        {introducersPresent.length > 1 && (
          <div className="w-[200px]">
            <Select value={filterIntroducer} onChange={(e) => setFilterIntroducer(e.target.value)}>
              <option value="">All channel partners</option>
              {introducersPresent.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {anyFilter && (
          <Button size="sm" variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        )}

        <div className="ml-auto">
          <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
            <Plus size={13} strokeWidth={1.5} />
            Log intro
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto px-8 py-6">
        <div className="flex gap-5 items-start">
          {BOARD_COLUMNS.map((col) => {
            const isConverted = col.key === "converted";
            const isClosed = col.key === "closed";
            const colIntros = isClosed
              ? visibleIntros.filter((i) => i.status === "declined" || i.status === "dead")
              : visibleIntros.filter((i) => i.status === col.key);
            const isOver = dragOverCol === col.key;
            const droppable = DROP_STAGES.includes(col.key as IntroStatus) || isConverted || isClosed;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverCol !== col.key) setDragOverCol(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverCol((s) => (s === col.key ? null : s));
                  }
                }}
                onDrop={(e) => droppable && onDrop(e, col.key)}
                className={cn("w-[280px] shrink-0 flex flex-col", (isConverted || isClosed) && "opacity-95")}
              >
                <div className="sticky top-0 z-10 bg-bitumen/85 backdrop-blur px-1 pb-3 flex items-center gap-2">
                  <span className={cn("text-[13px]", isClosed ? "text-bone-mute" : "text-bone")}>{col.label}</span>
                  <span className="text-[12px] text-bone-mute tabular-nums">{colIntros.length}</span>
                </div>

                <div
                  className={cn(
                    "flex flex-col gap-2 flex-1 min-h-[40px] rounded-[var(--radius-lg)] transition-colors",
                    isOver && "bg-track-gold-dim/5 outline outline-1 outline-track-gold/30",
                  )}
                >
                  {colIntros.map((intro) => (
                    <IntroCard
                      key={intro.id}
                      intro={intro}
                      dragging={draggingId === intro.id}
                      onDragStart={(e) => onDragStart(e, intro.id)}
                      onDragEnd={onDragEnd}
                      onOpen={() => setEditing(intro)}
                      onConvert={() => setConverting(intro)}
                      onPromptDelete={() => setDeleting(intro)}
                      onNavigate={(href) => router.push(href)}
                    />
                  ))}

                  {colIntros.length === 0 && (
                    <div
                      className={cn(
                        "border border-dashed rounded py-6 text-center text-[11px] leading-snug transition-colors px-2",
                        isOver ? "border-track-gold/60 text-bone-dim" : "border-graphite text-bone-mute",
                      )}
                    >
                      {isConverted
                        ? "Converted intros land here"
                        : isClosed
                          ? "Declined / dead"
                          : isOver
                            ? "Drop here"
                            : "Drag an intro here"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {creating && (
        <CreateIntroModal
          partners={partners}
          contacts={contacts}
          currentPartnerId={currentPartnerId}
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      {editing && (
        <EditIntroModal
          intro={editing}
          partners={partners}
          contacts={contacts}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
          onConvert={() => {
            setConverting(editing);
            setEditing(null);
          }}
          onPromptDelete={() => {
            setDeleting(editing);
            setEditing(null);
          }}
        />
      )}

      {converting && (
        <ConvertIntroModal
          intro={converting}
          onClose={() => {
            setConverting(null);
            router.refresh();
          }}
        />
      )}

      {closing && (
        <CloseIntroModal
          intro={closing}
          busy={actionBusy}
          onCancel={() => setClosing(null)}
          onConfirm={confirmClose}
        />
      )}

      {deleting && (
        <DeleteIntroModal
          intro={deleting}
          busy={actionBusy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Intro card
   ────────────────────────────────────────────────────────────────────── */

function IntroCard({
  intro,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onConvert,
  onPromptDelete,
  onNavigate,
}: {
  intro: BoardIntro;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onConvert: () => void;
  onPromptDelete: () => void;
  onNavigate: (href: string) => void;
}) {
  const converted = intro.status === "converted";
  const canConvert = !converted && intro.status !== "declined" && intro.status !== "dead";
  return (
    <div
      draggable={!converted}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        borderLeftWidth: 2,
        borderLeftStyle: "solid",
        borderLeftColor: STATUS_ACCENT[intro.status],
      }}
      className={cn(
        "group block bg-asphalt rounded-[var(--radius)] shadow-[var(--shadow-sm)] p-3 transition-all hover:shadow-[var(--shadow)] hover:-translate-y-px",
        converted ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[13px] leading-snug text-bone min-w-0">
          <span className="block truncate">{intro.targetCompany}</span>
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Hover controls — convert / delete. Convert is hidden on terminal
              statuses (nothing to hand off). */}
          {canConvert && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onConvert();
              }}
              title="Convert to a deal"
              aria-label="Convert intro to deal"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-signal-fresh"
            >
              <ArrowRightLeft size={13} strokeWidth={1.5} />
            </button>
          )}
          {!converted && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPromptDelete();
              }}
              title="Delete intro"
              aria-label="Delete intro"
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-bone-mute hover:text-flag-red"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          )}
          {intro.owner ? (
            <span title={intro.owner.name} className="inline-flex">
              <Avatar initials={intro.owner.initials} size="sm" />
            </span>
          ) : (
            <span
              title="No owner"
              className="w-5 h-5 rounded-[var(--radius-pill)] border border-dashed border-bone-mute/50 inline-flex items-center justify-center text-[9px] text-bone-mute"
            >
              —
            </span>
          )}
        </div>
      </div>

      {/* Introducer — who's making the intro (the channel partner). */}
      <div className="flex items-center gap-1.5 text-[11px] text-bone-mute mb-2">
        <Handshake size={11} strokeWidth={1.5} className="shrink-0 text-track-gold" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(`/contacts/${intro.introducer.id}`);
          }}
          className="truncate hover:text-bone"
          title={`Open ${intro.introducer.name}`}
        >
          {intro.introducer.name}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {converted && intro.deal ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(`/pipeline/${intro.deal!.id}`);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--radius-pill)] bg-graphite text-bone-dim text-[10px] max-w-[150px] truncate hover:text-bone"
            title="Open the deal"
          >
            <Link2 size={10} strokeWidth={1.5} className="shrink-0" />
            <span className="truncate">View deal</span>
          </button>
        ) : (
          <span className="mono text-[11px] text-bone-mute tabular-nums">{formatDate(intro.createdAt)}</span>
        )}
        {intro.targetContact && (
          <span className="text-[10px] text-bone-mute truncate max-w-[120px]" title={intro.targetContact.name}>
            → {intro.targetContact.name}
          </span>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Modal shell (reuses the guarded ModalShell backdrop)
   ────────────────────────────────────────────────────────────────────── */

function Shell({
  eyebrow,
  title,
  onClose,
  guard = true,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  guard?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ModalShell onClose={onClose} guard={guard} positionClassName="items-center justify-center p-6" scroll={false}>
      <Card className="w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label gold>{eyebrow}</Label>
            <h2 className="text-[18px] text-bone">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-bone-mute hover:text-bone">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </Card>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Create intro
   ────────────────────────────────────────────────────────────────────── */

function CreateIntroModal({
  partners,
  contacts,
  currentPartnerId,
  onClose,
}: {
  partners: PartnerOption[];
  contacts: ContactOption[];
  currentPartnerId: string;
  onClose: () => void;
}) {
  // Channel partners lead the introducer list (they're who sends intros); the
  // rest follow so a not-yet-flagged contact can still be picked (createIntro
  // flags them on save).
  const introducerOptions = useMemo(() => {
    const channel = contacts.filter((c) => c.isChannelPartner);
    const rest = contacts.filter((c) => !c.isChannelPartner);
    return [...channel, ...rest];
  }, [contacts]);

  const [introducerId, setIntroducerId] = useState(introducerOptions[0]?.id ?? "");
  const [targetCompany, setTargetCompany] = useState("");
  const [ownerId, setOwnerId] = useState(currentPartnerId || "");
  const [targetContactId, setTargetContactId] = useState("");
  const [status, setStatus] = useState<IntroStatus>("proposed");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!introducerId) {
      setError("Pick who's making the intro");
      return;
    }
    if (!targetCompany.trim()) {
      setError("Target company is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createIntro({
        introducerId,
        targetCompany,
        ownerId: ownerId || null,
        targetContactId: targetContactId || null,
        status,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      console.error("createIntro failed:", err);
      setError(err instanceof Error ? err.message : "Failed to log intro");
      setSaving(false);
    }
  }

  // Statuses selectable at create — everything except converted (the handoff).
  const createStatuses = INTRO_COLUMNS.filter((c) => c.key !== "converted");

  return (
    <Shell eyebrow="New" title="Log an intro" onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <Label>
          Channel partner <span className="text-flag-red">*</span>
        </Label>
        <Select value={introducerId} onChange={(e) => setIntroducerId(e.target.value)} autoFocus>
          {introducerOptions.length === 0 && <option value="">No contacts on file</option>}
          {introducerOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` · ${c.company}` : ""}
              {c.isChannelPartner ? "" : " (not flagged)"}
            </option>
          ))}
        </Select>
        <span className="label text-[9px] text-bone-mute">
          The person making the introduction. Picking one flags them as a channel partner.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Target company <span className="text-flag-red">*</span>
        </Label>
        <Input
          placeholder="Who they're introducing you to"
          value={targetCompany}
          onChange={(e) => setTargetCompany(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Owner</Label>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === currentPartnerId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as IntroStatus)}>
            {createStatuses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Target contact (optional)</Label>
        <Select value={targetContactId} onChange={(e) => setTargetContactId(e.target.value)}>
          <option value="">Not known yet</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Notes (optional)</Label>
        <Textarea
          rows={3}
          placeholder="The ask, the context, what the channel partner said."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={submit}
          disabled={saving || !introducerId || !targetCompany.trim()}
        >
          {saving ? "Saving…" : "Log intro"}
        </Button>
      </div>
    </Shell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Edit intro — core fields + status; convert / delete surfaced here too.
   ────────────────────────────────────────────────────────────────────── */

function EditIntroModal({
  intro,
  partners,
  contacts,
  onClose,
  onConvert,
  onPromptDelete,
}: {
  intro: BoardIntro;
  partners: PartnerOption[];
  contacts: ContactOption[];
  onClose: () => void;
  onConvert: () => void;
  onPromptDelete: () => void;
}) {
  const [targetCompany, setTargetCompany] = useState(intro.targetCompany);
  const [ownerId, setOwnerId] = useState(intro.ownerId ?? "");
  const [targetContactId, setTargetContactId] = useState(intro.targetContactId ?? "");
  const [status, setStatus] = useState<IntroStatus>(intro.status);
  const [notes, setNotes] = useState(intro.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const converted = intro.status === "converted";

  async function save() {
    if (!targetCompany.trim()) {
      setError("Target company is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Fields + the status move in ONE action, so a partial write (fields saved,
      // status lost) can't happen. Convert is never done here — it's the handoff.
      await updateIntro(intro.id, {
        targetCompany,
        ownerId: ownerId || null,
        targetContactId: targetContactId || null,
        notes: notes.trim() || null,
        status,
      });
      onClose();
    } catch (err) {
      console.error("updateIntro failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }

  // Every status except converted is editable here; converted is reached only
  // through the convert handoff.
  const editableStatuses = (Object.keys(STATUS_LABEL) as IntroStatus[]).filter((s) => s !== "converted");

  return (
    <Shell eyebrow="Intro" title={converted ? "Converted intro" : "Edit intro"} onClose={onClose}>
      {converted && (
        <div className="flex items-start gap-2 px-3 py-2 border border-signal-fresh/40 bg-signal-fresh/5 rounded-[var(--radius)]">
          <Link2 size={13} strokeWidth={1.5} className="text-signal-fresh mt-0.5 shrink-0" />
          <span className="text-[12px] text-bone-dim">
            This intro became a deal.{" "}
            {intro.deal && (
              <a href={`/pipeline/${intro.deal.id}`} className="text-signal-fresh underline underline-offset-2">
                Open {intro.deal.company}
              </a>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[12px] text-bone-mute">
        <Handshake size={13} strokeWidth={1.5} className="text-track-gold" />
        Introduced by{" "}
        <a href={`/contacts/${intro.introducer.id}`} className="text-bone hover:text-track-gold underline underline-offset-2">
          {intro.introducer.name}
        </a>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Target company</Label>
        <Input value={targetCompany} onChange={(e) => setTargetCompany(e.target.value)} disabled={converted} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Owner</Label>
          <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Unassigned</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as IntroStatus)}
            disabled={converted}
          >
            {editableStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Target contact (optional)</Label>
        <Select value={targetContactId} onChange={(e) => setTargetContactId(e.target.value)} disabled={converted}>
          <option value="">Not known yet</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Notes (optional)</Label>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={converted} />
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!converted && (
            <Button size="sm" variant="ghost" onClick={onPromptDelete} disabled={saving}>
              <Trash2 size={13} strokeWidth={1.5} />
              Delete
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!converted && intro.status !== "declined" && intro.status !== "dead" && (
            <Button size="sm" variant="secondary" onClick={onConvert} disabled={saving}>
              <ArrowRightLeft size={13} strokeWidth={1.5} />
              Convert to deal
            </Button>
          )}
          {!converted && (
            <Button size="sm" variant="primary" onClick={save} disabled={saving || !targetCompany.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          {converted && (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Convert intro → Deal. The handoff: creates a Deal, links the introducer
   (introduced_us), sets Intro.dealId. Redirects to the new deal.
   ────────────────────────────────────────────────────────────────────── */

const CONVERT_STAGES: { key: string; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "qualified", label: "Qualified" },
  { key: "discovery", label: "Discovery Call" },
  { key: "discussion", label: "Discussion Call" },
];

function ConvertIntroModal({ intro, onClose }: { intro: BoardIntro; onClose: () => void }) {
  const router = useRouter();
  const [stage, setStage] = useState("lead");
  const [valueEstimate, setValueEstimate] = useState("");
  const [closeTargetDate, setCloseTargetDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await convertIntro(intro.id, {
        stage,
        valueEstimate: valueEstimate ? Number(valueEstimate) : undefined,
        closeTargetDate: closeTargetDate || undefined,
      });
      router.push(`/pipeline/${res.dealId}`);
    } catch (err) {
      console.error("convertIntro failed:", err);
      setError(err instanceof Error ? err.message : "Failed to convert");
      setSaving(false);
    }
  }

  return (
    <Shell eyebrow="Convert" title="Intro → Deal" onClose={onClose}>
      <div className="flex items-start gap-2 px-3 py-2.5 border border-track-gold/30 bg-track-gold-dim/5 rounded-[var(--radius)]">
        <ArrowRightLeft size={13} strokeWidth={1.5} className="text-track-gold mt-0.5 shrink-0" />
        <span className="text-[12px] text-bone-dim leading-relaxed">
          Creates a deal for <span className="text-bone">{intro.targetCompany}</span> and records{" "}
          <span className="text-bone">{intro.introducer.name}</span> as the person who introduced you. The intro
          moves to converted. Set the deal-source commission on the deal if there's a fee.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Start stage</Label>
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {CONVERT_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Est. value (optional)</Label>
          <Input
            type="number"
            min={0}
            placeholder="CAD"
            value={valueEstimate}
            onChange={(e) => setValueEstimate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Close target (optional)</Label>
        <Input type="date" value={closeTargetDate} onChange={(e) => setCloseTargetDate(e.target.value)} />
        <span className="label text-[9px] text-bone-mute">Defaults to 60 days out.</span>
      </div>

      {error && <p className="text-[12px] text-flag-red">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={submit} disabled={saving}>
          {saving ? "Converting…" : "Convert to deal"}
        </Button>
      </div>
    </Shell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Close intro — declined vs dead (a drop into the Closed column).
   ────────────────────────────────────────────────────────────────────── */

function CloseIntroModal({
  intro,
  busy,
  onCancel,
  onConfirm,
}: {
  intro: BoardIntro;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (status: "declined" | "dead") => void;
}) {
  return (
    <ModalShell onClose={onCancel} guard={false} positionClassName="items-center justify-center p-6" scroll={false}>
      <Card className="w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <Label gold>Close intro</Label>
          <span className="text-[13px] text-bone-dim leading-relaxed">
            How did the intro to <span className="text-bone">{intro.targetCompany}</span> end?
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm("declined")}
            disabled={busy}
            className="text-left px-3 py-2.5 rounded-[var(--radius)] border border-graphite-2 hover:border-bone-mute transition-colors"
          >
            <span className="block text-[13px] text-bone">Declined</span>
            <span className="block text-[11px] text-bone-mute">The channel partner or the target passed.</span>
          </button>
          <button
            onClick={() => onConfirm("dead")}
            disabled={busy}
            className="text-left px-3 py-2.5 rounded-[var(--radius)] border border-graphite-2 hover:border-bone-mute transition-colors"
          >
            <span className="block text-[13px] text-bone">Dead</span>
            <span className="block text-[11px] text-bone-mute">Went cold, no path forward.</span>
          </button>
        </div>
        <div className="flex items-center justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </Card>
    </ModalShell>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Delete confirm
   ────────────────────────────────────────────────────────────────────── */

function DeleteIntroModal({
  intro,
  busy,
  onCancel,
  onConfirm,
}: {
  intro: BoardIntro;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalShell onClose={onCancel} guard={false} positionClassName="items-center justify-center p-6" scroll={false}>
      <Card className="w-full max-w-md p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} strokeWidth={1.5} className="text-flag-red shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="text-[14px] text-bone font-medium">Delete intro?</span>
            <span className="text-[12px] text-bone-dim leading-relaxed">
              The intro to <span className="text-bone">{intro.targetCompany}</span> will be removed. Its follow-up
              tasks stay on the board as standalone tasks.
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} disabled={busy}>
            <Trash2 size={13} strokeWidth={1.5} />
            {busy ? "Deleting…" : "Delete intro"}
          </Button>
        </div>
      </Card>
    </ModalShell>
  );
}
