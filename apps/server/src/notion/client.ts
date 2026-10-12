import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  clearNotionConnection,
  isNotionConnected,
  NOTION_MCP_URL,
  NOTION_SSE_URL,
  NotionOAuthProvider,
} from "./oauth.ts";

export const NOT_CONNECTED = "Notion no está conectado";

let cached: Promise<Client> | undefined;

/** Streamable HTTP first, SSE as a fallback, as Notion recommends. */
async function connect(): Promise<Client> {
  const provider = new NotionOAuthProvider();
  const attempts: (() => Transport)[] = [
    () => new StreamableHTTPClientTransport(new URL(NOTION_MCP_URL), { authProvider: provider }),
    () => new SSEClientTransport(new URL(NOTION_SSE_URL), { authProvider: provider }),
  ];
  let lastError: unknown;
  for (const make of attempts) {
    const client = new Client({ name: "studylab", version: "1.0.0" });
    try {
      await client.connect(make());
      return client;
    } catch (err) {
      lastError = err;
      await client.close().catch(() => undefined);
      if (err instanceof UnauthorizedError) break; // another transport will not fix the auth
    }
  }
  if (lastError instanceof UnauthorizedError) {
    // Refresh failed for good (invalid_grant, revoked...): the user has to connect again.
    clearNotionConnection();
    throw new Error("La sesión de Notion ha caducado. Vuelve a conectarla en Ajustes");
  }
  throw new Error(`No se pudo conectar con Notion: ${(lastError as Error)?.message ?? "error desconocido"}`);
}

/** Connected MCP client (shared, so token refreshes are serialized). Throws if Notion is not connected. */
export function getNotionClient(): Promise<Client> {
  if (!isNotionConnected()) return Promise.reject(new Error(NOT_CONNECTED));
  cached ??= connect().catch((err) => {
    cached = undefined;
    throw err;
  });
  return cached;
}

/** Closes the shared client; the next call reconnects with the stored tokens. */
export async function resetNotionClient() {
  const pending = cached;
  cached = undefined;
  if (pending) await (await pending.catch(() => undefined))?.close().catch(() => undefined);
}

export interface NotionToolResult {
  text: string;
  isError: boolean;
}

/** Calls a Notion MCP tool and returns its text content. Used by the connection test and by exports. */
export async function callNotionTool(name: string, args: Record<string, unknown> = {}): Promise<NotionToolResult> {
  const client = await getNotionClient();
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (err) {
    await resetNotionClient(); // maybe a dead session: reconnect next time
    throw err;
  }
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
    .filter(Boolean)
    .join("\n");
  return { text, isError: Boolean(result.isError) };
}

export async function listNotionTools(): Promise<string[]> {
  const client = await getNotionClient();
  return (await client.listTools()).tools.map((t) => t.name);
}
