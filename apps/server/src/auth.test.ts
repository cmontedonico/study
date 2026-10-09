import assert from "node:assert/strict";
import { test } from "node:test";
import { Hono } from "hono";
import { accessAuth, isLoopback, TOKEN_COOKIE } from "./auth.ts";

const TOKEN = "secret-token";
const LOCAL = { host: "localhost:4317" };

function makeApp(address: string) {
  const app = new Hono();
  app.use("*", accessAuth({ getToken: () => TOKEN, address: () => address }));
  app.get("/api/ping", (c) => c.json({ ok: true }));
  app.get("/", (c) => c.text("shell"));
  return app;
}

test("isLoopback recognises loopback addresses only", () => {
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(isLoopback("::1"), true);
  assert.equal(isLoopback("::ffff:127.0.0.1"), true);
  assert.equal(isLoopback("192.168.0.5"), false);
  assert.equal(isLoopback(undefined), false);
});

test("loopback is always allowed", async () => {
  assert.equal((await makeApp("127.0.0.1").request("/api/ping", { headers: LOCAL })).status, 200);
  assert.equal((await makeApp("::1").request("/api/ping", { headers: { host: "[::1]:4317" } })).status, 200);
});

test("remote without token gets 401 on the API but can load static files", async () => {
  const app = makeApp("100.64.0.2");
  assert.equal((await app.request("/api/ping")).status, 401);
  assert.equal((await app.request("/")).status, 200);
});

test("bearer token is accepted, a wrong one is not", async () => {
  const app = makeApp("100.64.0.2");
  const ok = await app.request("/api/ping", { headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(ok.status, 200);
  const bad = await app.request("/api/ping", { headers: { authorization: "Bearer nope" } });
  assert.equal(bad.status, 401);
});

test("?token= sets an httpOnly cookie and redirects without the query", async () => {
  const res = await makeApp("100.64.0.2").request(`/?foo=1&token=${TOKEN}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/?foo=1");
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, new RegExp(`${TOKEN_COOKIE}=${TOKEN}`));
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=\d+/i);
});

test("a wrong ?token= sets no cookie", async () => {
  const res = await makeApp("100.64.0.2").request("/?token=wrong");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("set-cookie"), null);
});

test("cookie authenticates API requests", async () => {
  const app = makeApp("100.64.0.2");
  const ok = await app.request("/api/ping", { headers: { cookie: `${TOKEN_COOKIE}=${TOKEN}` } });
  assert.equal(ok.status, 200);
  const bad = await app.request("/api/ping", { headers: { cookie: `${TOKEN_COOKIE}=old` } });
  assert.equal(bad.status, 401);
});

test("loopback with proxy headers is treated as remote (tailscale serve/funnel)", async () => {
  const app = makeApp("127.0.0.1");
  const variants: Record<string, string>[] = [
    { "x-forwarded-for": "100.64.0.2" },
    { forwarded: "for=1.2.3.4" },
    { "x-real-ip": "1.2.3.4" },
    { "tailscale-user-login": "a@b.c" },
  ];
  for (const h of variants) {
    assert.equal((await app.request("/api/ping", { headers: { ...LOCAL, ...h } })).status, 401);
    const ok = await app.request("/api/ping", { headers: { ...LOCAL, ...h, authorization: `Bearer ${TOKEN}` } });
    assert.equal(ok.status, 200);
  }
});

test("loopback with a non-local Host (DNS rebinding) needs the token", async () => {
  const app = makeApp("127.0.0.1");
  assert.equal((await app.request("/api/ping", { headers: { host: "evil.example:4317" } })).status, 401);
  assert.equal((await app.request("/api/ping", { headers: { host: "127.0.0.1:4317" } })).status, 200);
  assert.equal((await app.request("/api/ping", { headers: { host: "localhost" } })).status, 200);
});

test("cross-origin writes are rejected, same-origin and origin-less ones pass", async () => {
  const app = new Hono();
  app.use("*", accessAuth({ getToken: () => TOKEN, address: () => "127.0.0.1" }));
  app.post("/api/chat", (c) => c.json({ ok: true }));
  app.get("/api/ping", (c) => c.json({ ok: true }));
  const post = (headers: Record<string, string>) => app.request("/api/chat", { method: "POST", headers: { ...LOCAL, ...headers } });
  assert.equal((await post({ origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ origin: "null" })).status, 403);
  assert.equal((await post({ origin: "http://localhost:5173" })).status, 403);
  assert.equal((await post({ origin: "http://localhost:4317" })).status, 200);
  assert.equal((await post({})).status, 200);
  const get = await app.request("/api/ping", { headers: { ...LOCAL, origin: "https://evil.example" } });
  assert.equal(get.status, 200);
});
