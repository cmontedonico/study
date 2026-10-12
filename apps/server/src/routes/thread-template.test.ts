import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-thread-template-"));
const { api } = await import("./index.ts");
const { buildSystemPrompt, composeInstructions } = await import("../chat.ts");
const { db, schema } = await import("../db.ts");
const { eq } = await import("drizzle-orm");

interface ThreadRow {
  id: string;
  templateId: string | null;
  templateName: string | null;
  templateIcon: string | null;
  templateInstructions: string | null;
}

const send = (path: string, method: string, body?: unknown) =>
  api.request(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const template = (await (
  await send("/templates", "POST", { name: "Tutor X", icon: "🎓", instructions: "Enseña paso a paso." })
).json()) as { id: string };

test("a clean chat has no template", async () => {
  const thread = (await (await send("/threads", "POST", {})).json()) as ThreadRow;
  assert.equal(thread.templateId, null);
  assert.equal(thread.templateInstructions, null);
  const explicit = (await (await send("/threads", "POST", { templateId: null })).json()) as ThreadRow;
  assert.equal(explicit.templateId, null);
});

test("creating a chat with a template stores a snapshot", async () => {
  const thread = (await (await send("/threads", "POST", { templateId: template.id })).json()) as ThreadRow;
  assert.equal(thread.templateId, template.id);
  assert.equal(thread.templateName, "Tutor X");
  assert.equal(thread.templateIcon, "🎓");
  assert.equal(thread.templateInstructions, "Enseña paso a paso.");
});

test("unknown template is rejected", async () => {
  assert.equal((await send("/threads", "POST", { templateId: "nope" })).status, 404);
});

test("forks keep the parent's template", async () => {
  const parent = (await (await send("/threads", "POST", { templateId: template.id })).json()) as ThreadRow;
  await db
    .insert(schema.messages)
    .values({ id: "m1", threadId: parent.id, role: "user", parts: "[]", position: 0 });
  const fork = (await (await send(`/threads/${parent.id}/fork`, "POST", { messageId: "m1" })).json()) as ThreadRow;
  assert.equal(fork.templateId, template.id);
  assert.equal(fork.templateInstructions, "Enseña paso a paso.");
});

test("the snapshot survives template edits and deletion; /state hides the prompt", async () => {
  const thread = (await (await send("/threads", "POST", { templateId: template.id })).json()) as ThreadRow;
  await send(`/templates/${template.id}`, "PATCH", { instructions: "Otra cosa." });
  await send(`/templates/${template.id}`, "DELETE");
  const row = await db.query.threads.findFirst({ where: eq(schema.threads.id, thread.id) });
  assert.equal(row?.templateInstructions, "Enseña paso a paso.");
  assert.equal(await buildSystemPrompt(null, row?.templateInstructions), "Enseña paso a paso.");

  const state = (await (await api.request("/state")).json()) as { threads: ThreadRow[] };
  const listed = state.threads.find((t) => t.id === thread.id);
  assert.equal(listed?.templateName, "Tutor X");
  assert.equal("templateInstructions" in (listed ?? {}), false);
});

test("system prompt: project first, then template; no duplicates", async () => {
  assert.deepEqual(composeInstructions("Proyecto.", "Plantilla."), ["Proyecto.", "Plantilla."]);
  assert.deepEqual(composeInstructions("Proyecto.", "  "), ["Proyecto."]);
  assert.deepEqual(composeInstructions(undefined, "Plantilla."), ["Plantilla."]);
  assert.deepEqual(composeInstructions("Misma.", "Misma."), ["Misma."]);
  assert.deepEqual(composeInstructions("A. Misma.", "Misma."), ["A. Misma."]);

  const project = (await (await send("/projects", "POST", { name: "P", instructions: "Del proyecto." })).json()) as {
    id: string;
  };
  await send(`/projects/${project.id}`, "PATCH", { instructions: "Del proyecto." });
  assert.equal(await buildSystemPrompt(project.id, "De la plantilla."), "Del proyecto.\n\nDe la plantilla.");
  assert.equal(await buildSystemPrompt(project.id, "Del proyecto."), "Del proyecto.");
  assert.equal(await buildSystemPrompt(null), undefined);
});
