import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import fs from "fs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const existing = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL")
    .get(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Delete associated images from disk
  const images = db
    .prepare("SELECT path FROM images WHERE note_id = ?")
    .all(id) as { path: string }[];

  for (const img of images) {
    try {
      if (fs.existsSync(img.path)) {
        fs.unlinkSync(img.path);
      }
    } catch {
      // Ignore file deletion errors
    }
  }

  // Delete images records and note
  const deleteAll = db.transaction(() => {
    db.prepare("DELETE FROM images WHERE note_id = ?").run(id);
    db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  });
  deleteAll();

  return NextResponse.json({ success: true });
}
