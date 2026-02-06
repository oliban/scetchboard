import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const q = request.nextUrl.searchParams.get("q");

  if (q && q.trim()) {
    // FTS5 search
    const notes = db
      .prepare(
        `SELECT n.id, n.title, n.content, n.sketch_data, n.sketch_image,
                n.is_pinned, n.created_at, n.updated_at
         FROM notes n
         JOIN notes_fts fts ON n.rowid = fts.rowid
         WHERE fts.notes_fts MATCH ? AND n.user_id = ? AND n.deleted_at IS NULL
         ORDER BY n.is_pinned DESC, n.updated_at DESC`
      )
      .all(q.trim(), user.id);
    return NextResponse.json(notes);
  }

  const notes = db
    .prepare(
      `SELECT id, title, content, sketch_data, sketch_image,
              is_pinned, created_at, updated_at
       FROM notes
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY is_pinned DESC, updated_at DESC`
    )
    .all(user.id);

  return NextResponse.json(notes);
}

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const id = uuidv4();

  db.prepare(
    "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
  ).run(id, user.id, "", "");

  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  return NextResponse.json(note, { status: 201 });
}
