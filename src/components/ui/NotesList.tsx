"use client";

import { Note } from "@/lib/types";
import { clsx } from "clsx";

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

interface NotesListProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
}

export default function NotesList({
  notes,
  selectedId,
  onSelect,
}: NotesListProps) {
  const pinned = notes.filter((n) => n.is_pinned);
  const unpinned = notes.filter((n) => !n.is_pinned);

  if (notes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm px-2 py-4 text-center">
        No notes yet
      </p>
    );
  }

  function renderItem(note: Note) {
    return (
      <button
        key={note.id}
        onClick={() => onSelect(note)}
        className={clsx(
          "w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer",
          selectedId === note.id
            ? "bg-primary/15 text-primary font-semibold"
            : "hover:bg-muted"
        )}
      >
        <p className="text-sm font-medium truncate">
          {note.title || "Untitled"}
        </p>
        <p className="text-xs text-muted-foreground">
          {relativeTime(note.updated_at)}
        </p>
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {pinned.length > 0 && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
            Pinned
          </p>
          {pinned.map(renderItem)}
        </div>
      )}
      {unpinned.length > 0 && (
        <div>
          {pinned.length > 0 && (
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1">
              Notes
            </p>
          )}
          {unpinned.map(renderItem)}
        </div>
      )}
    </div>
  );
}
