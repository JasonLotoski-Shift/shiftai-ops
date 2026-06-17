"use client";

import { createContext, useContext } from "react";

// One team note on an architecture-map card. This is the shape the server
// actions return and the panel renders. It lives here (not in the "use server"
// actions file, which may only export async functions); the actions import it
// as a type, so no client code is pulled into the server bundle.
export type ArchitectureNoteDTO = {
  id: string;
  nodeId: string;
  body: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  createdAt: string; // ISO
};

export interface NotesApi {
  /** Notes grouped by node id (oldest first). */
  notesByNode: Record<string, ArchitectureNoteDTO[]>;
  addNote: (nodeId: string, body: string) => Promise<void>;
  deleteNote: (nodeId: string, id: string) => Promise<void>;
  /** A write is in flight — disables the composer + delete buttons. */
  busy: boolean;
}

export const NotesContext = createContext<NotesApi>({
  notesByNode: {},
  addNote: async () => {},
  deleteNote: async () => {},
  busy: false,
});

export const useNotes = () => useContext(NotesContext);

// Compact relative time — "just now", "5m ago", "3h ago", "2d ago", else a date.
export function relTime(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
