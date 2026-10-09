import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { getFile, isAudio, saveUpload } from "../files.ts";

export const fileRoutes = new Hono();

fileRoutes.post("/", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Falta el archivo");
  const projectId = form.get("projectId");
  const saved = await saveUpload(file, typeof projectId === "string" ? projectId : null);
  return c.json({
    id: saved.id,
    name: saved.name,
    mediaType: saved.mediaType,
    url: `/api/files/${saved.id}`,
    warning: saved.ocrError ? `No se pudo leer el PDF escaneado (OCR): ${saved.ocrError}` : undefined,
  });
});

fileRoutes.get("/:id/transcript", async (c) => {
  const file = await getFile(c.req.param("id"));
  if (!file || !isAudio(file.mediaType)) return c.notFound();
  return c.json({ text: file.extractedText ?? "" });
});

/** Safari will not play <audio> unless the server answers byte-range requests. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2]) || size === 0) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  return start <= end ? { start, end } : null;
}

fileRoutes.get("/:id", async (c) => {
  const file = await getFile(c.req.param("id"));
  if (!file) return c.notFound();
  const { size } = await stat(file.path);
  const headers: Record<string, string> = {
    "content-type": file.mediaType,
    "cache-control": "private, max-age=31536000, immutable",
    "accept-ranges": "bytes",
  };
  const rangeHeader = c.req.header("range");
  const range = parseRange(rangeHeader, size);
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const stream = Readable.toWeb(createReadStream(file.path, range ?? undefined)) as ReadableStream;
  if (!range) return new Response(stream, { headers: { ...headers, "content-length": String(size) } });
  return new Response(stream, {
    status: 206,
    headers: {
      ...headers,
      "content-range": `bytes ${range.start}-${range.end}/${size}`,
      "content-length": String(range.end - range.start + 1),
    },
  });
});
