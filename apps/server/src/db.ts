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

// Token usage per assistant message. Kept apart from `message` because saveThreadMessages rewrites those rows.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS message_usage (
    thread_id TEXT NOT NULL REFERENCES thread(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (thread_id, message_id)
  );
`);

// Idempotent column additions (no migrations): add here when a table gains a column.
const threadColumns = sqlite.prepare("PRAGMA table_info(thread)").all() as { name: string }[];
if (!threadColumns.some((c) => c.name === "effort")) {
  sqlite.exec("ALTER TABLE thread ADD COLUMN effort TEXT");
}
if (!threadColumns.some((c) => c.name === "title_source")) {
  sqlite.exec("ALTER TABLE thread ADD COLUMN title_source TEXT NOT NULL DEFAULT 'auto'");
}

if (!threadColumns.some((c) => c.name === "notion_url")) {
  try {
    sqlite.exec("ALTER TABLE thread ADD COLUMN notion_url TEXT");
  } catch (err) {
    // Another process on the same data dir (e.g. the live app) may have added it a moment ago.
    if (!/duplicate column/i.test((err as Error).message)) throw err;
  }
}

// Template chosen when the chat was created: a snapshot of its identity and instructions, so the chat
// keeps working (and keeps its prompt) if the template is later edited or deleted.
for (const column of ["template_id", "template_name", "template_icon", "template_instructions"]) {
  if (!threadColumns.some((c) => c.name === column)) {
    try {
      sqlite.exec(`ALTER TABLE thread ADD COLUMN ${column} TEXT`);
    } catch (err) {
      if (!/duplicate column/i.test((err as Error).message)) throw err;
    }
  }
}

// Full-text index: one row per text-bearing message plus one row (message_id = '') for the title.
sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
    thread_id UNINDEXED, message_id UNINDEXED, text,
    tokenize = 'unicode61 remove_diacritics 2'
  );
`);

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => (p && p.type === "text" && typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n");
}

const ftsDelete = sqlite.prepare("DELETE FROM message_fts WHERE thread_id = ?");
const ftsInsert = sqlite.prepare("INSERT INTO message_fts (thread_id, message_id, text) VALUES (?, ?, ?)");
const threadTitle = sqlite.prepare("SELECT title FROM thread WHERE id = ?");
const threadMessages = sqlite.prepare("SELECT id, parts FROM message WHERE thread_id = ? ORDER BY position");

/** Rebuilds a thread's rows in the search index (title + text parts of its messages). */
export const reindexThread = sqlite.transaction((threadId: string) => {
  ftsDelete.run(threadId);
  const thread = threadTitle.get(threadId) as { title: string } | undefined;
  if (!thread) return;
  ftsInsert.run(threadId, "", thread.title);
  for (const m of threadMessages.all(threadId) as { id: string; parts: string }[]) {
    let text = "";
    try {
      text = textOf(JSON.parse(m.parts));
    } catch {
      // Malformed parts: nothing to index.
    }
    if (text) ftsInsert.run(threadId, m.id, text);
  }
});

export function removeThreadFromIndex(threadId: string) {
  ftsDelete.run(threadId);
}

// Backfill for databases created before search existed, and drop rows of threads deleted by cascade.
sqlite.exec("DELETE FROM message_fts WHERE thread_id NOT IN (SELECT id FROM thread)");
if (!sqlite.prepare("SELECT 1 FROM message_fts LIMIT 1").get()) {
  for (const t of sqlite.prepare("SELECT id FROM thread").all() as { id: string }[]) reindexThread(t.id);
}

// Columns added after the first release of the template table.
const templateColumns = (sqlite.pragma("table_info(template)") as { name: string }[]).map((c) => c.name);
for (const column of ["customized", "hidden"]) {
  if (!templateColumns.includes(column)) {
    sqlite.exec(`ALTER TABLE template ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  }
}

const upsertTemplate = sqlite.prepare(`
  INSERT INTO template (id, name, description, icon, instructions, built_in)
  VALUES (@id, @name, @description, @icon, @instructions, 1)
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
    icon = excluded.icon, instructions = excluded.instructions
  WHERE template.customized = 0
`);

/** Inserts missing built-ins and refreshes the untouched ones; edited (customized) and hidden ones are kept. */
export function seedBuiltInTemplates() {
  for (const t of builtInTemplates) upsertTemplate.run(t);
}
seedBuiltInTemplates();

export { sqlite };
export const db = drizzle(sqlite, { schema });
export { schema };
