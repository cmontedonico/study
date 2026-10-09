import { asc, desc } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db.ts";
import { publicSettings } from "../settings.ts";

export const stateRoutes = new Hono();

stateRoutes.get("/state", async (c) => {
  const [projects, threads, templates] = await Promise.all([
    db.select().from(schema.projects).orderBy(asc(schema.projects.name)),
    db.select().from(schema.threads).orderBy(desc(schema.threads.updatedAt)),
    db.select().from(schema.templates).orderBy(desc(schema.templates.builtIn), asc(schema.templates.name)),
  ]);
  return c.json({ projects, threads, templates, settings: publicSettings() });
});
