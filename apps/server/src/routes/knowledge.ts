import { rm } from "node:fs/promises";
import { extname } from "node:path";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db.ts";
import { isTextLike, saveUpload } from "../files.ts";

export const knowledgeRoutes = new Hono();

/** A PDF with fewer characters than this is most likely a scan without a text layer. */
const MIN_PDF_CHARS = 50;

const extensionTypes: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".pdf": "application/pdf",
};

function resolveMediaType(file: File) {
  const fromExtension = extensionTypes[extname(file.name).toLowerCase()];
  // Browsers report "" or octet-stream for .md/.csv on some platforms; trust the extension then.
  if (!file.type || file.type === "application/octet-stream") return fromExtension;
  return file.type;
}

knowledgeRoutes.get("/", async (c) => {
  const projectId = c.req.query("projectId");
  if (!projectId) throw new Error("Falta projectId");
  const rows = await db.query.files.findMany({
    where: eq(schema.files.projectId, projectId),
    orderBy: asc(schema.files.createdAt),
  });
  return c.json(
    rows.map((f) => ({
      id: f.id,
      name: f.name,
      mediaType: f.mediaType,
      size: f.size,
      createdAt: f.createdAt,
      chars: f.extractedText?.length ?? 0,
    })),
  );
});

knowledgeRoutes.post("/", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const projectId = form.get("projectId");
  if (!(file instanceof File)) throw new Error("Falta el archivo");
  if (typeof projectId !== "string" || !projectId) throw new Error("Falta el proyecto");
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw new Error("Proyecto no encontrado");

  const mediaType = resolveMediaType(file);
  if (!mediaType || (mediaType !== "application/pdf" && !isTextLike(mediaType))) {
    throw new Error(
      `"${file.name}" no se puede usar como conocimiento. Sube un PDF o un archivo de texto (txt, md, csv, json).`,
    );
  }

  const saved = await saveUpload(new File([await file.arrayBuffer()], file.name, { type: mediaType }), projectId);
  const chars = saved.extractedText?.trim().length ?? 0;
  const warning =
    mediaType === "application/pdf" && chars < MIN_PDF_CHARS
      ? "Este PDF casi no tiene texto extraíble (¿es un escaneo?). Claude no podrá leerlo como conocimiento."
      : undefined;
  return c.json({
    id: saved.id,
    name: saved.name,
    mediaType: saved.mediaType,
    size: saved.size,
    createdAt: saved.createdAt,
    chars: saved.extractedText?.length ?? 0,
    warning,
  });
});

knowledgeRoutes.delete("/:id", async (c) => {
  const [row] = await db
    .delete(schema.files)
    .where(and(eq(schema.files.id, c.req.param("id")), isNotNull(schema.files.projectId)))
    .returning();
  if (!row) return c.json({ error: "Archivo no encontrado" }, 404);
  await rm(row.path, { force: true });
  return c.json({ ok: true });
});
