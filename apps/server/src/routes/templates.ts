import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { builtInTemplates } from "../templates.ts";

export const templateRoutes = new Hono();

const shape = {
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  icon: z.string().trim().min(1),
  description: z.string(),
  instructions: z.string(),
};
const createFields = z.object({
  ...shape,
  icon: shape.icon.default("✨"),
  description: shape.description.default(""),
  instructions: shape.instructions.default(""),
});
const updateFields = z.object(shape).partial();

const findTemplate = (id: string) => db.query.templates.findFirst({ where: eq(schema.templates.id, id) });

templateRoutes.post("/", async (c) => {
  const body = createFields.parse(await c.req.json());
  const [row] = await db
    .insert(schema.templates)
    .values({ id: nanoid(), ...body, builtIn: false })
    .returning();
  return c.json(row);
});

templateRoutes.post("/from-project/:projectId", async (c) => {
  const project = await db.query.projects.findFirst({
    where: eq(schema.projects.id, c.req.param("projectId")),
  });
  if (!project) return c.json({ error: "Proyecto no encontrado" }, 404);
  const [row] = await db
    .insert(schema.templates)
    .values({
      id: nanoid(),
      name: project.name,
      icon: project.icon,
      description: "Creada desde un proyecto",
      instructions: project.instructions,
      builtIn: false,
    })
    .returning();
  return c.json(row);
});

templateRoutes.patch("/:id", async (c) => {
  const existing = await findTemplate(c.req.param("id"));
  if (!existing) return c.json({ error: "Plantilla no encontrada" }, 404);
  const body = updateFields.parse(await c.req.json());
  const [row] = await db
    .update(schema.templates)
    .set(existing.builtIn ? { ...body, customized: true } : body)
    .where(eq(schema.templates.id, existing.id))
    .returning();
  return c.json(row);
});

// Registered before "/:id" routes so the literal path is not taken as an id.
templateRoutes.post("/restore-hidden", async (c) => {
  const rows = await db
    .update(schema.templates)
    .set({ hidden: false })
    .where(and(eq(schema.templates.builtIn, true), eq(schema.templates.hidden, true)))
    .returning({ id: schema.templates.id });
  return c.json({ count: rows.length });
});

templateRoutes.post("/:id/restore", async (c) => {
  const existing = await findTemplate(c.req.param("id"));
  if (!existing) return c.json({ error: "Plantilla no encontrada" }, 404);
  const original = existing.builtIn ? builtInTemplates.find((t) => t.id === existing.id) : undefined;
  if (!original) return c.json({ error: "Solo las plantillas integradas tienen versión original." }, 400);
  const [row] = await db
    .update(schema.templates)
    .set({
      name: original.name,
      description: original.description,
      icon: original.icon,
      instructions: original.instructions,
      customized: false,
    })
    .where(eq(schema.templates.id, existing.id))
    .returning();
  return c.json(row);
});

templateRoutes.post("/:id/apply-to-projects", async (c) => {
  const existing = await findTemplate(c.req.param("id"));
  if (!existing) return c.json({ error: "Plantilla no encontrada" }, 404);
  const rows = await db
    .update(schema.projects)
    .set({ instructions: existing.instructions, updatedAt: Date.now() })
    .where(eq(schema.projects.templateId, existing.id))
    .returning({ id: schema.projects.id });
  return c.json({ count: rows.length });
});

templateRoutes.delete("/:id", async (c) => {
  const existing = await findTemplate(c.req.param("id"));
  if (!existing) return c.json({ error: "Plantilla no encontrada" }, 404);
  if (existing.builtIn) {
    await db.update(schema.templates).set({ hidden: true }).where(eq(schema.templates.id, existing.id));
  } else {
    await db.delete(schema.templates).where(eq(schema.templates.id, existing.id));
  }
  return c.json({ ok: true });
});
