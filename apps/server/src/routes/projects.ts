import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db.ts";

export const projectRoutes = new Hono();

projectRoutes.post("/", async (c) => {
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

projectRoutes.patch("/:id", async (c) => {
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

projectRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  // The DB cascade removes the file rows but not the blobs on disk.
  const files = await db.query.files.findMany({ where: eq(schema.files.projectId, id) });
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  await Promise.all(files.map((f) => rm(f.path, { force: true })));
  return c.json({ ok: true });
});
