import { asc, eq } from "drizzle-orm";
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
