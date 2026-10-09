import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { dbPath } from "./paths.ts";
import * as schema from "./schema.ts";
import { builtInTemplates } from "./templates.ts";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS template (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '✨', instructions TEXT NOT NULL DEFAULT '',
    built_in INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '📁',
    instructions TEXT NOT NULL DEFAULT '', template_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE TABLE IF NOT EXISTS thread (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Nuevo chat', model TEXT NOT NULL DEFAULT 'sonnet',
    engine TEXT NOT NULL DEFAULT 'cli', parent_thread_id TEXT, forked_from_message_id TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE TABLE IF NOT EXISTS message (
    id TEXT NOT NULL, thread_id TEXT NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
    role TEXT NOT NULL, parts TEXT NOT NULL, position INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (thread_id, id)
  );
  CREATE INDEX IF NOT EXISTS message_thread_idx ON message(thread_id, position);
  CREATE TABLE IF NOT EXISTS file (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
    name TEXT NOT NULL, media_type TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL,
    extracted_text TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );
  CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const upsertTemplate = sqlite.prepare(`
  INSERT INTO template (id, name, description, icon, instructions, built_in)
  VALUES (@id, @name, @description, @icon, @instructions, 1)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
    icon = excluded.icon, instructions = excluded.instructions
`);
for (const t of builtInTemplates) upsertTemplate.run(t);

export const db = drizzle(sqlite, { schema });
export { schema };
