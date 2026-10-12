import {
  convertToModelMessages,
  generateText,
  streamText,
  type LanguageModelUsage,
  type ProviderMetadata,
  type UIMessage,
} from "ai";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, reindexThread, schema } from "./db.ts";
import { asAudioTranscript, asDocumentText, getFile, isAudio, readAsDataUrl } from "./files.ts";
import { effortProviderOptions, resolveModel, type Engine } from "./model.ts";
import { resolveModelId } from "./pricing.ts";

/**
 * Turns `/api/files/:id` references into something the model can read.
 * Images go inline; PDFs go inline on the API engine but as extracted text on
 * the CLI engine (the Agent SDK does not accept PDF parts); text files become text.
 */
async function resolveFileParts(messages: UIMessage[], engine: Engine): Promise<UIMessage[]> {
  return Promise.all(
    messages.map(async (message) => ({
      ...message,
      parts: await Promise.all(
        message.parts.map(async (part) => {
          if (part.type !== "file" || !part.url.startsWith("/api/files/")) return part;
          const file = await getFile(part.url.slice("/api/files/".length));
          if (!file) return { type: "text" as const, text: `[Archivo no encontrado: ${part.filename}]` };
          const nativePdf = engine === "api" && file.mediaType === "application/pdf";
          if (file.mediaType.startsWith("image/") || nativePdf) {
            return { ...part, url: await readAsDataUrl(file) };
          }
          if (isAudio(file.mediaType)) return { type: "text" as const, text: asAudioTranscript(file) };
          return { type: "text" as const, text: asDocumentText(file) };
        }),
      ),
    })),
  );
}

/** Max characters of project knowledge injected into the system prompt (~100k tokens). */
export const KNOWLEDGE_CHAR_LIMIT = 400_000;

/**
 * Chat-level template instructions go right after the project's own instructions and before the
 * knowledge documents. They are skipped when empty or when the project already carries the same text
 * (a chat created from the template its project was built from), so nothing is said twice.
 */
export function composeInstructions(
  projectInstructions: string | undefined,
  templateInstructions: string | null | undefined,
) {
  const project = projectInstructions?.trim() ?? "";
  const template = templateInstructions?.trim() ?? "";
  const duplicate = !template || project.includes(template);
  return [project, duplicate ? "" : template].filter(Boolean);
}

export async function buildSystemPrompt(projectId: string | null, templateInstructions?: string | null) {
  const project = projectId
    ? await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })
    : undefined;
  if (!project) return composeInstructions(undefined, templateInstructions).join("\n\n") || undefined;
  const knowledge = (
    await db.query.files.findMany({
      where: eq(schema.files.projectId, project.id),
      orderBy: asc(schema.files.createdAt),
    })
  ).filter((f) => f.extractedText);
  const sections = composeInstructions(project.instructions, templateInstructions);
  if (knowledge.length) {
    let remaining = KNOWLEDGE_CHAR_LIMIT;
    const docs: string[] = [];
    const incomplete: string[] = [];
    for (const file of knowledge) {
      const text = file.extractedText ?? "";
      if (remaining <= 0) {
        incomplete.push(file.name);
        continue;
      }
      const clipped = text.length > remaining;
      docs.push(asDocumentText({ name: file.name, extractedText: clipped ? text.slice(0, remaining) : text }));
      if (clipped) incomplete.push(`${file.name} (parcial)`);
      remaining -= text.length;
    }
    sections.push("Conocimiento del proyecto (documentos de referencia):", ...docs);
    if (incomplete.length) {
      sections.push(
        `Nota: el conocimiento del proyecto superó el límite de ${KNOWLEDGE_CHAR_LIMIT} caracteres y se truncó. Incompleto u omitido: ${incomplete.join(", ")}.`,
      );
    }
  }
  return sections.filter(Boolean).join("\n\n") || undefined;
}

/** On the API engine the system prompt is a cacheable message, so the knowledge is billed once per session. */
export function toInstructions(system: string | undefined, engine: Engine) {
  if (!system || engine !== "api") return system;
  return {
    role: "system" as const,
    content: system,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  };
}

function titleFrom(message: UIMessage | undefined) {
  const text = message?.parts.find((p) => p.type === "text")?.text.trim();
  if (!text) return undefined;
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

export async function saveThreadMessages(threadId: string, messages: UIMessage[]) {
  db.transaction((tx) => {
    tx.delete(schema.messages).where(eq(schema.messages.threadId, threadId)).run();
    messages.forEach((m, position) => {
      tx.insert(schema.messages)
        .values({ id: m.id, threadId, role: m.role, parts: m.parts, position })
        .run();
    });
    tx.update(schema.threads)
      .set({ updatedAt: Date.now() })
      .where(eq(schema.threads.id, threadId))
      .run();
  });
  reindexThread(threadId);
}

const textOfMessage = (m: UIMessage | undefined) =>
  m?.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n").trim() ?? "";

/**
 * Replaces the truncated-first-message title with a short Haiku summary. Only touches threads whose
 * title is still the automatic fallback, so manual renames (and earlier auto titles) are never overwritten.
 */
export async function generateThreadTitle(threadId: string, messages: UIMessage[]) {
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId) });
  if (!thread || thread.titleSource !== "auto") return;
  const firstUser = messages.find((m) => m.role === "user");
  const assistant = textOfMessage(messages.find((m) => m.role === "assistant"));
  if (!assistant || thread.title !== titleFrom(firstUser)) return;

  const { text } = await generateText({
    model: resolveModel(thread.engine as Engine, "haiku"),
    prompt:
      "Escribe un título de máximo 6 palabras, en español, sin comillas ni punto final, para esta conversación. " +
      "Responde solo con el título.\n\n" +
      `Usuario: ${textOfMessage(firstUser).slice(0, 500)}\n\nAsistente: ${assistant.slice(0, 500)}`,
  });
  const title = (text.trim().split("\n")[0] ?? "").replace(/^["'“”«»\s]+|["'“”«»\s.]+$/g, "").slice(0, 60);
  if (!title) return;
  const updated = await db
    .update(schema.threads)
    .set({ title })
    .where(
      and(
        eq(schema.threads.id, threadId),
        eq(schema.threads.titleSource, "auto"),
        eq(schema.threads.title, thread.title),
      ),
    )
    .returning({ id: schema.threads.id });
  if (updated.length) reindexThread(threadId);
}

/**
 * Stores the token usage of the assistant message just produced. Both engines report `inputTokens`
 * as fresh + cache read + cache write; the CLI engine also reports `total_cost_usd` in provider metadata.
 */
async function saveUsage(
  threadId: string,
  model: string,
  finalMessages: UIMessage[],
  result: { totalUsage: PromiseLike<LanguageModelUsage>; providerMetadata: PromiseLike<ProviderMetadata | undefined> },
) {
  const message = finalMessages.findLast((m) => m.role === "assistant");
  if (!message) return;
  const usage = await result.totalUsage;
  const cacheRead = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails.cacheWriteTokens ?? 0;
  const input = usage.inputTokenDetails.noCacheTokens ?? Math.max(0, (usage.inputTokens ?? 0) - cacheRead - cacheWrite);
  const output = usage.outputTokens ?? 0;
  if (!input && !cacheRead && !cacheWrite && !output) return;
  const cost = (await result.providerMetadata)?.["claude-code"]?.costUsd;
  const values = {
    threadId,
    messageId: message.id,
    model: resolveModelId(model),
    inputTokens: input,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
    outputTokens: output,
    costUsd: typeof cost === "number" ? cost : null,
  };
  await db
    .insert(schema.messageUsage)
    .values(values)
    .onConflictDoUpdate({ target: [schema.messageUsage.threadId, schema.messageUsage.messageId], set: values });
}

export async function handleChat(threadId: string, messages: UIMessage[], abortSignal: AbortSignal) {
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId) });
  if (!thread) throw new Error("Hilo no encontrado");

  if (thread.title === "Nuevo chat") {
    const title = titleFrom(messages.find((m) => m.role === "user"));
    if (title) {
      await db
        .update(schema.threads)
        .set({ title })
        .where(and(eq(schema.threads.id, threadId), eq(schema.threads.title, "Nuevo chat")));
    }
  }

  const engine = thread.engine as Engine;
  const result = streamText({
    model: resolveModel(engine, thread.model, thread.effort),
    providerOptions: effortProviderOptions(engine, thread.model, thread.effort),
    instructions: toInstructions(await buildSystemPrompt(thread.projectId, thread.templateInstructions), engine),
    messages: await convertToModelMessages(await resolveFileParts(messages, engine)),
    abortSignal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: nanoid,
    onEnd: async ({ messages: finalMessages }) => {
      await saveThreadMessages(threadId, finalMessages);
      await saveUsage(threadId, thread.model, finalMessages, result).catch((error) =>
        console.warn("[usage] could not save usage:", error instanceof Error ? error.message : error),
      );
      // Fire and forget: the stream must not wait for the title.
      generateThreadTitle(threadId, finalMessages).catch((error) =>
        console.warn("[title] could not generate title:", error instanceof Error ? error.message : error),
      );
    },
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
