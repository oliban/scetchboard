import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import fs from "fs";

// Mock getAuthUser from auth module
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual("@/lib/auth");
  return {
    ...actual,
    getAuthUser: vi.fn(),
  };
});

const TEST_USER_ID = "test-user-id";
const TEST_USER_EMAIL = "test@test.com";
const OTHER_USER_ID = "other-user-id";
const OTHER_USER_EMAIL = "other@test.com";

const TEST_DB_PATH = "./data/test-notes.db";

function mockAuthenticated() {
  vi.mocked(getAuthUser).mockResolvedValue({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
  });
}

function mockUnauthenticated() {
  vi.mocked(getAuthUser).mockResolvedValue(null);
}

// Helper to build URL
function url(path: string) {
  return `http://localhost:3000${path}`;
}

// Helper to create params promise (Next.js 15 style)
function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// Dynamic imports (to avoid module-level side effects)
async function importNotesRoute() {
  return await import("@/app/api/notes/route");
}
async function importNoteIdRoute() {
  return await import("@/app/api/notes/[id]/route");
}
async function importPinRoute() {
  return await import("@/app/api/notes/[id]/pin/route");
}
async function importPermanentRoute() {
  return await import("@/app/api/notes/[id]/permanent/route");
}
async function importRestoreRoute() {
  return await import("@/app/api/notes/[id]/restore/route");
}
async function importTrashRoute() {
  return await import("@/app/api/trash/route");
}

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-tests";
  process.env.DATABASE_URL = TEST_DB_PATH;

  // Initialize DB with test users
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(TEST_USER_ID, TEST_USER_EMAIL, "hash1");
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(OTHER_USER_ID, OTHER_USER_EMAIL, "hash2");
});

beforeEach(() => {
  vi.mocked(getAuthUser).mockReset();
  // Clean notes table between tests
  const db = getDb();
  db.prepare("DELETE FROM images").run();
  db.prepare("DELETE FROM notes").run();
});

afterAll(() => {
  // Close DB and remove test file
  const db = getDb();
  db.close();
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Also remove WAL/SHM files
    if (fs.existsSync(TEST_DB_PATH + "-wal")) {
      fs.unlinkSync(TEST_DB_PATH + "-wal");
    }
    if (fs.existsSync(TEST_DB_PATH + "-shm")) {
      fs.unlinkSync(TEST_DB_PATH + "-shm");
    }
  } catch {
    // Ignore cleanup errors
  }
});

// ==================== AUTHENTICATION ====================

describe("Authentication - all endpoints return 401 when not authenticated", () => {
  beforeEach(() => {
    mockUnauthenticated();
  });

  it("GET /api/notes returns 401", async () => {
    const { GET } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"));
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/notes returns 401", async () => {
    const { POST } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"), {
      method: "POST",
      body: JSON.stringify({ content: "test" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/notes/[id] returns 401", async () => {
    const { GET } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/some-id"));
    const res = await GET(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("PUT /api/notes/[id] returns 401", async () => {
    const { PUT } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/some-id"), {
      method: "PUT",
      body: JSON.stringify({ content: "test" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/notes/[id] returns 401", async () => {
    const { DELETE } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/some-id"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("POST /api/notes/[id]/pin returns 401", async () => {
    const { POST } = await importPinRoute();
    const req = new NextRequest(url("/api/notes/some-id/pin"), { method: "POST" });
    const res = await POST(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("POST /api/notes/[id]/restore returns 401", async () => {
    const { POST } = await importRestoreRoute();
    const req = new NextRequest(url("/api/notes/some-id/restore"), { method: "POST" });
    const res = await POST(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("DELETE /api/notes/[id]/permanent returns 401", async () => {
    const { DELETE } = await importPermanentRoute();
    const req = new NextRequest(url("/api/notes/some-id/permanent"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("some-id"));
    expect(res.status).toBe(401);
  });

  it("GET /api/trash returns 401", async () => {
    const { GET } = await importTrashRoute();
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("DELETE /api/trash returns 401", async () => {
    const { DELETE } = await importTrashRoute();
    const res = await DELETE();
    expect(res.status).toBe(401);
  });
});

// ==================== NOTES CRUD ====================

describe("Notes CRUD", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("POST /api/notes creates a note and returns it with 201", async () => {
    const { POST } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"), {
      method: "POST",
      body: JSON.stringify({ content: "Hello world" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.content).toBe("Hello world");
    expect(body.created_at).toBeDefined();
  });

  it("POST /api/notes creates an empty note when no body", async () => {
    const { POST } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"), { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.content).toBe("");
  });

  it("GET /api/notes lists only the authenticated user's notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "My Note", "content1");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n2", OTHER_USER_ID, "Other Note", "content2");

    const { GET } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const notes = await res.json();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("n1");
  });

  it("GET /api/notes/[id] returns a specific note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "My Note", "content1");

    const { GET } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"));
    const res = await GET(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const note = await res.json();
    expect(note.id).toBe("n1");
    expect(note.content).toBe("content1");
  });

  it("GET /api/notes/[id] returns 404 for another user's note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n2", OTHER_USER_ID, "Other Note", "content2");

    const { GET } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n2"));
    const res = await GET(req, makeParams("n2"));
    expect(res.status).toBe(404);
  });

  it("PUT /api/notes/[id] updates content and title", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Old Title", "old content");

    const { PUT } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"), {
      method: "PUT",
      body: JSON.stringify({ content: "new content" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const note = await res.json();
    expect(note.content).toBe("new content");
  });

  it("PUT /api/notes/[id] auto-generates title from first line of content", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "", "");

    const { PUT } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"), {
      method: "PUT",
      body: JSON.stringify({ content: "# My Heading\nSome text" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const note = await res.json();
    expect(note.title).toBe("My Heading");
  });

  it("PUT /api/notes/[id] auto-generates title from first non-empty line when no heading", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "", "");

    const { PUT } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"), {
      method: "PUT",
      body: JSON.stringify({ content: "\n\nFirst line here\nSecond line" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const note = await res.json();
    expect(note.title).toBe("First line here");
  });

  it("DELETE /api/notes/[id] soft-deletes (sets deleted_at)", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Title", "content");

    const { DELETE } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it has deleted_at set
    const row = db.prepare("SELECT deleted_at FROM notes WHERE id = ?").get("n1") as { deleted_at: string };
    expect(row.deleted_at).not.toBeNull();
  });

  it("Soft-deleted notes don't appear in GET /api/notes list", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Deleted", "deleted content");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n2", TEST_USER_ID, "Active", "active content");

    const { GET } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes"));
    const res = await GET(req);
    const notes = await res.json();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("n2");
  });

  it("GET /api/notes/[id] returns 404 for soft-deleted notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Deleted", "content");

    const { GET } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"));
    const res = await GET(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });

  it("PUT /api/notes/[id] returns 404 for soft-deleted notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Deleted", "content");

    const { PUT } = await importNoteIdRoute();
    const req = new NextRequest(url("/api/notes/n1"), {
      method: "PUT",
      body: JSON.stringify({ content: "updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });
});

// ==================== SEARCH (FTS) ====================

describe("Search", () => {
  beforeEach(() => {
    mockAuthenticated();
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("s1", TEST_USER_ID, "Meeting Notes", "Discussion about project alpha");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("s2", TEST_USER_ID, "Shopping List", "Buy milk and eggs");
  });

  it("GET /api/notes?q=term returns matching notes via FTS", async () => {
    const { GET } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes?q=alpha"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const notes = await res.json();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("s1");
  });

  it("GET /api/notes?q=term returns empty array for no matches", async () => {
    const { GET } = await importNotesRoute();
    const req = new NextRequest(url("/api/notes?q=xyznonexistent"));
    const res = await GET(req);
    expect(res.status).toBe(200);
    const notes = await res.json();
    expect(notes).toHaveLength(0);
  });

  it("FTS special characters are sanitized (no crash on *, OR, NOT)", async () => {
    const { GET } = await importNotesRoute();

    // Test with asterisk
    const req1 = new NextRequest(url("/api/notes?q=*"));
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);

    // Test with OR
    const req2 = new NextRequest(url("/api/notes?q=OR"));
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);

    // Test with NOT
    const req3 = new NextRequest(url("/api/notes?q=NOT"));
    const res3 = await GET(req3);
    expect(res3.status).toBe(200);

    // Test with parentheses and quotes
    const req4 = new NextRequest(url('/api/notes?q="test"(foo)'));
    const res4 = await GET(req4);
    expect(res4.status).toBe(200);
  });
});

// ==================== PAYLOAD LIMITS ====================

describe("Payload limits", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("POST /api/notes with content > 500KB returns 413", async () => {
    const { POST } = await importNotesRoute();
    const largeContent = "x".repeat(500_001);
    const req = new NextRequest(url("/api/notes"), {
      method: "POST",
      body: JSON.stringify({ content: largeContent }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("PUT /api/notes/[id] with content > 500KB returns 413", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Title", "content");

    const { PUT } = await importNoteIdRoute();
    const largeContent = "x".repeat(500_001);
    const req = new NextRequest(url("/api/notes/n1"), {
      method: "PUT",
      body: JSON.stringify({ content: largeContent }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await PUT(req, makeParams("n1"));
    expect(res.status).toBe(413);
  });
});

// ==================== PIN ====================

describe("Pin", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("POST /api/notes/[id]/pin toggles pin status from 0 to 1", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Title", "content");

    const { POST } = await importPinRoute();
    const req = new NextRequest(url("/api/notes/n1/pin"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_pinned).toBe(1);
  });

  it("POST /api/notes/[id]/pin toggles pin status from 1 to 0", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, is_pinned) VALUES (?, ?, ?, ?, 1)"
    ).run("n1", TEST_USER_ID, "Title", "content");

    const { POST } = await importPinRoute();
    const req = new NextRequest(url("/api/notes/n1/pin"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_pinned).toBe(0);
  });

  it("Cannot pin a soft-deleted note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Deleted", "content");

    const { POST } = await importPinRoute();
    const req = new NextRequest(url("/api/notes/n1/pin"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });
});

// ==================== TRASH ====================

describe("Trash", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("GET /api/trash lists soft-deleted notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("t1", TEST_USER_ID, "Trashed", "trashed content");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("t2", TEST_USER_ID, "Active", "active content");

    const { GET } = await importTrashRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const notes = await res.json();
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe("t1");
  });

  it("GET /api/trash does not list other user's trashed notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("t1", OTHER_USER_ID, "Other Trashed", "content");

    const { GET } = await importTrashRoute();
    const res = await GET();
    const notes = await res.json();
    expect(notes).toHaveLength(0);
  });

  it("DELETE /api/trash permanently deletes all trashed notes", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("t1", TEST_USER_ID, "Trashed1", "content1");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("t2", TEST_USER_ID, "Trashed2", "content2");
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("t3", TEST_USER_ID, "Active", "content3");

    const { DELETE } = await importTrashRoute();
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.deleted).toBe(2);

    // Active note still exists
    const remaining = db.prepare("SELECT id FROM notes WHERE user_id = ?").all(TEST_USER_ID);
    expect(remaining).toHaveLength(1);
  });
});

// ==================== RESTORE ====================

describe("Restore", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("POST /api/notes/[id]/restore restores a soft-deleted note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Trashed", "content");

    const { POST } = await importRestoreRoute();
    const req = new NextRequest(url("/api/notes/n1/restore"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify deleted_at is null
    const row = db.prepare("SELECT deleted_at FROM notes WHERE id = ?").get("n1") as { deleted_at: string | null };
    expect(row.deleted_at).toBeNull();
  });

  it("POST /api/notes/[id]/restore on a non-deleted note still succeeds (sets deleted_at to NULL)", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Active", "content");

    const { POST } = await importRestoreRoute();
    const req = new NextRequest(url("/api/notes/n1/restore"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    // The restore route checks ownership but doesn't check if deleted_at IS NOT NULL, so it succeeds
    expect(res.status).toBe(200);
  });

  it("POST /api/notes/[id]/restore returns 404 for another user's note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", OTHER_USER_ID, "Other", "content");

    const { POST } = await importRestoreRoute();
    const req = new NextRequest(url("/api/notes/n1/restore"), { method: "POST" });
    const res = await POST(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });
});

// ==================== PERMANENT DELETE ====================

describe("Permanent Delete", () => {
  beforeEach(() => {
    mockAuthenticated();
  });

  it("DELETE /api/notes/[id]/permanent deletes a trashed note permanently", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", TEST_USER_ID, "Trashed", "content");

    const { DELETE } = await importPermanentRoute();
    const req = new NextRequest(url("/api/notes/n1/permanent"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("n1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify note is gone from DB
    const row = db.prepare("SELECT id FROM notes WHERE id = ?").get("n1");
    expect(row).toBeUndefined();
  });

  it("Cannot permanently delete a non-trashed note (returns 404)", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)"
    ).run("n1", TEST_USER_ID, "Active", "content");

    const { DELETE } = await importPermanentRoute();
    const req = new NextRequest(url("/api/notes/n1/permanent"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });

  it("Cannot permanently delete another user's trashed note", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO notes (id, user_id, title, content, deleted_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run("n1", OTHER_USER_ID, "Other Trashed", "content");

    const { DELETE } = await importPermanentRoute();
    const req = new NextRequest(url("/api/notes/n1/permanent"), { method: "DELETE" });
    const res = await DELETE(req, makeParams("n1"));
    expect(res.status).toBe(404);
  });
});
