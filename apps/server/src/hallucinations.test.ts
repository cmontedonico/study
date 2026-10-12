import assert from "node:assert/strict";
import { test } from "node:test";
import { filterHallucinations } from "./hallucinations.ts";

test("drops stock subtitle phrases", () => {
  for (const text of [
    "Subtítulos realizados por la comunidad de Amara.org",
    "Gracias por ver el vídeo.",
    "¡Suscríbete al canal!",
    "Thanks for watching!",
    "[Música]",
    "Gracias.",
    "...",
  ]) {
    assert.equal(filterHallucinations(text), "", text);
  }
});

test("keeps real speech, even when it mentions thanks", () => {
  assert.equal(filterHallucinations("  Hay que revisar el tema de la integral doble. "), "Hay que revisar el tema de la integral doble.");
  assert.equal(filterHallucinations("Gracias a todos por venir hoy."), "Gracias a todos por venir hoy.");
});

test("removes only the hallucinated sentence", () => {
  assert.equal(filterHallucinations("Explica el teorema. Subtítulos realizados por la comunidad de Amara.org"), "Explica el teorema.");
});

test("collapses decoder loops", () => {
  assert.equal(filterHallucinations("sí sí sí sí sí sí sí sí"), "sí");
  assert.equal(filterHallucinations("no no, vale"), "no no, vale");
});
