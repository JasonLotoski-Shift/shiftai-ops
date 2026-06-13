"use client";

// useActionDraft — the shared client lifecycle for a two-step Quick Action's
// "save step 1" feature. Every text-body modal (draft email, proposal,
// discovery report, SOW, discovery prep/book-meeting, discovery questionnaire)
// wires this so the behavior is identical:
//
//   • loadDraft()   — on reopen (orange box), pull the saved ActionDraft content
//   • save()        — explicit "Save draft" button on the editable step
//   • autoSave()    — fired when the partner closes while on the editable step
//                     (click-out / Esc / Cancel) so work is parked, not lost
//   • clear()       — after PROCEEDING to step 2 the draft is consumed
//
// `content` is opaque JSON — each modal decides what to persist/restore (a body
// string, an inputs+body object, or a questions array). The hook only moves it.
//
// The returned object + its callbacks are STABLE across renders (useRef +
// useMemo), so modals can safely list `draft` in effect deps without the load
// effect re-firing every render and clobbering the partner's edits.

import { useCallback, useMemo, useRef, useState } from "react";
import { saveActionDraft, getActionDraft, clearActionDraft, type ActionDraftScope } from "@/lib/action-draft";

export function useActionDraft<TContent>(skill: string, scope: ActionDraftScope) {
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Latest content to persist — kept in a ref so autoSave (fired from a close
  // path) always sees the current value without re-binding the callback.
  const contentRef = useRef<TContent | null>(null);
  // savedId mirrored in a ref so clear() can be stable (no savedId dep).
  const savedIdRef = useRef<string | null>(null);
  // skill/scope are fixed per modal instance — keep them in refs so every
  // callback can be created once with empty deps.
  const skillRef = useRef(skill);
  skillRef.current = skill;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  /** Call on every edit so an unmount/close autoSave has the current content. */
  const track = useCallback((content: TContent) => {
    contentRef.current = content;
  }, []);

  const load = useCallback(async (): Promise<TContent | null> => {
    const row = await getActionDraft(scopeRef.current, skillRef.current);
    if (!row) return null;
    setSavedId(row.id);
    savedIdRef.current = row.id;
    return row.content as TContent;
  }, []);

  const save = useCallback(async (content: TContent): Promise<void> => {
    setBusy(true);
    try {
      const { id } = await saveActionDraft({ skill: skillRef.current, scope: scopeRef.current, content });
      setSavedId(id);
      savedIdRef.current = id;
      contentRef.current = content;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Best-effort park on close — swallows errors so closing never traps the
   *  partner. Only saves when there's something tracked to save. */
  const autoSave = useCallback(async (): Promise<void> => {
    const content = contentRef.current;
    if (content == null) return;
    try {
      const { id } = await saveActionDraft({ skill: skillRef.current, scope: scopeRef.current, content });
      setSavedId(id);
      savedIdRef.current = id;
    } catch {
      // ignore — a failed park is better than blocking the close
    }
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    const id = savedIdRef.current;
    contentRef.current = null;
    savedIdRef.current = null;
    setSavedId(null);
    if (!id) return;
    try {
      await clearActionDraft(id);
    } catch {
      // ignore — the deliverable already saved; a stale draft is harmless
    }
  }, []);

  // Stable object identity except when `busy` flips (which is exactly when a
  // consumer needs to re-render its "Saving…" label).
  return useMemo(() => ({ savedId, busy, track, load, save, autoSave, clear }), [savedId, busy, track, load, save, autoSave, clear]);
}
