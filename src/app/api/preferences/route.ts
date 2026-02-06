import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const prefs = db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .get(user.id);

  return NextResponse.json(prefs || { user_id: user.id, panel_sizes: null, theme: "system" });
}

export async function PUT(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { panel_sizes, theme } = body;

  const db = getDb();
  db.prepare(
    `INSERT INTO user_preferences (user_id, panel_sizes, theme, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       panel_sizes = COALESCE(excluded.panel_sizes, panel_sizes),
       theme = COALESCE(excluded.theme, theme),
       updated_at = datetime('now')`
  ).run(user.id, panel_sizes ?? null, theme ?? null);

  const prefs = db
    .prepare("SELECT * FROM user_preferences WHERE user_id = ?")
    .get(user.id);

  return NextResponse.json(prefs);
}
