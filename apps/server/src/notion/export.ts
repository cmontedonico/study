import { generateText } from "ai";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "../db.ts";
import { getFile } from "../files.ts";
import { resolveModel, type Engine } from "../model.ts";
import { getSetting } from "../settings.ts";
import { callNotionTool, type NotionToolResult } from "./client.ts";
import {
  attachmentBlocks,
  buildAppendArgs,
  buildCreateArgs,
  conversationBlocks,
  conversationSource,
  mapNotionError,
  parseCreatedPage,
  planPageContent,
  type ChatItem,
  type ExportMode,
} from "./markdown.ts";

export type NotionCaller = (name: string, args: Record<string, unknown>) => Promise<NotionToolResult>;
export type Summarizer = (conversation: string) => Promise<string>;

/** Longest conversation sent to the model for the summary (the oldest part is dropped beyond this). */
const MAX_SUMMARY_INPUT = 400_000;

export const summarySystem = `Conviertes una conversación de estudio entre "Tú" (el estudiante) y "Claude" en una nota de estudio estructurada, en español, para guardarla en Notion y no perder lo aprendido.

Estructura (omite las secciones que no apliquen):
## Resumen
Dos o tres frases con el tema y lo esencial.
## Conceptos clave
Viñetas con cada concepto y una explicación breve y exacta.
## Explicaciones
Los razonamientos importantes, paso a paso, con ejemplos si los hubo.
## Ejercicios y soluciones
Cada ejercicio con su enunciado y su solución desarrollada.
## Preguntas abiertas
Dudas sin resolver y qué estudiar a continuación.

Reglas:
- Fiel a la conversación: no inventes contenido ni correcciones.
- Fórmulas en LaTeX con dobles dólares: $$...$$ (en su propia línea para fórmulas grandes). Un solo $ solo para importes de dinero.
- Markdown normal (encabezados ##, viñetas, **negrita**, tablas, bloques de código con lenguaje). No pongas un título de página arriba.
- Responde solo con la nota, sin preámbulo.`;

export async function summarizeConversation(conversation: string): Promise<string> {
  const engine = (getSetting("defaultEngine") ?? "cli") as Engine;
  const input = conversation.length > MAX_SUMMARY_INPUT ? conversation.slice(-MAX_SUMMARY_INPUT) : conversation;
  const { text } = await generateText({
    model: resolveModel(engine, "sonnet"),
    system: summarySystem,
    prompt: `Conversación:\n<conversacion>\n${input}\n</conversacion>`,
  });
  if (!text.trim()) throw new Error("La IA no generó el resumen. Inténtalo de nuevo.");
  return text.trim();
}

/** Reads a thread's messages as plain items, resolving attachments (audio transcripts included). */
export async function loadChatItems(threadId: string): Promise<ChatItem[]> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(asc(schema.messages.position));
  const items: ChatItem[] = [];
  for (const row of rows) {
    if (row.role === "system") continue;
    const item: ChatItem = { role: row.role, text: "", attachments: [] };
    const texts: string[] = [];
    for (const part of row.parts as { type: string; text?: string; url?: string; filename?: string }[]) {
      if (part.type === "text" && part.text) texts.push(part.text);
      if (part.type === "file") {
        const stored = part.url?.startsWith("/api/files/") ? await getFile(part.url.slice("/api/files/".length)) : undefined;
        const name = stored?.name ?? part.filename ?? "archivo";
        const transcript = stored && stored.mediaType.startsWith("audio/") ? (stored.extractedText ?? undefined) : undefined;
        item.attachments.push({ name, transcript });
      }
    }
    item.text = texts.join("\n\n");
    if (item.text || item.attachments.length) items.push(item);
  }
  return items;
}

export class NotionExportError extends Error {
  constructor(
    message: string,
    /** Set when the page already exists but later parts failed. */
    readonly url?: string,
  ) {
    super(message);
  }
}

const failed = (result: NotionToolResult): string => result.text || "error desconocido";

export interface ExportInput {
  threadId: string;
  parentId: string;
  mode: ExportMode;
  title: string;
}

/** Creates the Notion page (first chunk) and appends the remaining chunks. Returns the page URL. */
export async function exportThreadToNotion(
  input: ExportInput,
  deps: { call?: NotionCaller; summarize?: Summarizer; items?: ChatItem[] } = {},
): Promise<{ url: string; parts: number }> {
  const call = deps.call ?? callNotionTool;
  const summarize = deps.summarize ?? summarizeConversation;
  const items = deps.items ?? (await loadChatItems(input.threadId));
  if (!items.length) throw new Error("El chat está vacío: no hay nada que exportar");

  const summary = input.mode === "full" ? undefined : await summarize(conversationSource(items));
  const chunks = planPageContent({
    mode: input.mode,
    summary,
    transcript: conversationBlocks(items),
    attachments: attachmentBlocks(items),
  });
  const [first = "", ...rest] = chunks;

  const run = async (name: string, args: Record<string, unknown>, url?: string) => {
    let result: NotionToolResult;
    try {
      result = await call(name, args);
    } catch (err) {
      throw new NotionExportError(partial(mapNotionError((err as Error).message), url), url);
    }
    if (result.isError) throw new NotionExportError(partial(mapNotionError(failed(result)), url), url);
    return result;
  };
  const partial = (message: string, url?: string) =>
    url ? `${message}. La página se creó pero está incompleta: ${url}` : message;

  const created = await run("notion-create-pages", buildCreateArgs(input.parentId, input.title, first));
  const page = parseCreatedPage(created.text);
  if (!page) throw new NotionExportError("Notion no devolvió la URL de la página creada");

  for (const chunk of rest) await run("notion-update-page", buildAppendArgs(page.id, chunk), page.url);
  return { url: page.url, parts: chunks.length };
}
