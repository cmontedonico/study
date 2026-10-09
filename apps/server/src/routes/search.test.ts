import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import type { Hono } from "hono";

interface Hit {
  threadId: string;
  title: string;
  projectId: string | null;
  snippet: string;
}

let app: Hono;
let search: (q: string) => Promise<Hit[]>;

before(async () => {
  process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-search-test-"));
  const { db, schema, reindexThread } = await import("../db.ts");
  const { api } = await import("./index.ts");
  const { Hono } = await import("hono");
  app = new Hono().route("/api", api);

  await db.insert(schema.projects).values({ id: "p1", name: "Proyecto" });
  await db.insert(schema.threads).values([
    { id: "t1", title: "Charla sobre finanzas", projectId: "p1" },
    { id: "t2", title: "Receta de paella" },
  ]);
  await db.insert(schema.messages).values([
    {
      id: "m1",
      threadId: "t1",
      role: "user",
      position: 0,
      parts: [{ type: "text", text: "¿Cómo se calcula el interés compuesto?" }],
    },
    {
      id: "m2",
      threadId: "t2",
      role: "assistant",
      position: 0,
      parts: [
        { type: "reasoning", text: "secretword" },
        { type: "text", text: "Usa arroz bomba y azafrán." },
      ],
    },
  ]);
  reindexThread("t1");
  reindexThread("t2");

  search = async (q) => {
    const res = await app.request(`/api/search?q=${encodeURIComponent(q)}`);
    assert.equal(res.status, 200);
    return (await res.json()) as Hit[];
  };
});

test("matches regardless of accents", async () => {
  const hits = await search("interes");
  assert.deepEqual(hits.map((h) => h.threadId), ["t1"]);
  assert.match(hits[0]!.snippet, /<mark>interés<\/mark>/);
  assert.equal(hits[0]!.projectId, "p1");
});

test("matches prefixes", async () => {
  assert.deepEqual((await search("compu")).map((h) => h.threadId), ["t1"]);
});

test("matches thread titles", async () => {
  assert.deepEqual((await search("paella")).map((h) => h.threadId), ["t2"]);
});

test("indexes text parts only", async () => {
  assert.deepEqual(await search("secretword"), []);
  assert.deepEqual((await search("azafran")).map((h) => h.threadId), ["t2"]);
});

test("rename updates the index", async () => {
  const res = await app.request("/api/threads/t2", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Cocina valenciana" }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual((await search("paella")).map((h) => h.threadId), []);
  assert.deepEqual((await search("valenciana")).map((h) => h.threadId), ["t2"]);
});

test("hostile input never errors", async () => {
  for (const q of ['"', "*", "OR (", '" OR 1=1 --', "NEAR(", "a AND", "^x", "title:foo", "(((", "", "   "]) {
    const hits = await search(q);
    assert.ok(Array.isArray(hits), q);
  }
  assert.deepEqual((await search('"interes" ((')).map((h) => h.threadId), ["t1"]);
});
