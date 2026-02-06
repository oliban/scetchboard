"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutosaveOptions {
  noteId: string | null;
  content: string;
  sketchData: string | null;
  sketchImage: string | null;
  delay?: number;
}

export function useAutosave({
  noteId,
  content,
  sketchData,
  sketchImage,
  delay = 1500,
}: UseAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastSavedRef = useRef({ content: "", sketchData: "", sketchImage: "" });
  const noteIdRef = useRef(noteId);

  // Track note switches
  useEffect(() => {
    noteIdRef.current = noteId;
    lastSavedRef.current = { content, sketchData: sketchData ?? "", sketchImage: sketchImage ?? "" };
    setStatus("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  const save = useCallback(async () => {
    const id = noteIdRef.current;
    if (!id) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("saving");
    try {
      const body: Record<string, string> = { content };
      if (sketchData !== null) body.sketch_data = sketchData;
      if (sketchImage !== null) body.sketch_image = sketchImage;

      const res = await fetch(`/api/notes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (noteIdRef.current !== id) return;

      if (res.ok) {
        lastSavedRef.current = { content, sketchData: sketchData ?? "", sketchImage: sketchImage ?? "" };
        setStatus("saved");
      } else {
        setStatus("error");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (noteIdRef.current === id) setStatus("error");
    }
  }, [content, sketchData, sketchImage]);

  useEffect(() => {
    if (!noteId) return;

    const changed =
      content !== lastSavedRef.current.content ||
      (sketchData ?? "") !== lastSavedRef.current.sketchData ||
      (sketchImage ?? "") !== lastSavedRef.current.sketchImage;

    if (!changed) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [noteId, content, sketchData, sketchImage, delay, save]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return status;
}
