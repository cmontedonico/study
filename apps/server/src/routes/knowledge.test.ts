import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-knowledge-"));
const { api } = await import("./index.ts");
const { db, schema } = await import("../db.ts");
const { buildSystemPrompt, KNOWLEDGE_CHAR_LIMIT, toInstructions } = await import("../chat.ts");
const { eq } = await import("drizzle-orm");

interface Item {
  id: string;
  name: string;
  chars: number;
  warning?: string;
}

const project = (await (
  await api.request("/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "P" }),
  })
).json()) as { id: string };

function upload(file: File, projectId = project.id) {
  const form = new FormData();
  form.append("file", file);
  form.append("projectId", projectId);
  return api.request("/knowledge", { method: "POST", body: form });
}

test("upload, list and delete a text file", async () => {
  const res = await upload(new File(["El código secreto es PERA-42."], "notas.md"));
  assert.equal(res.status, 200);
  const item = (await res.json()) as Item;
  assert.equal(item.chars, 29);

  const list = (await (await api.request(`/knowledge?projectId=${project.id}`)).json()) as Item[];
  assert.deepEqual(list.map((f) => f.name), ["notas.md"]);

  const row = await db.query.files.findFirst({ where: eq(schema.files.id, item.id) });
  assert.ok(row && existsSync(row.path));
  assert.equal((await api.request(`/knowledge/${item.id}`, { method: "DELETE" })).status, 200);
  assert.equal(existsSync(row.path), false);
  assert.equal((await api.request(`/knowledge/${item.id}`, { method: "DELETE" })).status, 404);
});

test("rejects unsupported file types and unknown projects", async () => {
  const res = await upload(new File([new Uint8Array([1, 2, 3])], "foto.png", { type: "image/png" }));
  assert.equal(res.status, 400);
  assert.match(((await res.json()) as { error: string }).error, /no se puede usar como conocimiento/);
  assert.equal((await upload(new File(["x"], "a.txt"), "nope")).status, 400);
});

test("system prompt includes knowledge, caps its size and notes truncation", async () => {
  await upload(new File(["Hecho: la capital es Lima."], "a.txt"));
  let prompt = await buildSystemPrompt(project.id);
  assert.match(prompt ?? "", /la capital es Lima/);
  assert.doesNotMatch(prompt ?? "", /se truncó/);

  await upload(new File(["x".repeat(KNOWLEDGE_CHAR_LIMIT)], "grande.txt"));
  await upload(new File(["omitido"], "extra.txt"));
  prompt = await buildSystemPrompt(project.id);
  assert.match(prompt ?? "", /se truncó/);
  assert.match(prompt ?? "", /grande\.txt \(parcial\)/);
  assert.ok((prompt ?? "").length < KNOWLEDGE_CHAR_LIMIT + 2000);
});

test("API engine marks the system prompt as cacheable, CLI keeps a string", () => {
  assert.equal(toInstructions("hola", "cli"), "hola");
  assert.deepEqual(toInstructions("hola", "api"), {
    role: "system",
    content: "hola",
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });
});
