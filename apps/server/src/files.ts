import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { extractText, getDocumentProxy } from "unpdf";
import { db, schema } from "./db.ts";
import { extractWithOcr } from "./ocr.ts";
import { filesDir } from "./paths.ts";

export type StoredFile = typeof schema.files.$inferSelect;

const textLike = /^(text\/|application\/(json|xml|x-yaml|yaml|csv))/;

export function isTextLike(mediaType: string) {
  return textLike.test(mediaType);
}

/** `ocrError` is set when a scanned PDF could not be fully read; the file is still stored. */
export type SavedUpload = StoredFile & { ocrError?: string };

export async function saveUpload(file: File, projectId: string | null = null): Promise<SavedUpload> {
  const id = nanoid();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = join(filesDir, id + extname(file.name));
  await writeFile(path, bytes);
  // unpdf transfers the buffer to a worker, which zeroes bytes.byteLength afterwards.
  const size = bytes.byteLength;

  const mediaType = file.type || "application/octet-stream";
  let extractedText: string | null = null;
  let ocrError: string | undefined;
  if (mediaType === "application/pdf") {
    const pdfCopy = bytes.slice(); // unpdf detaches `bytes`; OCR opens its own document
    const pdf = await getDocumentProxy(bytes);
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const result = await extractWithOcr(pdfCopy, pages);
    extractedText = result.text;
    ocrError = result.error;
  } else if (isTextLike(mediaType)) {
    extractedText = new TextDecoder().decode(bytes);
  }

  const [row] = await db
    .insert(schema.files)
    .values({ id, projectId, name: file.name, mediaType, size, path, extractedText })
    .returning();
  return { ...row!, ocrError };
}

export async function getFile(id: string) {
  return db.query.files.findFirst({ where: eq(schema.files.id, id) });
}

export async function readAsDataUrl(file: StoredFile) {
  const data = await readFile(file.path);
  return `data:${file.mediaType};base64,${data.toString("base64")}`;
}

export function asDocumentText(file: Pick<StoredFile, "name" | "extractedText">) {
  return `<document name="${file.name}">\n${file.extractedText ?? ""}\n</document>`;
}
