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

test("built-in templates cannot be edited or deleted", async () => {
  const patch = await send("PATCH", "/templates/en-blanco", { name: "x" });
  assert.equal(patch.status, 400);
  assert.match(((await patch.json()) as { error: string }).error, /integradas/);
  assert.equal((await send("DELETE", "/templates/en-blanco")).status, 400);
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
