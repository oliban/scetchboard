import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import fs from "fs";
import path from "path";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const EXT_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const noteId = formData.get("noteId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  }

  // Validate file type
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: png, jpg, gif, webp" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 5MB" },
      { status: 400 }
    );
  }

  // Validate magic bytes to ensure file content matches claimed type
  const buffer = Buffer.from(await file.arrayBuffer());
  const isValidImage = (
    // PNG
    (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) ||
    // JPEG
    (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) ||
    // GIF
    (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) ||
    // WebP
    (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50)
  );
  if (!isValidImage) {
    return NextResponse.json({ error: 'Invalid image file' }, { status: 400 });
  }

  const db = getDb();

  // Verify note ownership
  const note = db
    .prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?")
    .get(noteId, user.id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const ext = EXT_MAP[file.type];
  const imageId = uuidv4();
  const filename = `${imageId}.${ext}`;
  const dirPath = path.join(
    process.env.DATABASE_URL ? path.dirname(process.env.DATABASE_URL) : "./data",
    "images",
    noteId,
    "uploaded"
  );
  const filePath = path.join(dirPath, filename);

  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Write file to disk (reuse buffer from magic bytes validation)
  fs.writeFileSync(filePath, buffer);

  // Insert record
  db.prepare(
    "INSERT INTO images (id, note_id, path) VALUES (?, ?, ?)"
  ).run(imageId, noteId, filePath);

  const url = `/api/images/${filename}`;

  return NextResponse.json({ id: imageId, url, filename }, { status: 201 });
}
