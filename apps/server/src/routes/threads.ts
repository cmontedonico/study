import { and, asc, eq, lte } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { publicSettings } from "../settings.ts";
import { engine, model } from "./validators.ts";

export const threadRoutes = new Hono();

threadRoutes.post("/", async (c) => {
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

threadRoutes.patch("/:id", async (c) => {
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

threadRoutes.delete("/:id", async (c) => {
  await db.delete(schema.threads).where(eq(schema.threads.id, c.req.param("id")));
  return c.json({ ok: true });
});

threadRoutes.get("/:id/messages", async (c) => {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, c.req.param("id")))
    .orderBy(asc(schema.messages.position));
  return c.json(rows.map(({ id, role, parts }) => ({ id, role, parts })));
});

threadRoutes.post("/:id/fork", async (c) => {
  const { messageId } = z.object({ messageId: z.string() }).parse(await c.req.json());
  const parent = await db.query.threads.findFirst({ where: eq(schema.threads.id, c.req.param("id")) });
  if (!parent) throw new Error("Hilo no encontrado");
  const upTo = await db.query.messages.findFirst({
    where: and(eq(schema.messages.threadId, parent.id), eq(schema.messages.id, messageId)),
  });
  if (!upTo) throw new Error("Mensaje no encontrado");

  const copied = db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.threadId, parent.id), lte(schema.messages.position, upTo.position)))
    .orderBy(asc(schema.messages.position))
    .all();

  const thread = db.transaction((tx) => {
    const created = tx
      .insert(schema.threads)
      .values({
        id: nanoid(),
        projectId: parent.projectId,
        title: `${parent.title} (rama)`,
        model: parent.model,
        engine: parent.engine,
        parentThreadId: parent.id,
        forkedFromMessageId: messageId,
      })
      .returning()
      .get();
    for (const m of copied) {
      tx.insert(schema.messages)
        .values({ id: m.id, threadId: created.id, role: m.role, parts: m.parts, position: m.position })
        .run();
    }
    return created;
  });
  return c.json(thread);
});
