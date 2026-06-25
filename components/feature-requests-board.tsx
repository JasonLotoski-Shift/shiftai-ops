"use client";

// Feature Requests & Fixes board.
//
// Any partner files an item and any partner can move its status. Items are
// grouped into status columns; a quick status <Select> sits on each card for
// fast moves, and clicking a card opens the detail/edit modal. Mirrors the
// server-component → typed-props → client-child pattern (see tasks/page.tsx)
// and the ModalShell form pattern (see delete-deal-modal.tsx).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Bug, Sparkles, Wrench, AlertOctagon, Trash2, ShieldAlert, type LucideIcon } from "lucide-react";
import { Button, Card, Badge, Label, Input, Textarea, Select, SearchInput, EmptyState, Avatar } from "@/components/ui";
import { ModalShell } from "@/components/modal-shell";
import { cn } from "@/lib/cn";
import {
  FEATURE_AREAS,
  APP_WIDE_AREA,
  areaDisplay,
  subTabsFor,
} from "@/lib/feature-area-taxonomy";
import {
  createFeatureRequest,
  updateFeatureRequest,
  updateFeatureRequestStatus,
  deleteFeatureRequest,
} from "@/app/(app)/feature-requests/actions";

type BadgeTone = "neutral" | "gold" | "steel" | "red" | "bone" | "green" | "orange";

export type FeatureRequestItem = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  areaTab: string;
  areaSubTab: string | null;
  createdById: string;
  createdBy: { id: string; name: string; initials: string } | null;
  createdAt: string;
  updatedAt: string;
};

// ── Display maps ──────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  bug: "Bug fix",
  feature: "New feature",
  improvement: "Improvement",
  broken: "Broken",
};
const TYPE_TONES: Record<string, BadgeTone> = {
  bug: "orange",
  feature: "gold",
  improvement: "steel",
  broken: "red",
};
const TYPE_ICONS: Record<string, LucideIcon> = {
  bug: Bug,
  feature: Sparkles,
  improvement: Wrench,
  broken: AlertOctagon,
};
const TYPE_ORDER = ["bug", "broken", "feature", "improvement"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
};
const STATUS_ORDER = ["open", "in_progress", "done", "declined"];

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

export function FeatureRequestsBoard({
  items,
  currentPartnerId,
}: {
  items: FeatureRequestItem[];
  currentPartnerId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // Filters.
  const [areaFilter, setAreaFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (areaFilter !== "all" && it.areaTab !== areaFilter) return false;
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (mineOnly && it.createdById !== currentPartnerId) return false;
      if (q && !(`${it.title} ${it.description}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, areaFilter, typeFilter, mineOnly, query, currentPartnerId]);

  const byStatus = useMemo(() => {
    const map: Record<string, FeatureRequestItem[]> = { open: [], in_progress: [], done: [], declined: [] };
    for (const it of filtered) (map[it.status] ??= []).push(it);
    return map;
  }, [filtered]);

  const detail = detailId ? items.find((i) => i.id === detailId) ?? null : null;

  return (
    <div className="px-8 py-8">
      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="w-[260px]">
          <SearchInput
            placeholder="Search requests…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="w-[190px]">
          <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="all">All areas</option>
            {FEATURE_AREAS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-[150px]">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setMineOnly((m) => !m)}
          className={cn(
            "h-9 px-3 text-[13px] rounded-[var(--radius)] border transition-colors",
            mineOnly
              ? "bg-track-gold-dim/15 text-bone border-track-gold"
              : "bg-asphalt text-bone-dim border-graphite hover:border-bone-mute",
          )}
        >
          Mine
        </button>

        <div className="ml-auto">
          <Button variant="primary" size="md" onClick={() => setCreateOpen(true)}>
            <Plus size={14} strokeWidth={2} />
            New request
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Sparkles size={22} strokeWidth={1.5} />}
            title="No requests yet"
            hint="Spot a bug, want a new feature, or something feels off? File it here — anyone on the team can add one, and anyone can move it along."
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus size={13} strokeWidth={2} />
                New request
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUS_ORDER.map((status) => {
            const cards = byStatus[status] ?? [];
            return (
              <div key={status} className="flex flex-col gap-3">
                <div className="flex items-center justify-between px-1">
                  <Label>{STATUS_LABELS[status]}</Label>
                  <span className="text-[11px] tabular-nums text-bone-mute">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {cards.length === 0 ? (
                    <div className="text-[12px] text-bone-mute px-1 py-6 text-center border border-dashed border-graphite rounded-[var(--radius)]">
                      Nothing here
                    </div>
                  ) : (
                    cards.map((it) => (
                      <FeatureCard
                        key={it.id}
                        item={it}
                        onOpen={() => setDetailId(it.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
      {detail && <DetailModal item={detail} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────
function FeatureCard({ item, onOpen }: { item: FeatureRequestItem; onOpen: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const TypeIcon = TYPE_ICONS[item.type] ?? Sparkles;

  function move(status: string) {
    startTransition(async () => {
      try {
        await updateFeatureRequestStatus(item.id, status);
        router.refresh();
      } catch {
        /* swallow — the board re-fetches on next load */
      }
    });
  }

  return (
    <Card
      className={cn("p-4 flex flex-col gap-3 cursor-pointer hover:shadow-[var(--shadow-md)] transition-shadow", isPending && "opacity-60")}
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={TYPE_TONES[item.type] ?? "neutral"} className="gap-1">
          <TypeIcon size={11} strokeWidth={1.75} />
          {TYPE_LABELS[item.type] ?? item.type}
        </Badge>
        <span className="text-[11px] text-bone-mute shrink-0">{relativeAge(item.createdAt)}</span>
      </div>

      <div className="text-[14px] text-bone leading-snug font-medium">{item.title}</div>

      <div className="text-[11px] text-bone-dim">
        {item.areaTab === APP_WIDE_AREA ? (
          <span className="text-bone-mute">Whole app</span>
        ) : (
          areaDisplay(item.areaTab, item.areaSubTab)
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          {item.createdBy && <Avatar initials={item.createdBy.initials} size="sm" />}
          <span className="text-[11px] text-bone-mute truncate">{item.createdBy?.name ?? "—"}</span>
        </div>
        {/* Quick status move — stop the click from opening the detail modal. */}
        <div onClick={(e) => e.stopPropagation()} className="w-[120px] shrink-0">
          <Select
            value={item.status}
            onChange={(e) => move(e.target.value)}
            disabled={isPending}
            className="h-7 text-[12px] pr-7"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </Card>
  );
}

// ── Shared area picker (tab + dependent sub-tab) ──────────────────────
function AreaPicker({
  areaTab,
  areaSubTab,
  onTab,
  onSubTab,
}: {
  areaTab: string;
  areaSubTab: string;
  onTab: (v: string) => void;
  onSubTab: (v: string) => void;
}) {
  const subTabs = subTabsFor(areaTab);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Which part of the app?</Label>
        <Select
          value={areaTab}
          onChange={(e) => {
            onTab(e.target.value);
            onSubTab(""); // reset the dependent sub-tab when the tab changes
          }}
        >
          {FEATURE_AREAS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </Select>
      </div>

      {subTabs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Section (optional)</Label>
          <Select value={areaSubTab} onChange={(e) => onSubTab(e.target.value)}>
            <option value="">— Whole tab —</option>
            {subTabs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

// ── Type picker ───────────────────────────────────────────────────────
function TypeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Type</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {TYPE_ORDER.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </Select>
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────
function CreateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("bug");
  const [areaTab, setAreaTab] = useState(APP_WIDE_AREA);
  const [areaSubTab, setAreaSubTab] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!title.trim()) return setError("Give it a short title.");
    if (!description.trim()) return setError("Add a description so it's clear what's needed.");
    startTransition(async () => {
      try {
        await createFeatureRequest({ title, description, type, areaTab, areaSubTab: areaSubTab || null });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save the request");
      }
    });
  }

  return (
    <ModalShell onClose={onClose}>
      <div
        className="w-full max-w-[560px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <Plus size={14} strokeWidth={1.5} className="text-track-gold" />
            <Label>New feature request / fix</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pipeline board is slow to load with lots of deals"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's happening (or what you'd like), where you saw it, and what you expected. Paste a screenshot link if it helps."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TypeField value={type} onChange={setType} />
            <div />
          </div>

          <AreaPicker
            areaTab={areaTab}
            areaSubTab={areaSubTab}
            onTab={setAreaTab}
            onSubTab={setAreaSubTab}
          />

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="button" onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : "File it"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Detail / edit modal ───────────────────────────────────────────────
function DetailModal({ item, onClose }: { item: FeatureRequestItem; onClose: () => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [type, setType] = useState(item.type);
  const [areaTab, setAreaTab] = useState(item.areaTab);
  const [areaSubTab, setAreaSubTab] = useState(item.areaSubTab ?? "");
  const [status, setStatus] = useState(item.status);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const TypeIcon = TYPE_ICONS[item.type] ?? Sparkles;

  function saveEdits() {
    setError(null);
    if (!title.trim()) return setError("Give it a short title.");
    if (!description.trim()) return setError("Add a description.");
    startTransition(async () => {
      try {
        await updateFeatureRequest(item.id, {
          title,
          description,
          type,
          areaTab,
          areaSubTab: areaSubTab || null,
        });
        router.refresh();
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save changes");
      }
    });
  }

  function changeStatus(next: string) {
    setStatus(next);
    startTransition(async () => {
      try {
        await updateFeatureRequestStatus(item.id, next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't change status");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deleteFeatureRequest(item.id);
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete");
      }
    });
  }

  return (
    <ModalShell onClose={onClose} guard={editing}>
      <div
        className="w-full max-w-[560px] bg-asphalt rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <Badge tone={TYPE_TONES[item.type] ?? "neutral"} className="gap-1 shrink-0">
              <TypeIcon size={11} strokeWidth={1.75} />
              {TYPE_LABELS[item.type] ?? item.type}
            </Badge>
            <Label className="truncate">Request</Label>
          </div>
          <button onClick={onClose} className="text-bone-mute hover:text-bone">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {editing ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Description</Label>
                <Textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TypeField value={type} onChange={setType} />
                <div />
              </div>
              <AreaPicker areaTab={areaTab} areaSubTab={areaSubTab} onTab={setAreaTab} onSubTab={setAreaSubTab} />
            </>
          ) : (
            <>
              <div className="text-[16px] text-bone leading-snug font-medium">{item.title}</div>
              <div className="text-[13px] text-bone-dim whitespace-pre-wrap leading-relaxed">
                {item.description}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-bone-mute pt-1">
                <span>
                  Area:{" "}
                  <span className="text-bone-dim">
                    {item.areaTab === APP_WIDE_AREA ? "Whole app" : areaDisplay(item.areaTab, item.areaSubTab)}
                  </span>
                </span>
                <span>
                  Filed by <span className="text-bone-dim">{item.createdBy?.name ?? "—"}</span> ·{" "}
                  {relativeAge(item.createdAt)}
                </span>
              </div>
            </>
          )}

          {/* Status — always editable (anyone can move an item). */}
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <div className="w-[200px]">
                <Select value={status} onChange={(e) => changeStatus(e.target.value)} disabled={isPending}>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <ShieldAlert size={13} strokeWidth={1.5} className="text-flag-red mt-0.5 shrink-0" />
              <span className="text-[12px] text-bone-dim">{error}</span>
            </div>
          )}

          {confirmingDelete ? (
            <div className="flex flex-col gap-3 px-3 py-3 border border-flag-red/40 bg-flag-red/5 rounded-[var(--radius)]">
              <span className="text-[12px] text-bone-dim">
                Delete this request for good? For a real &ldquo;won&apos;t do&rdquo;, set it to Declined instead.
              </span>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={remove} disabled={isPending}>
                  <Trash2 size={13} strokeWidth={1.5} />
                  {isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)} disabled={isPending}>
                <Trash2 size={13} strokeWidth={1.5} className="text-flag-red" />
                Delete
              </Button>
              {editing ? (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={isPending}>
                    Cancel
                  </Button>
                  <Button variant="primary" size="sm" onClick={saveEdits} disabled={isPending}>
                    {isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
