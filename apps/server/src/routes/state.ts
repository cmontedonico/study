import { asc, count, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db.ts";
import { publicSettings } from "../settings.ts";

export const stateRoutes = new Hono();

stateRoutes.get("/state", async (c) => {
  const [projects, threads, templates, hidden] = await Promise.all([
    db.select().from(schema.projects).orderBy(asc(schema.projects.name)),
    db.select().from(schema.threads).orderBy(desc(schema.threads.updatedAt)),
    db
      .select({
        ...getTableColumns(schema.templates),
        projectCount: sql<number>`(SELECT count(*) FROM project WHERE project.template_id = template.id)`,
      })
      .from(schema.templates)
      .where(eq(schema.templates.hidden, false))
      .orderBy(desc(schema.templates.builtIn), asc(schema.templates.name)),
    db.select({ n: count() }).from(schema.templates).where(eq(schema.templates.hidden, true)),
  ]);
  return c.json({ projects, threads, templates, hiddenTemplateCount: hidden[0]?.n ?? 0, settings: publicSettings() });
});
