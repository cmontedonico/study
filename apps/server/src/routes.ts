import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { UIMessage } from "ai";
import { asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { handleChat } from "./chat.ts";
import { db, schema } from "./db.ts";
import { getFile, saveUpload } from "./files.ts";
import { modelAliases } from "./models.ts";
import { getSetting, publicSettings, setSetting } from "./settings.ts";

const engine = z.enum(["cli", "api"]);
const model = z.enum(modelAliases);

export const api = new Hono();

api.onError((err, c) => c.json({ error: err.message }, 400));

api.get("/state", async (c) => {
  const [projects, threads, templates] = await Promise.all([
    db.select().from(schema.projects).orderBy(asc(schema.projects.name)),
    db.select().from(schema.threads).orderBy(desc(schema.threads.updatedAt)),
    db.select().from(schema.templates).orderBy(desc(schema.templates.builtIn), asc(schema.templates.name)),
  ]);
  return c.json({ projects, threads, templates, settings: publicSettings() });
});

// Projects -------------------------------------------------------------------

api.post("/projects", async (c) => {
  const body = z
    .object({ name: z.string().min(1), templateId: z.string().optional() })
    .parse(await c.req.json());
  const template = body.templateId
    ? await db.query.templates.findFirst({ where: eq(schema.templates.id, body.templateId) })
    : undefined;
  const [project] = await db
    .insert(schema.projects)
    .values({
      id: nanoid(),
      name: body.name,
      icon: template?.icon ?? "📁",
      instructions: template?.instructions ?? "",
      templateId: template?.id,
    })
    .returning();
  return c.json(project);
});

api.patch("/projects/:id", async (c) => {
  const body = z
    .object({ name: z.string().min(1), icon: z.string(), instructions: z.string() })
    .partial()
    .parse(await c.req.json());
  const [project] = await db
    .update(schema.projects)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(schema.projects.id, c.req.param("id")))
    .returning();
  return c.json(project);
});

api.delete("/projects/:id", async (c) => {
  await db.delete(schema.projects).where(eq(schema.projects.id, c.req.param("id")));
  return c.json({ ok: true });
});

// Threads --------------------------------------------------------------------

api.post("/threads", async (c) => {
  const body = z
    .object({ projectId: z.string().nullable().optional(), model: model.optional(), engine: engine.optional() })
    .parse(await c.req.json());
  const defaults = publicSettings();
  const [thread] = await db
    .insert(schema.threads)
    .values({
      id: nanoid(),
      projectId: body.projectId ?? null,
      model: body.model ?? defaults.defaultModel,
      engine: body.engine ?? defaults.defaultEngine,
    })
    .returning();
  return c.json(thread);
});

api.patch("/threads/:id", async (c) => {
  const body = z
    .object({ title: z.string().min(1), model, engine, projectId: z.string().nullable() })
    .partial()
    .parse(await c.req.json());
  const [thread] = await db
    .update(schema.threads)
    .set({ ...body, updatedAt: Date.now() })
    .where(eq(schema.threads.id, c.req.param("id")))
    .returning();
  return c.json(thread);
});

api.delete("/threads/:id", async (c) => {
  await db.delete(schema.threads).where(eq(schema.threads.id, c.req.param("id")));
  return c.json({ ok: true });
});

api.get("/threads/:id/messages", async (c) => {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, c.req.param("id")))
    .orderBy(asc(schema.messages.position));
  return c.json(rows.map(({ id, role, parts }) => ({ id, role, parts })));
});

// Chat -----------------------------------------------------------------------

api.post("/chat", async (c) => {
  const { id, messages } = (await c.req.json()) as { id: string; messages: UIMessage[] };
  return handleChat(id, messages, c.req.raw.signal);
});

// Files ----------------------------------------------------------------------

api.post("/files", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Falta el archivo");
  const projectId = form.get("projectId");
  const saved = await saveUpload(file, typeof projectId === "string" ? projectId : null);
  return c.json({ id: saved.id, name: saved.name, mediaType: saved.mediaType, url: `/api/files/${saved.id}` });
});

api.get("/files/:id", async (c) => {
  const file = await getFile(c.req.param("id"));
  if (!file) return c.notFound();
  const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new Response(stream, {
    headers: { "content-type": file.mediaType, "cache-control": "private, max-age=31536000, immutable" },
  });
});

// Settings -------------------------------------------------------------------

api.put("/settings", async (c) => {
  const body = z
    .object({ anthropicApiKey: z.string().nullable(), defaultEngine: engine, defaultModel: model })
    .partial()
    .parse(await c.req.json());
  for (const [key, value] of Object.entries(body)) {
    setSetting(key as Parameters<typeof setSetting>[0], value ?? null);
  }
  return c.json(publicSettings());
});

api.get("/health", (c) => c.json({ ok: true, hasApiKey: Boolean(getSetting("anthropicApiKey")) }));
