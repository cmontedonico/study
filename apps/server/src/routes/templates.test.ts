import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-templates-"));
const { api } = await import("./index.ts");

const send = (method: string, path: string, body?: unknown) =>
  api.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

interface StateTemplate {
  id: string;
  name: string;
  instructions: string;
  customized: boolean;
  projectCount: number;
}
const getState = async () =>
  (await (await send("GET", "/state")).json()) as { templates: StateTemplate[]; hiddenTemplateCount: number };
const findInState = async (id: string) => (await getState()).templates.find((t) => t.id === id);

test("built-in edit persists across re-seed and can be restored", async () => {
  const { seedBuiltInTemplates } = await import("../db.ts");
  const original = (await findInState("en-blanco"))!;
  assert.equal(original.customized, false);

  const res = await send("PATCH", "/templates/en-blanco", { name: "Mi blanco", instructions: "X" });
  assert.equal(res.status, 200);
  seedBuiltInTemplates();
  const edited = (await findInState("en-blanco"))!;
  assert.deepEqual([edited.name, edited.instructions, edited.customized], ["Mi blanco", "X", true]);

  const restored = await send("POST", "/templates/en-blanco/restore");
  assert.equal(restored.status, 200);
  const back = (await findInState("en-blanco"))!;
  assert.deepEqual([back.name, back.instructions, back.customized], [original.name, original.instructions, false]);
});

test("restore is rejected for custom templates", async () => {
  const created = (await (await send("POST", "/templates", { name: "C" })).json()) as { id: string };
  assert.equal((await send("POST", `/templates/${created.id}/restore`)).status, 400);
  assert.equal((await send("POST", "/templates/nope/restore")).status, 404);
});

test("deleting a built-in hides it until restore-hidden", async () => {
  const { seedBuiltInTemplates } = await import("../db.ts");
  assert.equal((await send("DELETE", "/templates/en-blanco")).status, 200);
  seedBuiltInTemplates();
  let state = await getState();
  assert.equal(state.templates.some((t) => t.id === "en-blanco"), false);
  assert.equal(state.hiddenTemplateCount, 1);

  const res = (await (await send("POST", "/templates/restore-hidden")).json()) as { count: number };
  assert.equal(res.count, 1);
  state = await getState();
  assert.equal(state.templates.some((t) => t.id === "en-blanco"), true);
  assert.equal(state.hiddenTemplateCount, 0);
});

test("apply-to-projects overwrites only instructions of linked projects", async () => {
  const tpl = (await (await send("POST", "/templates", { name: "T", icon: "🧪", instructions: "v1" })).json()) as {
    id: string;
  };
  const make = async (templateId?: string) =>
    (await (await send("POST", "/projects", { name: "P", templateId })).json()) as { id: string };
  const linked = await make(tpl.id);
  const other = await make();
  assert.equal((await findInState(tpl.id))!.projectCount, 1);

  await send("PATCH", `/templates/${tpl.id}`, { instructions: "v2", icon: "🔥" });
  const res = (await (await send("POST", `/templates/${tpl.id}/apply-to-projects`)).json()) as { count: number };
  assert.equal(res.count, 1);

  const state = (await (await send("GET", "/state")).json()) as {
    projects: { id: string; icon: string; instructions: string }[];
  };
  const l = state.projects.find((p) => p.id === linked.id)!;
  const o = state.projects.find((p) => p.id === other.id)!;
  assert.deepEqual([l.instructions, l.icon], ["v2", "🧪"]);
  assert.equal(o.instructions, "");
  assert.equal((await send("POST", "/templates/nope/apply-to-projects")).status, 404);
});

test("custom template create, update and delete", async () => {
  const created = (await (await send("POST", "/templates", { name: "Mía", instructions: "Hola" })).json()) as {
    id: string;
    icon: string;
    builtIn: boolean;
  };
  assert.equal(created.builtIn, false);
  assert.equal(created.icon, "✨");

  const updated = (await (await send("PATCH", `/templates/${created.id}`, { description: "d" })).json()) as {
    name: string;
    description: string;
    instructions: string;
  };
  assert.deepEqual([updated.name, updated.description, updated.instructions], ["Mía", "d", "Hola"]);

  assert.equal((await send("DELETE", `/templates/${created.id}`)).status, 200);
  assert.equal((await send("DELETE", `/templates/${created.id}`)).status, 404);
});

test("from-project copies name, icon and instructions", async () => {
  const project = (await (await send("POST", "/projects", { name: "Finanzas" })).json()) as { id: string };
  await send("PATCH", `/projects/${project.id}`, { icon: "💰", instructions: "Sé breve" });
  const res = await send("POST", `/templates/from-project/${project.id}`);
  const template = (await res.json()) as { name: string; icon: string; instructions: string; builtIn: boolean };
  assert.deepEqual(
    [template.name, template.icon, template.instructions, template.builtIn],
    ["Finanzas", "💰", "Sé breve", false],
  );
  assert.equal((await send("POST", "/templates/from-project/nope")).status, 404);
});
