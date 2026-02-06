import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import fs from "fs";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const notes = db
    .prepare(
      `SELECT id, title, content, sketch_data, sketch_image,
              is_pinned, deleted_at, created_at, updated_at
       FROM notes
       WHERE user_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`
    )
    .all(user.id);

  return NextResponse.json(notes);
}

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // Get all trashed notes for this user
  const trashedNotes = db
    .prepare(
      "SELECT id FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL"
    )
    .all(user.id) as { id: string }[];

  const noteIds = trashedNotes.map((n) => n.id);
  if (noteIds.length === 0) {
    return NextResponse.json({ success: true, deleted: 0 });
  }

  // Get all images for trashed notes
  const placeholders = noteIds.map(() => "?").join(",");
  const images = db
    .prepare(`SELECT path FROM images WHERE note_id IN (${placeholders})`)
    .all(...noteIds) as { path: string }[];

  // Delete image files from disk
  for (const img of images) {
    try {
      if (fs.existsSync(img.path)) {
        fs.unlinkSync(img.path);
      }
    } catch {
      // Ignore file deletion errors
    }
  }

  // Delete records in transaction
  const deleteAll = db.transaction(() => {
    db.prepare(
      `DELETE FROM images WHERE note_id IN (${placeholders})`
    ).run(...noteIds);
    db.prepare(
      `DELETE FROM notes WHERE id IN (${placeholders})`
    ).run(...noteIds);
  });
  deleteAll();

  return NextResponse.json({ success: true, deleted: noteIds.length });
}
