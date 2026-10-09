import assert from "node:assert/strict";
import { test } from "node:test";
import { builtInTemplates } from "./templates.ts";

test("built-in templates include the tutors, have unique ids and keep en-blanco last", () => {
  const ids = builtInTemplates.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["tutor-idiomas", "tutor-matematicas", "tutor-ajedrez", "tutor-guitarra", "tutor-ia", "asistente-tareas"]) {
    assert.ok(ids.includes(id), id);
    assert.ok(builtInTemplates.find((t) => t.id === id)?.instructions.length);
  }
  assert.equal(ids[ids.length - 1], "en-blanco");
});
