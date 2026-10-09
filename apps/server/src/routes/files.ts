import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { getFile, saveUpload } from "../files.ts";

export const fileRoutes = new Hono();

fileRoutes.post("/", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Falta el archivo");
  const projectId = form.get("projectId");
  const saved = await saveUpload(file, typeof projectId === "string" ? projectId : null);
  return c.json({ id: saved.id, name: saved.name, mediaType: saved.mediaType, url: `/api/files/${saved.id}` });
});

fileRoutes.get("/:id", async (c) => {
  const file = await getFile(c.req.param("id"));
  if (!file) return c.notFound();
  const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new Response(stream, {
    headers: { "content-type": file.mediaType, "cache-control": "private, max-age=31536000, immutable" },
  });
});
