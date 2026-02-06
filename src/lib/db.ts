import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DATABASE_URL || "./data/sketchnotes.db";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Ensure images directory exists
  const imagesDir = path.join(dir, "images");
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  // Add token_version column for session invalidation (idempotent)
  try {
    db.exec("ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0");
  } catch {
    // Column already exists, ignore
  }

  return db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  const migrationsDir = path.join(process.cwd(), "src", "migrations");
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    db.exec(sql);
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}
