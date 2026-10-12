import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSystem, parseGeneratedDraft, parseImprovedInstructions, runWithRetry } from "./template-ai.ts";

const draft = {
  name: "Tutor de química",
  icon: "🧪",
  description: "Paciente.\nCon ejemplos",
  instructions: "Eres un tutor.\n- Hazlo.",
};

test("parses a fenced json block, with surrounding chatter", () => {
  const answer = `Claro:\n\`\`\`json\n${JSON.stringify(draft)}\n\`\`\`\nListo.`;
  const parsed = parseGeneratedDraft(answer);
  assert.equal(parsed.name, draft.name);
  assert.equal(parsed.description, "Paciente. Con ejemplos");
  assert.equal(parsed.instructions, draft.instructions);
});

test("parses bare JSON and reduces the icon to a single emoji", () => {
  assert.equal(parseGeneratedDraft(JSON.stringify({ ...draft, icon: "🧪 química" })).icon, "🧪");
  assert.equal(parseGeneratedDraft(JSON.stringify({ ...draft, icon: "química" })).icon, "✨");
});

test("rejects invalid or incomplete answers", () => {
  assert.throws(() => parseGeneratedDraft("no json"));
  assert.throws(() => parseGeneratedDraft(JSON.stringify({ name: "x" })));
  assert.throws(() => parseImprovedInstructions('```json\n{"instructions": " "}\n```'));
  assert.equal(parseImprovedInstructions('```json\n{"instructions": "Mejor\\ntexto"}\n```'), "Mejor\ntexto");
});

test("runWithRetry retries once with a hint, then fails with a Spanish error", async () => {
  const hints: (string | undefined)[] = [];
  const ok = await runWithRetry(
    async (hint) => (hints.push(hint), hints.length === 1 ? "basura" : '{"instructions":"ok"}'),
    parseImprovedInstructions,
  );
  assert.equal(ok, "ok");
  assert.equal(hints[0], undefined);
  assert.ok(hints[1]);
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => (calls++, "basura"), parseImprovedInstructions),
    /no devolvió un resultado válido/,
  );
  assert.equal(calls, 2);
});

test("generation prompt embeds two built-in examples and the rules", () => {
  assert.match(generateSystem, /Asistente de tareas/);
  assert.match(generateSystem, /Tutor de matemáticas/);
  assert.match(generateSystem, /dobles dólares/);
});
