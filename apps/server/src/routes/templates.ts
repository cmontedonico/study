import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { generateTemplateDraft, improveInstructions } from "../template-ai.ts";
import {
  dedupeNames,
  parseImportPayload,
  serializeBundle,
  serializeTemplateMarkdown,
} from "../template-io.ts";
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

const aiError = (c: Context, e: unknown) =>
  c.json({ error: e instanceof Error ? e.message : "No se pudo completar la petición a la IA." }, 502);

// Literal paths first so they are not taken as `/:id`.
templateRoutes.post("/generate", async (c) => {
  const { prompt } = z.object({ prompt: z.string().trim().min(1, "Describe la plantilla que quieres") }).parse(
    await c.req.json(),
  );
  try {
    return c.json(await generateTemplateDraft(prompt));
  } catch (e) {
    return aiError(c, e);
  }
});

templateRoutes.post("/improve", async (c) => {
  const body = z
    .object({ instructions: z.string().trim().min(1, "No hay instrucciones que mejorar"), request: z.string().optional() })
    .parse(await c.req.json());
  try {
    return c.json({ instructions: await improveInstructions(body.instructions, body.request) });
  } catch (e) {
    return aiError(c, e);
  }
});

templateRoutes.post("/import", async (c) => {
  let incoming;
  try {
    incoming = parseImportPayload(await c.req.json());
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "Archivo no válido" }, 400);
  }
  const existing = await db.select({ name: schema.templates.name }).from(schema.templates);
  const rows = dedupeNames(incoming, existing.map((t) => t.name)).map((t) => ({
    id: nanoid(),
    ...t,
    builtIn: false,
  }));
  const created = await db.insert(schema.templates).values(rows).returning();
  return c.json({ count: created.length, templates: created });
});

const download = (c: Context, body: string, filename: string, type: string) => {
  c.header("content-type", `${type}; charset=utf-8`);
  c.header("content-disposition", `attachment; filename="${filename}"`);
  return c.body(body);
};
const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "plantilla";

templateRoutes.get("/export", async (c) => {
  const rows = await db.select().from(schema.templates).where(eq(schema.templates.hidden, false));
  return download(c, serializeBundle(rows), "plantillas-studylab.json", "application/json");
});

templateRoutes.get("/:id/export", async (c) => {
  const existing = await findTemplate(c.req.param("id"));
  if (!existing) return c.json({ error: "Plantilla no encontrada" }, 404);
  return download(c, serializeTemplateMarkdown(existing), `${slug(existing.name)}.md`, "text/markdown");
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
