"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Note } from "@/lib/types";

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

export default function TrashPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrash = useCallback(async () => {
    try {
      const res = await fetch("/api/trash");
      const data = await res.json();
      setNotes(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  async function handleRestore(id: string) {
    await fetch(`/api/notes/${id}/restore`, { method: "POST" });
    fetchTrash();
  }

  async function handlePermanentDelete(id: string) {
    await fetch(`/api/notes/${id}/permanent`, { method: "DELETE" });
    fetchTrash();
  }

  async function handleEmptyTrash() {
    await fetch("/api/trash", { method: "DELETE" });
    fetchTrash();
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 block"
          >
            &larr; Back to notes
          </button>
          <h1 className="text-2xl font-bold">Trash</h1>
        </div>
        {notes.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="text-sm text-destructive hover:underline"
          >
            Empty trash
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : notes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Trash is empty</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {note.title || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Deleted {note.deleted_at ? relativeTime(note.deleted_at) : ""}
                </p>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button
                  onClick={() => handleRestore(note.id)}
                  className="text-xs text-primary hover:underline"
                >
                  Restore
                </button>
                <button
                  onClick={() => handlePermanentDelete(note.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
