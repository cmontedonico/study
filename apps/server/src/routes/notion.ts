import { auth } from "@modelcontextprotocol/sdk/client/auth.js";
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { db, schema } from "../db.ts";
import { setSetting } from "../settings.ts";
import { isTrustedLocal, socketAddress, type AddressSource } from "../auth.ts";
import { callNotionTool, listNotionTools, resetNotionClient } from "../notion/client.ts";
import { exportThreadToNotion, NotionExportError, type NotionCaller, type Summarizer } from "../notion/export.ts";
import { buildSearchArgs, mapNotionError, parseSearchResults } from "../notion/markdown.ts";
import {
  clearNotionConnection,
  getNotionAccount,
  isNotionConnected,
  NOTION_MCP_URL,
  NotionOAuthProvider,
  saveNotionAccount,
  type NotionAccount,
} from "../notion/oauth.ts";

const LOCAL_ONLY = "Conéctalo desde la Mac";

function page(title: string, body: string, status: 200 | 400 = 200) {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem"><h2>${title}</h2><p>${body}</p>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

/** Best effort: the shape of the `notion-get-self` text is not documented, so accept JSON or plain text. */
export function parseAccount(text: string): NotionAccount {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const bot = (data.bot ?? {}) as Record<string, unknown>;
    const owner = (bot.owner ?? {}) as Record<string, unknown>;
    const ownerUser = (owner.user ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
    return {
      workspace: str(bot.workspace_name) ?? str(data.workspace_name),
      user: str(ownerUser.name) ?? str(data.name),
    };
  } catch {
    return {};
  }
}

async function refreshAccount(): Promise<NotionAccount> {
  try {
    const { text, isError } = await callNotionTool("notion-get-self");
    const account = isError ? {} : parseAccount(text);
    saveNotionAccount(account);
    return account;
  } catch {
    return getNotionAccount() ?? {};
  }
}

export interface NotionRouteDeps {
  call?: NotionCaller;
  summarize?: Summarizer;
}

export function notionRoutes(address: AddressSource = socketAddress, deps: NotionRouteDeps = {}) {
  const call = deps.call ?? callNotionTool;
  const routes = new Hono();

  // The redirect URI is localhost, so only the Mac itself can start, finish or undo the connection.
  const localOnly = async (c: Context, next: () => Promise<void>) => {
    if (!isTrustedLocal(c, address)) return c.json({ error: LOCAL_ONLY }, 403);
    return next();
  };

  routes.get("/status", async (c) => {
    if (!isNotionConnected()) return c.json({ connected: false });
    const account = getNotionAccount() ?? {};
    try {
      return c.json({ connected: true, ...account, tools: await listNotionTools() });
    } catch (err) {
      return c.json({ connected: isNotionConnected(), ...account, error: (err as Error).message });
    }
  });

  routes.post("/connect", localOnly, async (c) => {
    // Starting over: drop any previous grant so the SDK begins a fresh authorization.
    await resetNotionClient();
    clearNotionConnection();
    const provider = new NotionOAuthProvider();
    const result = await auth(provider, { serverUrl: NOTION_MCP_URL });
    if (result !== "REDIRECT" || !provider.authorizationUrl) {
      throw new Error("Notion no devolvió una URL de autorización");
    }
    return c.json({ url: provider.authorizationUrl.toString() });
  });

  routes.get("/callback", localOnly, async (c) => {
    const provider = new NotionOAuthProvider();
    // CSRF: only a callback carrying the state of an authorization this server started is accepted.
    if (!provider.matchesPendingState(c.req.query("state"))) {
      return page("Conexión no válida", "No hay ninguna conexión con Notion en curso. Iníciala desde Ajustes.", 400);
    }
    const error = c.req.query("error");
    const code = c.req.query("code");
    if (error || !code) {
      provider.clearPending();
      return page("Notion no se ha conectado", "La autorización se canceló o fue rechazada. Puedes cerrar esta pestaña.", 400);
    }
    try {
      await auth(provider, { serverUrl: NOTION_MCP_URL, authorizationCode: code });
    } catch (err) {
      provider.clearPending();
      return page("Error al conectar con Notion", (err as Error).message.replace(/</g, "&lt;"), 400);
    } finally {
      provider.clearPending();
    }
    await resetNotionClient();
    await refreshAccount();
    return page("Notion conectado", "Ya puedes cerrar esta pestaña y volver a StudyLab.");
  });

  routes.post("/disconnect", localOnly, async (c) => {
    await resetNotionClient();
    clearNotionConnection();
    return c.json({ connected: false });
  });

  // Harmless read-only call, to confirm that the connection and the granted access work.
  routes.post("/test", async (c) => {
    const { text, isError } = await callNotionTool("notion-get-self");
    if (!isError) saveNotionAccount(parseAccount(text));
    return c.json({ ok: !isError, result: text.slice(0, 2000) });
  });

  // Pages the user can pick as the export destination.
  routes.get("/pages", async (c) => {
    const query = (c.req.query("q") ?? "").trim();
    if (!query) return c.json({ pages: [] });
    let result;
    try {
      result = await call("notion-search", buildSearchArgs(query));
    } catch (err) {
      return c.json({ error: mapNotionError((err as Error).message) }, 400);
    }
    if (result.isError) return c.json({ error: mapNotionError(result.text) }, 400);
    return c.json({ pages: parseSearchResults(result.text) });
  });

  routes.post("/export/:threadId", async (c) => {
    const body = z
      .object({
        parentId: z.string().min(1),
        parentTitle: z.string().optional(),
        mode: z.enum(["full", "summary", "both"]),
        title: z.string().trim().min(1),
      })
      .parse(await c.req.json());
    const threadId = c.req.param("threadId");
    const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, threadId) });
    if (!thread) return c.json({ error: "Hilo no encontrado" }, 404);
    if (!deps.call && !isNotionConnected()) {
      return c.json({ error: "Notion no está conectado. Conéctalo en Ajustes" }, 400);
    }
    try {
      const { url } = await exportThreadToNotion({ ...body, threadId }, { call, summarize: deps.summarize });
      db.update(schema.threads).set({ notionUrl: url }).where(eq(schema.threads.id, threadId)).run();
      setSetting("notionExportParent", JSON.stringify({ id: body.parentId, title: body.parentTitle ?? "" }));
      return c.json({ url });
    } catch (err) {
      if (err instanceof NotionExportError && err.url) {
        // The page exists, only later parts are missing: keep the link so the user can find it.
        db.update(schema.threads).set({ notionUrl: err.url }).where(eq(schema.threads.id, threadId)).run();
      }
      return c.json({ error: (err as Error).message }, 400);
    }
  });

  return routes;
}
