import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { getSetting, setSetting, type SettingKey } from "../settings.ts";

export const NOTION_MCP_URL = "https://mcp.notion.com/mcp";
export const NOTION_SSE_URL = "https://mcp.notion.com/sse";
/** A pending authorization older than this is ignored (the user abandoned the browser tab). */
const PENDING_TTL_MS = 10 * 60 * 1000;

export function notionRedirectUrl(port = Number(process.env.PORT ?? 4317)): string {
  return `http://localhost:${port}/api/notion/callback`;
}

function readJson<T>(key: SettingKey): T | undefined {
  const raw = getSetting(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

interface PendingAuth {
  state: string;
  verifier?: string;
  createdAt: number;
}

/**
 * OAuth provider for Notion's MCP server backed by the settings table. Tokens and the dynamic client
 * registration never leave the server; the SDK refreshes the access token through `tokens()`/`saveTokens()`.
 */
export class NotionOAuthProvider implements OAuthClientProvider {
  /** Set by `redirectToAuthorization`, so the route can hand the URL to the UI instead of redirecting. */
  authorizationUrl: URL | undefined;

  constructor(private readonly redirect = notionRedirectUrl()) {}

  get redirectUrl(): string {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "StudyLab",
      redirect_uris: [this.redirect],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  private pending(): PendingAuth | undefined {
    return readJson<PendingAuth>("notionPending");
  }

  /** Generates and stores the CSRF state; the callback only accepts this exact, recent value. */
  state(): string {
    const state = randomBytes(24).toString("base64url");
    setSetting("notionPending", JSON.stringify({ state, createdAt: Date.now() } satisfies PendingAuth));
    return state;
  }

  /** True when `state` matches the pending authorization started from this server. */
  matchesPendingState(state: string | undefined): boolean {
    const p = this.pending();
    return Boolean(state && p && p.state === state && Date.now() - p.createdAt < PENDING_TTL_MS);
  }

  clearPending() {
    setSetting("notionPending", null);
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const info = readJson<OAuthClientInformationMixed>("notionClient");
    // A registration made for another port would be rejected for its redirect_uri: register again.
    if (info && "redirect_uris" in info && !info.redirect_uris?.map(String).includes(this.redirect)) return undefined;
    return info;
  }

  saveClientInformation(info: OAuthClientInformationMixed) {
    setSetting("notionClient", JSON.stringify(info));
  }

  tokens(): OAuthTokens | undefined {
    return readJson<OAuthTokens>("notionTokens");
  }

  saveTokens(tokens: OAuthTokens) {
    setSetting("notionTokens", JSON.stringify(tokens));
  }

  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }

  saveCodeVerifier(verifier: string) {
    const p = this.pending();
    if (p) setSetting("notionPending", JSON.stringify({ ...p, verifier }));
  }

  codeVerifier(): string {
    const verifier = this.pending()?.verifier;
    if (!verifier) throw new Error("No hay una conexión con Notion en curso");
    return verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "tokens") setSetting("notionTokens", null);
    if (scope === "all" || scope === "client") setSetting("notionClient", null);
    if (scope === "all" || scope === "verifier") this.clearPending();
  }
}

export interface NotionAccount {
  workspace?: string;
  user?: string;
}

export function getNotionAccount(): NotionAccount | undefined {
  return readJson<NotionAccount>("notionAccount");
}

export function saveNotionAccount(account: NotionAccount | null) {
  setSetting("notionAccount", account ? JSON.stringify(account) : null);
}

export function isNotionConnected(): boolean {
  return Boolean(getSetting("notionTokens"));
}

/** Drops tokens, client registration, pending state and account info. */
export function clearNotionConnection() {
  new NotionOAuthProvider().invalidateCredentials("all");
  saveNotionAccount(null);
}
