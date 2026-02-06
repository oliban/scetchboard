import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import fs from "fs";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // Extract image ID (filename without extension)
  const dotIndex = filename.lastIndexOf(".");
  const imageId = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const ext = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : "";

  const db = getDb();
  const image = db
    .prepare("SELECT path FROM images WHERE id = ?")
    .get(imageId) as { path: string } | undefined;

  if (!image || !fs.existsSync(image.path)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(image.path);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  return new NextResponse(fileBuffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000",
    },
  });
}
