import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const templates = sqliteTable("template", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("✨"),
  instructions: text("instructions").notNull().default(""),
  builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const projects = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("📁"),
  instructions: text("instructions").notNull().default(""),
  templateId: text("template_id"),
  ...timestamps,
  updatedAt: integer("updated_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const threads = sqliteTable("thread", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull().default("Nuevo chat"),
  model: text("model").notNull().default("sonnet"),
  engine: text("engine", { enum: ["cli", "api"] })
    .notNull()
    .default("cli"),
  parentThreadId: text("parent_thread_id"),
  forkedFromMessageId: text("forked_from_message_id"),
  ...timestamps,
  updatedAt: integer("updated_at", { mode: "number" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const messages = sqliteTable(
  "message",
  {
    id: text("id").notNull(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["system", "user", "assistant"] }).notNull(),
    parts: text("parts", { mode: "json" }).notNull().$type<unknown[]>(),
    position: integer("position").notNull(),
    ...timestamps,
  },
  // Forked threads copy messages, so ids are only unique within a thread.
  (t) => [primaryKey({ columns: [t.threadId, t.id] })],
);

/** Files uploaded to a chat message or to a project's knowledge. */
export const files = sqliteTable("file", {
  id: text("id").primaryKey(),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  mediaType: text("media_type").notNull(),
  size: integer("size").notNull(),
  path: text("path").notNull(),
  extractedText: text("extracted_text"),
  ...timestamps,
});

export const settings = sqliteTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
