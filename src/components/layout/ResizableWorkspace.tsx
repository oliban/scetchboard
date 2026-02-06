"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
} from "react-resizable-panels";
import { useTheme } from "@/lib/use-theme";
import { useAutosave } from "@/lib/use-autosave";
import { Note } from "@/lib/types";
import MarkdownEditor from "@/components/ui/MarkdownEditor";
import MarkdownPreview from "@/components/ui/MarkdownPreview";
import SketchPad from "@/components/ui/SketchPad";

type DesktopTab = "edit" | "preview";

interface ResizableWorkspaceProps {
  note: Note;
  onNoteUpdated: () => void;
}

export default function ResizableWorkspace({
  note,
  onNoteUpdated,
}: ResizableWorkspaceProps) {
  const { resolved } = useTheme();
  const [content, setContent] = useState(note.content);
  const [sketchData, setSketchData] = useState<string | null>(
    note.sketch_data
  );
  const [sketchImage, setSketchImage] = useState<string | null>(
    note.sketch_image
  );
  const prevNoteIdRef = useRef(note.id);
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("edit");

  const outerLayout = useDefaultLayout({ id: "workspace-outer" });

  // When note changes, reset local state
  useEffect(() => {
    if (prevNoteIdRef.current !== note.id) {
      setContent(note.content);
      setSketchData(note.sketch_data);
      setSketchImage(note.sketch_image);
      prevNoteIdRef.current = note.id;
    }
  }, [note]);

  const saveStatus = useAutosave({
    noteId: note.id,
    content,
    sketchData,
    sketchImage,
  });

  // Trigger sidebar refresh when save completes
  useEffect(() => {
    if (saveStatus === "saved") {
      onNoteUpdated();
    }
  }, [saveStatus, onNoteUpdated]);

  const handleSketchChange = useCallback(
    (data: string, imageDataUrl: string) => {
      setSketchData(data);
      setSketchImage(imageDataUrl);
    },
    []
  );

  const statusText =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Error saving"
          : "";

  return (
    <div className="flex flex-col h-full w-full">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-card text-sm text-muted-foreground shrink-0">
        <span className="truncate font-medium" title={note.title || "Untitled"}>
          {note.title || "Untitled"}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs">{statusText}</span>
          <button
            onClick={() => {
              window.open(`/api/notes/${note.id}/export`, "_blank");
            }}
            className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors cursor-pointer"
            title="Export as PDF"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Desktop: resizable panels */}
      <div className="flex-1 overflow-hidden hidden md:block">
        <Group
          orientation="horizontal"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
          className="h-full"
        >
          <Panel id="notepad" defaultSize="50%" minSize="20%">
            <div className="flex flex-col h-full">
              <div className="flex border-b border-border shrink-0">
                {(["edit", "preview"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDesktopTab(t)}
                    className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      desktopTab === t
                        ? "text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t === "edit" ? "Edit" : "View"}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {desktopTab === "edit" && (
                  <MarkdownEditor content={content} onChange={setContent} />
                )}
                {desktopTab === "preview" && (
                  <MarkdownPreview content={content} onChange={setContent} />
                )}
              </div>
            </div>
          </Panel>
          <Separator className="w-1 bg-border hover:bg-primary/50 transition-colors" />
          <Panel id="sketchpad" defaultSize="50%" minSize="15%">
            <SketchPad
              sketchData={sketchData}
              onChange={handleSketchChange}
              isDarkMode={resolved === "dark"}
            />
          </Panel>
        </Group>
      </div>

      {/* Mobile: stacked layout */}
      <div className="flex-1 overflow-y-auto md:hidden">
        <MobileTabs
          content={content}
          onContentChange={setContent}
          sketchData={sketchData}
          onSketchChange={handleSketchChange}
          isDarkMode={resolved === "dark"}
        />
      </div>
    </div>
  );
}

function MobileTabs({
  content,
  onContentChange,
  sketchData,
  onSketchChange,
  isDarkMode,
}: {
  content: string;
  onContentChange: (c: string) => void;
  sketchData: string | null;
  onSketchChange: (data: string, img: string) => void;
  isDarkMode: boolean;
}) {
  const [tab, setTab] = useState<"edit" | "preview" | "sketch">("edit");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border shrink-0">
        {(["edit", "preview", "sketch"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
              tab === t
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "edit" ? "Edit" : t === "preview" ? "Preview" : "Sketch"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-[300px]">
        {tab === "edit" && (
          <MarkdownEditor content={content} onChange={onContentChange} />
        )}
        {tab === "preview" && <MarkdownPreview content={content} onChange={onContentChange} />}
        {tab === "sketch" && (
          <SketchPad
            sketchData={sketchData}
            onChange={onSketchChange}
            isDarkMode={isDarkMode}
          />
        )}
      </div>
    </div>
  );
}
