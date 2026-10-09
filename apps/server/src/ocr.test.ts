import assert from "node:assert/strict";
import { test } from "node:test";
import { assemblePages, findEmptyPages, MAX_OCR_PAGES, parseTranscription, selectOcrPages } from "./ocr.ts";

test("findEmptyPages flags pages with almost no text", () => {
  const pages = ["Un párrafo normal con bastante texto.", " \n 12 \n", "", "Otra página con contenido suficiente."];
  assert.deepEqual(findEmptyPages(pages), [2, 3]);
});

test("selectOcrPages caps the number of OCR'd pages", () => {
  const empty = Array.from({ length: MAX_OCR_PAGES + 5 }, (_, i) => i + 1);
  const { selected, skipped } = selectOcrPages(empty);
  assert.equal(selected.length, MAX_OCR_PAGES);
  assert.deepEqual(skipped, [41, 42, 43, 44, 45]);
});

test("assemblePages keeps the plain join when no OCR was needed", () => {
  assert.equal(assemblePages(["a", "b"], new Map()), "a\n\nb");
});

test("assemblePages merges OCR text in page order with markers", () => {
  const text = assemblePages(["texto uno", "", "texto tres"], new Map([[2, " transcrito "]]));
  assert.equal(text, "--- Página 1 ---\ntexto uno\n\n--- Página 2 ---\ntranscrito\n\n--- Página 3 ---\ntexto tres");
});

test("assemblePages notes pages beyond the OCR limit", () => {
  const text = assemblePages(["", ""], new Map([[1, "uno"]]), [2]);
  assert.match(text, /--- Página 2 ---\n\[Página no procesada/);
  assert.match(text, /1 páginas escaneadas no se leyeron/);
});

test("parseTranscription splits sections by page marker", () => {
  const answer = "<<<PÁGINA 3>>>\n# Título\n\nTexto\n<<<PÁGINA 5>>>\nOtra\n";
  const parsed = parseTranscription(answer, [3, 5]);
  assert.equal(parsed.get(3), "# Título\n\nTexto");
  assert.equal(parsed.get(5), "Otra");
});

test("parseTranscription accepts an unmarked answer for a single page", () => {
  assert.equal(parseTranscription("solo texto", [4]).get(4), "solo texto");
  assert.equal(parseTranscription("solo texto", [4, 5]).size, 0);
});
