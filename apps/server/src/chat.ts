import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { and, eq } from "drizzle-orm";
import { mkdirSync } from "node:fs";
import { nanoid } from "nanoid";
import { join } from "node:path";
import { db, schema } from "./db.ts";
import { asDocumentText, getFile, readAsDataUrl } from "./files.ts";
import { apiModelIds, isModelAlias } from "./models.ts";
import { dataDir } from "./paths.ts";
import { getSetting } from "./settings.ts";

type Engine = "cli" | "api";

/** Empty working dir so the CLI never picks up CLAUDE.md or files from elsewhere. */
const cliCwd = join(dataDir, "cli-sandbox");
mkdirSync(cliCwd, { recursive: true });

function resolveModel(engine: Engine, alias: string) {
  const model = isModelAlias(alias) ? alias : "sonnet";
  if (engine === "cli") {
    return claudeCode(model, {
      cwd: cliCwd,
      tools: [], // v1: chat only, no file or shell tools
      maxTurns: 1,
      persistSession: false,
      sdkOptions: { strictMcpConfig: true }, // ignore the user's MCP servers / claude.ai connectors
    });
  }
  const apiKey = getSetting("anthropicApiKey");
  if (!apiKey) throw new Error("Falta la API key de Anthropic (Ajustes).");
  return createAnthropic({ apiKey })(apiModelIds[model]);
}

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
          return { type: "text" as const, text: asDocumentText(file) };
        }),
      ),
    })),
  );
}

async function buildSystemPrompt(projectId: string | null) {
  if (!projectId) return undefined;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) return undefined;
  const knowledge = await db.query.files.findMany({ where: eq(schema.files.projectId, projectId) });
  const sections = [project.instructions.trim()];
  if (knowledge.length) {
    sections.push(
      "Conocimiento del proyecto (documentos de referencia):",
      ...knowledge.filter((f) => f.extractedText).map(asDocumentText),
    );
  }
  return sections.filter(Boolean).join("\n\n") || undefined;
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
    model: resolveModel(engine, thread.model),
    instructions: await buildSystemPrompt(thread.projectId),
    messages: await convertToModelMessages(await resolveFileParts(messages, engine)),
    abortSignal,
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: nanoid,
    onEnd: ({ messages: finalMessages }) => saveThreadMessages(threadId, finalMessages),
    onError: (error) => (error instanceof Error ? error.message : String(error)),
  });
}
