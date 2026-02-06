import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = "./data/test-db-unit.db";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-tests";
  process.env.DATABASE_URL = TEST_DB_PATH;
});

afterAll(() => {
  // Clean up test database and directory
  const dir = path.dirname(TEST_DB_PATH);
  const dbFiles = [TEST_DB_PATH, TEST_DB_PATH + "-wal", TEST_DB_PATH + "-shm"];
  for (const f of dbFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const imagesDir = path.join(dir, "images");
  if (fs.existsSync(imagesDir)) {
    fs.rmSync(imagesDir, { recursive: true, force: true });
  }
});

// Dynamic import so env vars are set before the module-level DB_PATH is read
async function getDbModule() {
  // Reset module cache to ensure fresh import with our env vars
  const mod = await import("./db");
  return mod;
}

describe("Database Initialization", () => {
  it("getDb() returns a Database instance", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe("function");
    expect(typeof db.exec).toBe("function");
  });

  it("getDb() returns the same instance on subsequent calls (singleton)", async () => {
    const { getDb } = await getDbModule();
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it("tables are created: users, notes, images, password_reset_tokens, user_preferences", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\__%' ESCAPE '\\' ORDER BY name"
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain("users");
    expect(tables).toContain("notes");
    expect(tables).toContain("images");
    expect(tables).toContain("password_reset_tokens");
    expect(tables).toContain("user_preferences");
  });

  it("notes_fts virtual table is created", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const fts = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'"
      )
      .all();
    expect(fts).toHaveLength(1);
  });

  it("WAL mode is enabled", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const result = db.pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe("wal");
  });

  it("foreign keys are enabled", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const result = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it("token_version column exists on users table", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const columns = db.pragma("table_info(users)") as {
      name: string;
      type: string;
    }[];
    const tokenVersionCol = columns.find((c) => c.name === "token_version");
    expect(tokenVersionCol).toBeDefined();
  });
});

describe("Migrations", () => {
  it("_migrations table tracks applied migrations", async () => {
    const { getDb } = await getDbModule();
    const db = getDb();
    const migrations = db.prepare("SELECT name FROM _migrations").all() as {
      name: string;
    }[];
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].name).toBe("001_initial.sql");
  });

  it("running getDb() twice doesn't re-apply migrations", async () => {
    const { getDb } = await getDbModule();
    getDb();
    getDb();
    const db = getDb();
    const migrations = db.prepare("SELECT name FROM _migrations").all() as {
      name: string;
    }[];
    // Should still have exactly 1 migration entry, not duplicates
    const initialMigrations = migrations.filter(
      (m) => m.name === "001_initial.sql"
    );
    expect(initialMigrations).toHaveLength(1);
  });
});
