import { generateText, type ModelMessage } from "ai";
import { createIsomorphicCanvasFactory, getDocumentProxy, renderPageAsImage } from "unpdf";
import { resolveModel, type Engine } from "./model.ts";
import { getSetting } from "./settings.ts";

/** A page with fewer non-whitespace characters than this is treated as a scan without a text layer. */
export const MIN_PAGE_CHARS = 25;
/** Hard cap on OCR'd pages per PDF; the rest is reported as not processed. */
export const MAX_OCR_PAGES = 40;
const PAGES_PER_REQUEST = 3;
const CONCURRENCY = 2;
/** Target length of the longest side of the rendered page, in pixels. */
const TARGET_SIDE = 1800;

/** 1-based numbers of the pages whose text layer is (almost) empty. */
export function findEmptyPages(pages: string[], minChars = MIN_PAGE_CHARS): number[] {
  return pages.flatMap((text, i) => (text.replace(/\s/g, "").length < minChars ? [i + 1] : []));
}

/** Splits the empty pages into those that will be OCR'd (up to `limit`) and those left out. */
export function selectOcrPages(empty: number[], limit = MAX_OCR_PAGES) {
  return { selected: empty.slice(0, limit), skipped: empty.slice(limit) };
}

/**
 * Merges the text layer with the OCR results, in page order. With no OCR involved the pages are
 * joined as before; otherwise every page gets a `--- Página N ---` marker so the origin is clear.
 */
export function assemblePages(pages: string[], ocr: Map<number, string>, skipped: number[] = []): string {
  if (ocr.size === 0 && skipped.length === 0) return pages.join("\n\n");
  const skippedSet = new Set(skipped);
  const parts = pages.map((text, i) => {
    const n = i + 1;
    const body = ocr.get(n) ?? (skippedSet.has(n) ? "[Página no procesada: se alcanzó el límite de OCR]" : text);
    return `--- Página ${n} ---\n${body.trim()}`;
  });
  if (skipped.length > 0) {
    parts.push(
      `[Nota: ${skipped.length} páginas escaneadas no se leyeron porque el límite de OCR es de ${MAX_OCR_PAGES} páginas.]`,
    );
  }
  return parts.join("\n\n");
}

/** Splits a model answer made of `<<<PÁGINA N>>>` sections into text per page number. */
export function parseTranscription(answer: string, expected: number[]): Map<number, string> {
  const result = new Map<number, string>();
  // With a capture group, split yields [preamble, n1, text1, n2, text2, ...].
  const chunks = answer.split(/^[ \t]*<<<PÁGINA (\d+)>>>[ \t]*$/m);
  for (let i = 1; i + 1 < chunks.length; i += 2) result.set(Number(chunks[i]), (chunks[i + 1] ?? "").trim());
  if (result.size === 0 && expected.length === 1 && answer.trim()) result.set(expected[0]!, answer.trim());
  return result;
}

const OCR_PROMPT = `Transcribe fielmente el texto de estas páginas escaneadas.
Reglas estrictas:
- Mantén el orden de lectura y el idioma original. No traduzcas, no resumas, no corrijas.
- Usa Markdown para títulos, listas y tablas. Escribe las fórmulas matemáticas en LaTeX con $$...$$ (o $...$ en línea).
- Marca lo que no se pueda leer como [ilegible].
- Las figuras sin texto se describen en una sola línea entre corchetes, por ejemplo [Figura: gráfico de barras].
- No añadas comentarios ni explicaciones.
- Empieza la transcripción de cada página con una línea exacta con su marcador, por ejemplo <<<PÁGINA 7>>>, y después el texto de esa página.`;

const canvasImport = () => import("@napi-rs/canvas");

type PdfDoc = Awaited<ReturnType<typeof getDocumentProxy>>;

async function renderPage(doc: PdfDoc, n: number) {
  const { width, height } = (await doc.getPage(n)).getViewport({ scale: 1 });
  const scale = TARGET_SIDE / Math.max(width, height);
  const png = await renderPageAsImage(doc, n, { canvasImport, scale });
  return new Uint8Array(png);
}

async function transcribeBatch(engine: Engine, doc: PdfDoc, batch: number[]): Promise<Map<number, string>> {
  const content: Extract<ModelMessage, { role: "user" }>["content"] = [{ type: "text", text: OCR_PROMPT }];
  for (const n of batch) {
    content.push({ type: "text", text: `Página ${n}:` });
    content.push({ type: "image", image: await renderPage(doc, n), mediaType: "image/png" });
  }
  const { text } = await generateText({
    model: resolveModel(engine, "haiku"),
    messages: [{ role: "user", content }],
  });
  return parseTranscription(text, batch);
}

export interface OcrResult {
  text: string;
  /** Set when OCR could not run (or only partly); the upload is kept with whatever text there is. */
  error?: string;
  ocrPages: number;
}

/**
 * Completes the per-page text of a PDF by OCR-ing (with Claude's vision) only the pages that have
 * no text layer. Never throws for OCR failures: the text layer is returned along with `error`.
 */
export async function extractWithOcr(pdfBytes: Uint8Array, pages: string[]): Promise<OcrResult> {
  const empty = findEmptyPages(pages);
  if (empty.length === 0) return { text: assemblePages(pages, new Map()), ocrPages: 0 };

  const { selected, skipped } = selectOcrPages(empty);
  const ocr = new Map<number, string>();
  let error: string | undefined;
  const engine = (getSetting("defaultEngine") ?? "cli") as Engine;
  let doc: PdfDoc;
  try {
    // pdf.js does not recognise Electron's utility process as Node and would fall back to the DOM
    // canvas, so hand it the @napi-rs/canvas factory explicitly.
    const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
    doc = await getDocumentProxy(pdfBytes, { CanvasFactory });
  } catch (e) {
    return { text: pages.join("\n\n"), error: e instanceof Error ? e.message : String(e), ocrPages: 0 };
  }
  const batches: number[][] = [];
  for (let i = 0; i < selected.length; i += PAGES_PER_REQUEST) batches.push(selected.slice(i, i + PAGES_PER_REQUEST));

  let next = 0;
  const worker = async () => {
    while (next < batches.length && !error) {
      const batch = batches[next++]!;
      try {
        for (const [n, text] of await transcribeBatch(engine, doc, batch)) ocr.set(n, text);
      } catch (e) {
        error ??= e instanceof Error ? e.message : String(e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  const missing = selected.filter((n) => !ocr.has(n));
  if (missing.length > 0 && !error) error = `El OCR no devolvió texto para las páginas ${missing.join(", ")}.`;
  return {
    // If nothing could be read, keep the plain text layer rather than a list of empty page markers.
    text: ocr.size === 0 ? pages.join("\n\n") : assemblePages(pages, ocr, skipped),
    error,
    ocrPages: ocr.size,
  };
}
