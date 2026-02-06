import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function POST(
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
    .prepare("SELECT id, is_pinned FROM notes WHERE id = ? AND user_id = ?")
    .get(id, user.id) as { id: string; is_pinned: number } | undefined;

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const newPinned = note.is_pinned ? 0 : 1;
  db.prepare("UPDATE notes SET is_pinned = ? WHERE id = ?").run(newPinned, id);

  return NextResponse.json({ is_pinned: newPinned });
}
