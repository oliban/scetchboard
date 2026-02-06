"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import ResizableWorkspace from "@/components/layout/ResizableWorkspace";
import { Note } from "@/lib/types";

export default function AppPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      const data = await res.json();
      setNotes(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSelect = useCallback(async (note: Note) => {
    // Fetch full note content
    try {
      const res = await fetch(`/api/notes/${note.id}`);
      const full = await res.json();
      setSelectedNote(full);
    } catch {
      setSelectedNote(note);
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        notes={notes}
        selectedId={selectedNote?.id ?? null}
        onSelect={handleSelect}
        onNotesChange={fetchNotes}
      />
      <main className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedNote ? (
          <ResizableWorkspace
            key={selectedNote.id}
            note={selectedNote}
            onNoteUpdated={fetchNotes}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">
                Select a note or create a new one
              </p>
              <p className="text-sm mt-1">
                Your notes will appear in the sidebar
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
