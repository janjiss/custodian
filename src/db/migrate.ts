import { Database } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { getDataDir } from "../core/config"
import * as schema from "./schema"
import { join } from "path"

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  opencode_session_id TEXT,
  mode TEXT NOT NULL DEFAULT 'agent',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  file_path TEXT NOT NULL,
  content_before TEXT,
  content_after TEXT,
  diff_text TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS review_state (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at INTEGER
);
`

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db

  const dataDir = getDataDir()
  const dbPath = join(dataDir, "custodian.db")
  const sqlite = new Database(dbPath)

  sqlite.exec("PRAGMA journal_mode = WAL;")
  sqlite.exec("PRAGMA foreign_keys = ON;")
  sqlite.exec(SCHEMA_SQL)

  _db = drizzle(sqlite, { schema })
  return _db
}

if (import.meta.main) {
  console.log("Running migrations...")
  getDb()
  console.log("Migrations complete.")
}
