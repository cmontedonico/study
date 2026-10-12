import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Hono } from "hono";
import type { NotionToolResult } from "../notion/client.ts";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-notion-export-"));
const { db, schema } = await import("../db.ts");
const { notionRoutes } = await import("./notion.ts");
const { publicSettings } = await import("../settings.ts");
const { eq } = await import("drizzle-orm");

interface Call {
  name: string;
  args: Record<string, unknown>;
}
const PAGE = "3eade604ac9b81c0aca2e58d55a4d213";
const URL = `https://www.notion.so/${PAGE}`;

function setup(respond: (call: Call, n: number) => NotionToolResult | Error) {
  const calls: Call[] = [];
  const app = new Hono().route(
    "/notion",
    notionRoutes(undefined, {
      call: async (name, args) => {
        calls.push({ name, args });
        const r = respond({ name, args }, calls.length);
        if (r instanceof Error) throw r;
        return r;
      },
      summarize: async (conversation) => `## Resumen\nresumen de ${conversation.length} caracteres`,
    }),
  );
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { calls, app, post };
}

function makeThread(id: string, texts: string[]) {
  db.insert(schema.threads).values({ id, title: "Álgebra" }).run();
  texts.forEach((text, position) =>
    db
      .insert(schema.messages)
      .values({
        id: `m${position}`,
        threadId: id,
        role: position % 2 ? "assistant" : "user",
        parts: [{ type: "text", text }],
        position,
      })
      .run(),
  );
}
const ok = (text: string): NotionToolResult => ({ text, isError: false });
const created = ok(JSON.stringify({ pages: [{ id: PAGE, url: URL }] }));
const threadUrl = (id: string) => db.select().from(schema.threads).where(eq(schema.threads.id, id)).get()?.notionUrl;

test("search: returns pages only and maps errors", async () => {
  const { post, app, calls } = setup(() =>
    ok(JSON.stringify({ results: [{ id: "a", title: "Mates", url: "u", type: "page" }, { id: "b", title: "DB", type: "database" }] })),
  );
  void post;
  const res = await app.request("/notion/pages?q=mates");
  assert.deepEqual(await res.json(), { pages: [{ id: "a", title: "Mates", url: "u" }] });
  assert.equal(calls[0]?.name, "notion-search");
  assert.deepEqual((await (await app.request("/notion/pages?q=")).json()), { pages: [] });

  const failing = setup(() => new Error("401 Unauthorized"));
  const bad = await failing.app.request("/notion/pages?q=x");
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: "Vuelve a conectar Notion en Ajustes" });
});

test("export full: one create call, saves the url and the last parent", async () => {
  makeThread("t1", ["Hola $$x^2$$", "Respuesta\n\n```py\nprint(1)\n```"]);
  const { post, calls } = setup(() => created);
  const res = await post("/notion/export/t1", { parentId: "p1", parentTitle: "Mates", mode: "full", title: "Álgebra 11/10" });
  assert.deepEqual(await res.json(), { url: URL });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "notion-create-pages");
  const args = calls[0]?.args as { parent: unknown; pages: { properties: unknown; content: string }[] };
  assert.deepEqual(args.parent, { type: "page_id", page_id: "p1" });
  assert.deepEqual(args.pages[0]?.properties, { title: "Álgebra 11/10" });
  assert.ok(args.pages[0]?.content.includes("## Tú\nHola $`x^2`$\n## Claude\nRespuesta\n```py\nprint(1)\n```"));
  assert.equal(threadUrl("t1"), URL);
  assert.deepEqual(publicSettings().notionExportParent, { id: "p1", title: "Mates" });
});

test("export both: summary first, transcript in toggles, long chats are appended in parts", async () => {
  makeThread("t2", Array.from({ length: 200 }, (_, i) => `mensaje ${i} ${"palabra ".repeat(60)}`));
  const { post, calls } = setup((c) => (c.name === "notion-create-pages" ? created : ok("{}")));
  const res = await post("/notion/export/t2", { parentId: "p1", mode: "both", title: "Largo" });
  assert.deepEqual(await res.json(), { url: URL });
  assert.ok(calls.length > 2);
  assert.deepEqual(
    calls.slice(1).map((c) => [c.name, (c.args as { page_id: string }).page_id]),
    calls.slice(1).map(() => ["notion-update-page", PAGE]),
  );
  const first = (calls[0]?.args as { pages: { content: string }[] }).pages[0]?.content ?? "";
  assert.match(first, /^## Resumen\nresumen de \d+ caracteres/);
  const parts = calls.length - 1;
  assert.match((calls[1]?.args as { content: string }).content, new RegExp(`parte 1/${parts}`));
  for (const c of calls) assert.ok(JSON.stringify(c.args).length < 40_000);
});

test("export: a failing append keeps the page url and says it is incomplete", async () => {
  makeThread("t3", Array.from({ length: 120 }, (_, i) => `mensaje ${i} ${"palabra ".repeat(60)}`));
  const { post } = setup((c, n) => (n === 1 ? created : c.name === "notion-update-page" ? new Error("rate limit 429") : created));
  const res = await post("/notion/export/t3", { parentId: "p1", mode: "full", title: "Parcial" });
  assert.equal(res.status, 400);
  const { error } = (await res.json()) as { error: string };
  assert.match(error, /limitando/);
  assert.match(error, /incompleta/);
  assert.equal(threadUrl("t3"), URL);
});

test("export: no access and expired connection give Spanish messages", async () => {
  makeThread("t4", ["hola"]);
  const noAccess = setup(() => ({ text: "object_not_found: Could not find page", isError: true }));
  const r1 = await noAccess.post("/notion/export/t4", { parentId: "p", mode: "full", title: "x" });
  assert.match(((await r1.json()) as { error: string }).error, /Compártela con la integración de StudyLab/);
  assert.equal(threadUrl("t4"), null);

  const expired = setup(() => new Error("La sesión de Notion ha caducado. Vuelve a conectarla en Ajustes"));
  const r2 = await expired.post("/notion/export/t4", { parentId: "p", mode: "full", title: "x" });
  assert.deepEqual(await r2.json(), { error: "Vuelve a conectar Notion en Ajustes" });
});

test("export: unknown or empty threads are rejected", async () => {
  const { post } = setup(() => created);
  assert.equal((await post("/notion/export/nope", { parentId: "p", mode: "full", title: "x" })).status, 404);
  db.insert(schema.threads).values({ id: "empty" }).run();
  const res = await post("/notion/export/empty", { parentId: "p", mode: "full", title: "x" });
  assert.match(((await res.json()) as { error: string }).error, /vacío/);
});
