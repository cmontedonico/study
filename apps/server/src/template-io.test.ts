import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dedupeNames,
  parseImportPayload,
  parseTemplateMarkdown,
  serializeBundle,
  serializeTemplateMarkdown,
} from "./template-io.ts";
import { builtInTemplates } from "./templates.ts";

const sample = {
  name: 'Química: "básica"',
  icon: "🧪",
  description: "Tutor: paciente, con ejemplos",
  instructions: "Eres un tutor.\n- Pregunta primero.\n\n---\nNota con $$x^2$$.",
};

test("markdown round trip keeps every field, including colons, quotes and --- in the body", () => {
  assert.deepEqual(parseTemplateMarkdown(serializeTemplateMarkdown(sample)), sample);
  for (const t of builtInTemplates) {
    const { id: _id, ...data } = t;
    assert.deepEqual(parseTemplateMarkdown(serializeTemplateMarkdown(data)), data, t.id);
  }
});

test("markdown parser accepts unquoted values, CRLF and a BOM; rejects a missing header", () => {
  const md = "﻿---\r\nname: Mi plantilla\r\nicon: 📝\r\n---\r\n\r\nHola\r\n";
  assert.deepEqual(parseTemplateMarkdown(md), { name: "Mi plantilla", icon: "📝", description: "", instructions: "Hola" });
  assert.throws(() => parseTemplateMarkdown("Solo texto"), /encabezado/);
  assert.throws(() => parseTemplateMarkdown("---\nicon: x\n---\nHola"), /name/);
});

test("import validation: bundle, single markdown, defaults and limits", () => {
  const bundle = JSON.parse(serializeBundle([sample]));
  assert.equal(bundle.version, 1);
  assert.deepEqual(parseImportPayload(bundle), [sample]);
  assert.deepEqual(parseImportPayload({ markdown: serializeTemplateMarkdown(sample) }), [sample]);
  assert.equal(parseImportPayload({ templates: [{ name: "A" }] })[0]!.icon, "✨");
  assert.throws(() => parseImportPayload({ templates: [] }), /No hay plantillas/);
  assert.throws(() => parseImportPayload({ templates: [{ name: " " }] }), /nombre/);
  assert.throws(() => parseImportPayload({ nada: 1 }), /Formato/);
  assert.throws(() => parseImportPayload({ templates: Array.from({ length: 51 }, () => ({ name: "A" })) }), /Máximo 50/);
  assert.throws(() => parseImportPayload({ templates: [{ name: "A", instructions: "x".repeat(210 * 1024) }] }), /grande/);
});

test("dedupeNames appends (importada) and stays unique within the batch", () => {
  const t = (name: string) => ({ name, icon: "✨", description: "", instructions: "" });
  const out = dedupeNames([t("Mentor socrático"), t("mentor socrático"), t("Nueva")], ["Mentor socrático"]);
  assert.deepEqual(
    out.map((x) => x.name),
    ["Mentor socrático (importada)", "mentor socrático (importada 2)", "Nueva"],
  );
});
