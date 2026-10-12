import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-notion-"));
const { NotionOAuthProvider, clearNotionConnection, isNotionConnected } = await import("./oauth.ts");
const { getNotionClient, NOT_CONNECTED } = await import("./client.ts");
const { notionRoutes, parseAccount } = await import("../routes/notion.ts");
const { getSetting } = await import("../settings.ts");

const REDIRECT = "http://localhost:4317/api/notion/callback";

test("provider stores and loads tokens and client information", () => {
  const p = new NotionOAuthProvider(REDIRECT);
  assert.equal(p.tokens(), undefined);
  assert.equal(p.clientInformation(), undefined);

  p.saveTokens({ access_token: "a", refresh_token: "r", token_type: "bearer" });
  p.saveClientInformation({ client_id: "cid", redirect_uris: [REDIRECT] });
  assert.equal(p.tokens()?.refresh_token, "r");
  assert.equal(p.clientInformation()?.client_id, "cid");
  assert.ok(isNotionConnected());

  // Registered for another port: must register again.
  assert.equal(new NotionOAuthProvider("http://localhost:9999/api/notion/callback").clientInformation(), undefined);
});

test("code verifier needs a pending authorization, and state is validated", () => {
  clearNotionConnection();
  const p = new NotionOAuthProvider(REDIRECT);
  assert.throws(() => p.codeVerifier());
  assert.equal(p.matchesPendingState("x"), false);

  const state = p.state();
  p.saveCodeVerifier("verifier-1");
  assert.equal(p.codeVerifier(), "verifier-1");
  assert.equal(p.matchesPendingState(state), true);
  assert.equal(p.matchesPendingState("other"), false);
  assert.equal(p.matchesPendingState(undefined), false);

  p.clearPending();
  assert.equal(p.matchesPendingState(state), false);
});

test("invalidateCredentials clears tokens", () => {
  const p = new NotionOAuthProvider(REDIRECT);
  p.saveTokens({ access_token: "a", token_type: "bearer" });
  p.invalidateCredentials("tokens");
  assert.equal(p.tokens(), undefined);
});

test("getNotionClient rejects with a Spanish error when disconnected", async () => {
  clearNotionConnection();
  await assert.rejects(getNotionClient(), { message: NOT_CONNECTED });
});

test("status route when disconnected", async () => {
  clearNotionConnection();
  const res = await notionRoutes(() => "127.0.0.1").request("/status", { headers: { host: "localhost:4317" } });
  assert.deepEqual(await res.json(), { connected: false });
});

test("connect, callback and disconnect are refused from a remote client", async () => {
  const routes = notionRoutes(() => "100.64.0.5");
  for (const [method, path] of [
    ["POST", "/connect"],
    ["GET", "/callback?state=x&code=y"],
    ["POST", "/disconnect"],
  ] as const) {
    const res = await routes.request(path, { method, headers: { host: "100.64.0.5:4317" } });
    assert.equal(res.status, 403, path);
  }
});

test("callback without a pending state is rejected and exchanges nothing", async () => {
  clearNotionConnection();
  const routes = notionRoutes(() => "127.0.0.1");
  const res = await routes.request("/callback?state=forged&code=abc", { headers: { host: "localhost:4317" } });
  assert.equal(res.status, 400);
  assert.equal(getSetting("notionTokens"), undefined);
});

test("parseAccount tolerates non-JSON text", () => {
  assert.deepEqual(parseAccount("hola"), {});
  assert.deepEqual(parseAccount(JSON.stringify({ bot: { workspace_name: "WS", owner: { user: { name: "Ana" } } } })), {
    workspace: "WS",
    user: "Ana",
  });
});
