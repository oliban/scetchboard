/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

// Must set env before any imports that read them at module level
process.env.JWT_SECRET = "test-secret-for-tests";
process.env.DATABASE_URL = "./data/test-images.db";

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual("@/lib/auth");
  return { ...actual, getAuthUser: vi.fn() };
});

import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

const mockedGetAuthUser = vi.mocked(getAuthUser);

// Test user data
const TEST_USER = { id: "user-test-images", email: "test@images.com" };
const OTHER_USER = { id: "user-other-images", email: "other@images.com" };

// Minimal valid PNG buffer (8-byte PNG signature + minimal IHDR + IEND chunks)
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length + type
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 pixel
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, // bit depth, color type, crc start
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
  0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, // compressed data
  0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc, // checksum
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
  0x44, 0xae, 0x42, 0x60, 0x82,                     // IEND crc
]);

// Minimal valid JPEG buffer
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

let testNoteId: string;
let otherNoteId: string;

beforeAll(() => {
  const db = getDb();

  // Create test users
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(TEST_USER.id, TEST_USER.email, "hash-placeholder");
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(OTHER_USER.id, OTHER_USER.email, "hash-placeholder");

  // Create test notes
  testNoteId = uuidv4();
  otherNoteId = uuidv4();
  db.prepare(
    "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
  ).run(testNoteId, TEST_USER.id, "Test Note", "content");
  db.prepare(
    "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
  ).run(otherNoteId, OTHER_USER.id, "Other Note", "other content");
});

afterAll(() => {
  // Clean up test DB files
  const dbFiles = [
    "./data/test-images.db",
    "./data/test-images.db-wal",
    "./data/test-images.db-shm",
  ];
  for (const f of dbFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // Clean up uploaded test images
  const imagesDir = path.join("./data", "images");
  if (fs.existsSync(imagesDir)) {
    fs.rmSync(imagesDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  mockedGetAuthUser.mockReset();
});

// Create a mock File object that works in jsdom (jsdom's File doesn't support arrayBuffer())
function createMockFile(buffer: Buffer, name: string, type: string) {
  return {
    name,
    type,
    size: buffer.length,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

// Create a request with a properly mocked formData() method
function createUploadRequest(
  file: { buffer: Buffer; type: string; name: string } | null,
  noteId?: string
): Request {
  const mockFile = file ? createMockFile(file.buffer, file.name, file.type) : null;
  const fields = new Map<string, any>();
  if (mockFile) fields.set("file", mockFile);
  if (noteId) fields.set("noteId", noteId);

  return {
    formData: async () => ({
      get: (key: string) => fields.get(key) ?? null,
    }),
  } as unknown as Request;
}

// Dynamic imports to get fresh route handlers
async function getImageUploadRoute() {
  return await import("./route");
}

async function getImageServeRoute() {
  return await import("./[filename]/route");
}

describe("Image Upload (POST /api/images)", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthUser.mockResolvedValue(null);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: VALID_PNG_BUFFER, type: "image/png", name: "test.png" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("successful upload with valid PNG", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: VALID_PNG_BUFFER, type: "image/png", name: "test.png" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.url).toMatch(/^\/api\/images\/.+\.png$/);
    expect(body.filename).toMatch(/\.png$/);
  });

  it("successful upload with valid JPEG", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: VALID_JPEG_BUFFER, type: "image/jpeg", name: "test.jpg" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.filename).toMatch(/\.jpg$/);
  });

  it("rejects files that aren't images (wrong Content-Type)", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: Buffer.from("not an image"), type: "text/plain", name: "test.txt" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file type/);
  });

  it("rejects files with spoofed Content-Type but wrong magic bytes", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const fakeBuffer = Buffer.from("This is not a PNG file at all");
    const req = createUploadRequest(
      { buffer: fakeBuffer, type: "image/png", name: "fake.png" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid image file");
  });

  it("rejects files larger than 5MB", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    // Create a buffer just over 5MB with valid PNG magic bytes
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    VALID_PNG_BUFFER.copy(largeBuffer, 0, 0, VALID_PNG_BUFFER.length);
    const req = createUploadRequest(
      { buffer: largeBuffer, type: "image/png", name: "large.png" },
      testNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/File too large/);
  });

  it("requires noteId field", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: VALID_PNG_BUFFER, type: "image/png", name: "test.png" }
      // no noteId
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("noteId is required");
  });

  it("validates note ownership (can't upload to another user's note)", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(
      { buffer: VALID_PNG_BUFFER, type: "image/png", name: "test.png" },
      otherNoteId
    );
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Note not found");
  });

  it("returns 400 when no file provided", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { POST } = await getImageUploadRoute();
    const req = createUploadRequest(null, testNoteId);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No file provided");
  });
});

describe("Image Serving (GET /api/images/[filename])", () => {
  let uploadedFilename: string;

  beforeAll(async () => {
    // Directly insert an image record and file to avoid FormData issues
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const imageId = uuidv4();
    uploadedFilename = `${imageId}.png`;
    const dirPath = path.join("./data", "images", testNoteId, "uploaded");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const filePath = path.join(dirPath, uploadedFilename);
    fs.writeFileSync(filePath, VALID_PNG_BUFFER);
    const db = getDb();
    db.prepare("INSERT INTO images (id, note_id, path) VALUES (?, ?, ?)").run(
      imageId,
      testNoteId,
      filePath
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockedGetAuthUser.mockResolvedValue(null);
    const { GET } = await getImageServeRoute();
    const req = new Request(
      `http://localhost:3000/api/images/${uploadedFilename}`
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ filename: uploadedFilename }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent image", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { GET } = await getImageServeRoute();
    const fakeFilename = "nonexistent-id.png";
    const req = new Request(
      `http://localhost:3000/api/images/${fakeFilename}`
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ filename: fakeFilename }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for image belonging to another user's note", async () => {
    mockedGetAuthUser.mockResolvedValue(OTHER_USER);
    const { GET } = await getImageServeRoute();
    const req = new Request(
      `http://localhost:3000/api/images/${uploadedFilename}`
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ filename: uploadedFilename }),
    });
    expect(res.status).toBe(404);
  });

  it("serves image with correct content type for owner", async () => {
    mockedGetAuthUser.mockResolvedValue(TEST_USER);
    const { GET } = await getImageServeRoute();
    const req = new Request(
      `http://localhost:3000/api/images/${uploadedFilename}`
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ filename: uploadedFilename }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000"
    );
  });
});

describe("Preferences API", () => {
  async function getPreferencesRoute() {
    return await import("../preferences/route");
  }

  beforeAll(() => {
    // Clean up preferences from any previous test runs
    const db = getDb();
    db.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(TEST_USER.id);
  });

  beforeEach(() => {
    mockedGetAuthUser.mockReset();
  });

  describe("GET /api/preferences", () => {
    it("returns 401 when not authenticated", async () => {
      mockedGetAuthUser.mockResolvedValue(null);
      const { GET } = await getPreferencesRoute();
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns default preferences when none set", async () => {
      mockedGetAuthUser.mockResolvedValue(TEST_USER);
      const { GET } = await getPreferencesRoute();
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user_id).toBe(TEST_USER.id);
      expect(body.panel_sizes).toBeNull();
      expect(body.theme).toBe("system");
    });
  });

  describe("PUT /api/preferences", () => {
    it("returns 401 when not authenticated", async () => {
      mockedGetAuthUser.mockResolvedValue(null);
      const { PUT } = await getPreferencesRoute();
      const req = new Request("http://localhost:3000/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "dark" }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(401);
    });

    it("saves preferences successfully", async () => {
      mockedGetAuthUser.mockResolvedValue(TEST_USER);
      const { PUT } = await getPreferencesRoute();
      const req = new Request("http://localhost:3000/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "dark", panel_sizes: "30,70" }),
      });
      const res = await PUT(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.theme).toBe("dark");
      expect(body.panel_sizes).toBe("30,70");
    });

    it("GET returns saved preferences after PUT", async () => {
      mockedGetAuthUser.mockResolvedValue(TEST_USER);
      const { GET } = await getPreferencesRoute();
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.theme).toBe("dark");
      expect(body.panel_sizes).toBe("30,70");
    });

    it("updates only provided fields (COALESCE behavior)", async () => {
      mockedGetAuthUser.mockResolvedValue(TEST_USER);
      const { PUT, GET } = await getPreferencesRoute();
      // Only update theme, panel_sizes should stay
      const req = new Request("http://localhost:3000/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: "light" }),
      });
      const putRes = await PUT(req);
      expect(putRes.status).toBe(200);

      const getRes = await GET();
      const body = await getRes.json();
      expect(body.theme).toBe("light");
      expect(body.panel_sizes).toBe("30,70"); // unchanged
    });
  });
});
