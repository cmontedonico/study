import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// The data dir must be set before the db module is first imported.
process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-threads-test-"));

const { db, schema } = await import("../db.ts");
const { threadRoutes } = await import("./threads.ts");
const { Hono } = await import("hono");
const app = new Hono().route("/threads", threadRoutes);

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("fork copies messages up to the chosen one", async () => {
  db.insert(schema.threads).values({ id: "t1", title: "Original", model: "haiku", engine: "cli" }).run();
  ["m1", "m2", "m3"].forEach((id, position) =>
    db
      .insert(schema.messages)
      .values({
        id,
        threadId: "t1",
        role: position % 2 ? "assistant" : "user",
        parts: [{ type: "text", text: id }],
        position,
      })
      .run(),
  );

  const res = await post("/threads/t1/fork", { messageId: "m2" });
  assert.equal(res.status, 200);
  const forked = (await res.json()) as {
    id: string;
    title: string;
    model: string;
    parentThreadId: string;
    forkedFromMessageId: string;
  };
  assert.equal(forked.title, "Original (rama)");
  assert.equal(forked.model, "haiku");
  assert.equal(forked.parentThreadId, "t1");
  assert.equal(forked.forkedFromMessageId, "m2");

  const msgs = (await (await app.request(`/threads/${forked.id}/messages`)).json()) as { id: string }[];
  assert.deepEqual(
    msgs.map((m) => m.id),
    ["m1", "m2"],
  );
  const original = (await (await app.request("/threads/t1/messages")).json()) as unknown[];
  assert.equal(original.length, 3);
});

test("fork rejects unknown message or thread", async () => {
  const app2 = new Hono().onError((err, c) => c.json({ error: err.message }, 400)).route("/threads", threadRoutes);
  const bad = (path: string, messageId: string) =>
    app2.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
  assert.equal((await bad("/threads/t1/fork", "nope")).status, 400);
  assert.equal((await bad("/threads/zzz/fork", "m1")).status, 400);
});
