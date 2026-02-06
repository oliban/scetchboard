import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

function extractTitle(content: string): string {
  if (!content) return "";
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Check for markdown heading
    const headingMatch = trimmed.match(/^#+\s+(.+)/);
    if (headingMatch) return headingMatch[1].trim();
    // Use first non-empty line
    return trimmed.slice(0, 100);
  }
  return "";
}

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
    .prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?")
    .get(id, user.id) as Record<string, unknown> | undefined;

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  return NextResponse.json(note);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  // Verify ownership
  const existing = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const body = await request.json();
  const { content, sketch_data, sketch_image } = body;

  // Auto-generate title from content
  const title =
    content !== undefined ? extractTitle(content) : undefined;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (content !== undefined) {
    updates.push("content = ?");
    values.push(content);
  }
  if (title !== undefined) {
    updates.push("title = ?");
    values.push(title);
  }
  if (sketch_data !== undefined) {
    updates.push("sketch_data = ?");
    values.push(sketch_data);
  }
  if (sketch_image !== undefined) {
    updates.push("sketch_image = ?");
    values.push(sketch_image);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.push("updated_at = datetime('now')");
  values.push(id, user.id);

  db.prepare(
    `UPDATE notes SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`
  ).run(...values);

  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(id);
  return NextResponse.json(note);
}

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

  // Verify ownership
  const existing = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?")
    .get(id, user.id);
  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Soft delete
  db.prepare(
    "UPDATE notes SET deleted_at = datetime('now') WHERE id = ?"
  ).run(id);

  return NextResponse.json({ success: true });
}
