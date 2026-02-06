"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/lib/use-theme";
import { Note } from "@/lib/types";
import NotesList from "@/components/ui/NotesList";
import SearchInput from "@/components/ui/SearchInput";

interface SidebarProps {
  notes: Note[];
  selectedId: string | null;
  onSelect: (note: Note) => void;
  onNotesChange: () => void;
}

export default function Sidebar({
  notes,
  selectedId,
  onSelect,
  onNotesChange,
}: SidebarProps) {
  const router = useRouter();
  const { resolved, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Note[] | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/trash")
      .then((r) => r.json())
      .then((data: Note[]) => setTrashCount(data.length))
      .catch(() => {});
  }, [notes]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/notes?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    }
  }, []);

  async function handleNewNote() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/notes", { method: "POST" });
      const note = await res.json();
      onNotesChange();
      onSelect(note);
      setMobileOpen(false);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function toggleTheme() {
    setTheme(resolved === "light" ? "dark" : "light");
  }

  const themeLabel = resolved === "light" ? "Light" : "Dark";

  const displayedNotes = searchResults ?? notes;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold mb-3">SketchNotes</h1>
        <button
          onClick={handleNewNote}
          disabled={creating}
          className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
        >
          {creating ? "Creating..." : "+ New Note"}
        </button>
      </div>

      <div className="p-4 pb-2">
        <SearchInput onSearch={handleSearch} />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <NotesList
          notes={displayedNotes}
          selectedId={selectedId}
          onSelect={(note) => {
            onSelect(note);
            setMobileOpen(false);
          }}
        />
      </div>

      <div className="border-t border-border p-4 space-y-1 pb-6">
        <Link
          href="/trash"
          className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-lg px-2 py-2 cursor-pointer"
        >
          <span>Trash</span>
          {trashCount > 0 && (
            <span className="bg-muted text-xs px-2 py-0.5 rounded-full">
              {trashCount}
            </span>
          )}
        </Link>

        <button
          onClick={toggleTheme}
          className="w-full text-left text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-lg px-2 py-2 cursor-pointer"
        >
          Theme: {themeLabel}
        </button>

        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-lg px-2 py-2 cursor-pointer"
        >
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-4 left-4 z-50 bg-card border border-border rounded-lg p-2 cursor-pointer"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {mobileOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40
          w-72 bg-card border-r border-border
          transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
