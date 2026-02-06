import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { NoteDocument } from "@/lib/pdf-export";
import React from "react";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const note = db
    .prepare("SELECT id, title, content, sketch_image FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .get(id, user.id) as
    | {
        id: string;
        title: string;
        content: string;
        sketch_image: string | null;
      }
    | undefined;

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const doc = React.createElement(NoteDocument, {
    title: note.title || "Untitled",
    content: note.content || "",
    sketchImage: note.sketch_image,
  });

  const buffer = await renderToBuffer(doc);

  const filename = (note.title || "note").replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "note";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
