import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAppendArgs,
  buildCreateArgs,
  buildSearchArgs,
  chunkBlocks,
  conversationBlocks,
  convertInline,
  mapNotionError,
  parseCreatedPage,
  parseSearchResults,
  planPageContent,
  splitLongParagraph,
  toNotionBlocks,
  toNotionMarkdown,
  type ChatItem,
} from "./markdown.ts";

test("inline: escapes markup, keeps code, converts inline math", () => {
  assert.equal(convertInline("cuesta $5 y <b> {x}"), "cuesta \\$5 y \\<b> \\{x\\}");
  assert.equal(convertInline("usa `<div>$` ok"), "usa `<div>$` ok");
  assert.equal(convertInline("sea $$x^2$$ y \\(y\\)"), "sea $`x^2`$ y $`y`$");
});

test("display math becomes a Notion equation block", () => {
  assert.deepEqual(toNotionBlocks("antes\n\n$$\nx = 1\n$$\n\ndespués"), ["antes", "$$\nx = 1\n$$", "después"]);
  assert.deepEqual(toNotionBlocks("$$a+b$$"), ["$$\na+b\n$$"]);
  assert.deepEqual(toNotionBlocks("$$\\frac{1}{2}\n= 0.5$$"), ["$$\n\\frac{1}{2}\n= 0.5\n$$"]);
  // A line that merely starts with a formula stays a paragraph with inline math.
  assert.deepEqual(toNotionBlocks("$$x$$ es la solución"), ["$`x`$ es la solución"]);
});

test("code fences are kept literal, including blank lines and markup", () => {
  const md = "```ts\nconst a = 1 < 2;\n\n$$ {x}\n```";
  assert.deepEqual(toNotionBlocks(md), [md]);
});

test("lists: nesting with 2 or 4 spaces becomes tabs", () => {
  assert.equal(toNotionMarkdown("* uno\n    * dos\n        * tres\n* cuatro"), "- uno\n\t- dos\n\t\t- tres\n- cuatro");
  assert.equal(toNotionMarkdown("1. a\n  - b"), "1. a\n\t- b");
});

test("markdown tables become Notion tables", () => {
  const out = toNotionMarkdown("| a | b |\n|---|---|\n| 1 | $$x$$ |");
  assert.equal(
    out,
    '<table header-row="true">\n\t<tr>\n\t\t<td>a</td>\n\t\t<td>b</td>\n\t</tr>\n\t<tr>\n\t\t<td>1</td>\n\t\t<td>$`x`$</td>\n\t</tr>\n</table>',
  );
});

test("long paragraphs are split below the rich text limit", () => {
  const text = "Frase número uno. ".repeat(400).trim();
  const parts = splitLongParagraph(text, 1800);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 1800));
  assert.equal(parts.join(" "), text);
});

const items: ChatItem[] = [
  {
    role: "user",
    text: "Explica $$e^{i\\pi}$$",
    attachments: [{ name: "clase.m4a", transcript: "hola mundo" }, { name: "t.pdf" }],
  },
  { role: "assistant", text: "Claro:\n\n```py\nprint(1)\n```", attachments: [] },
];

test("conversation: role headings, attachments as text, audio transcripts included", () => {
  const md = conversationBlocks(items).join("\n");
  assert.match(md, /^## Tú\n- Adjunto: clase\.m4a\n- Adjunto: t\.pdf\n\*\*Transcripción de clase\.m4a\*\*\nhola mundo\n/);
  assert.ok(md.includes("Explica $`e^{i\\pi}`$\n## Claude"));
  assert.match(md, /## Claude\nClaro:\n```py\nprint\(1\)\n```$/);
});

test("chunking: respects limits and never splits code or equations", () => {
  const code = "```\n" + Array.from({ length: 50 }, (_, i) => `linea ${i}`).join("\n") + "\n```";
  const chunks = chunkBlocks(["uno", code, "dos"], 200, 80);
  assert.ok(chunks.length > 2);
  for (const chunk of chunks) {
    assert.ok(chunk.join("\n").length <= 200, "chunk too big");
    for (const block of chunk) {
      const fences = block.split("\n").filter((l) => l.startsWith("```")).length;
      assert.ok(fences === 0 || fences === 2, "fence split");
    }
  }
  assert.equal(chunks.flat().join("\n").split("linea").length - 1, 50);
  // Block-count limit.
  const many = Array.from({ length: 10 }, (_, i) => `p${i}`);
  assert.deepEqual(
    chunkBlocks(many, 10_000, 4).map((c) => c.length),
    [4, 4, 2],
  );
});

test("plan: full mode chunks in order; both mode puts the transcript in toggles", () => {
  const transcript = Array.from({ length: 300 }, (_, i) => `párrafo ${i} ${"x".repeat(100)}`);
  const full = planPageContent({ mode: "full", transcript, attachments: [] });
  assert.ok(full.length > 1);
  assert.ok(full.every((c) => c.length <= 12_000));
  assert.equal(full.join("\n").split("\n").length, 300);

  const both = planPageContent({ mode: "both", summary: "## Resumen\ntexto", transcript, attachments: ["## Adjuntos"] });
  assert.match(both[0] ?? "", /^## Resumen\ntexto\n## Adjuntos$/);
  const toggles = both.slice(1);
  assert.ok(toggles.length > 1);
  toggles.forEach((t, i) => {
    assert.match(
      t,
      new RegExp(`^<details>\\n<summary>Conversación completa \\(parte ${i + 1}/${toggles.length}\\)</summary>\\n\\tpárrafo`),
    );
    assert.ok(t.endsWith("\n</details>"));
  });

  const small = planPageContent({ mode: "both", summary: "s", transcript: ["hola"], attachments: [] });
  assert.deepEqual(small, ["s", "<details>\n<summary>Conversación completa</summary>\n\thola\n</details>"]);
  assert.deepEqual(planPageContent({ mode: "summary", summary: "s", transcript: ["x"], attachments: [] }), ["s"]);
});

test("tool args", () => {
  assert.deepEqual(buildSearchArgs("mates"), { query: "mates", query_type: "internal", page_size: 10 });
  assert.deepEqual(buildCreateArgs("abc", "T", "C"), {
    parent: { type: "page_id", page_id: "abc" },
    pages: [{ properties: { title: "T" }, content: "C" }],
    allow_async: false,
  });
  assert.deepEqual(buildAppendArgs("p", "C"), {
    page_id: "p",
    command: "insert_content",
    content: "C",
    position: { type: "end" },
    allow_async: false,
  });
});

test("result parsing", () => {
  const search = JSON.stringify({
    results: [
      { id: "1", title: "A", url: "u1", type: "page", path: "X / Y" },
      { id: "2", title: "DB", type: "database" },
    ],
    type: "ai_search",
  });
  assert.deepEqual(parseSearchResults(search), [{ id: "1", title: "A", url: "u1", path: "X / Y" }]);
  assert.deepEqual(parseSearchResults("no json"), []);

  const id = "3eade604ac9b81c0aca2e58d55a4d213";
  const url = `https://www.notion.so/${id}`;
  assert.deepEqual(parseCreatedPage(JSON.stringify({ pages: [{ id: "x", url }] })), { id: "x", url });
  assert.deepEqual(parseCreatedPage(`Created page: ${url} (ok)`), { id, url });
  assert.equal(parseCreatedPage("nada"), undefined);
});

test("error mapping", () => {
  assert.match(mapNotionError("Notion no está conectado"), /Conéctalo en Ajustes/);
  assert.equal(
    mapNotionError("La sesión de Notion ha caducado. Vuelve a conectarla en Ajustes"),
    "Vuelve a conectar Notion en Ajustes",
  );
  assert.equal(mapNotionError("401 Unauthorized"), "Vuelve a conectar Notion en Ajustes");
  assert.match(mapNotionError("object_not_found: Could not find page"), /integración de StudyLab/);
  assert.match(mapNotionError("HTTP 429"), /limitando/);
  assert.match(mapNotionError("boom"), /^Notion devolvió un error: boom/);
});
