/**
 * Pure helpers to turn a chat into Notion-flavored Markdown (spec: notion://docs/enhanced-markdown-spec) and to
 * build the arguments of the Notion MCP tools. Everything that depends on Notion's exact shapes lives here, so it
 * is easy to fix if the hosted server changes.
 */

/** Soft limits per tool call. Notion's API caps requests at 100 blocks and 2000 chars per rich text. */
export const MAX_CHUNK_CHARS = 12_000;
export const MAX_CHUNK_BLOCKS = 80;
const MAX_PARAGRAPH_CHARS = 1_800;

export interface ChatItem {
  role: "user" | "assistant";
  text: string;
  attachments: { name: string; transcript?: string }[];
}

// ---------------------------------------------------------------------------------------------------------------
// Inline text

/** Escapes characters Notion would read as markup, leaving code spans and math untouched. */
export function convertInline(text: string): string {
  const math: string[] = [];
  const stash = (equation: string) => {
    math.push("$`" + equation.trim() + "`$");
    return `\u0000${math.length - 1}\u0000`;
  };
  return text
    .split(/(`[^`]*`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code is literal
      return part
        .replace(/\$\$(.+?)\$\$/g, (_, eq: string) => stash(eq))
        .replace(/\\\((.+?)\\\)/g, (_, eq: string) => stash(eq))
        .replace(/[<{}$]/g, (c) => `\\${c}`)
        .replace(/\u0000(\d+)\u0000/g, (_, n: string) => math[Number(n)] ?? "");
    })
    .join("");
}

/** Splits an over-long paragraph at sentence or word boundaries, so no block exceeds Notion's rich text limit. */
export function splitLongParagraph(text: string, max = MAX_PARAGRAPH_CHARS): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const space = window.lastIndexOf(" ");
    const at = sentence > max / 2 ? sentence + 1 : space > max / 2 ? space : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Block conversion

const fenceRe = /^\s*(```+|~~~+)(.*)$/;
const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const separatorRe = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

function tableBlock(lines: string[]): string {
  const [header, , ...rows] = lines;
  const tr = (cells: string[]) =>
    ["\t<tr>", ...cells.map((c) => `\t\t<td>${convertInline(c.replace(/\\\|/g, "|"))}</td>`), "\t</tr>"].join("\n");
  return [`<table header-row="true">`, tr(splitRow(header ?? "")), ...rows.map((r) => tr(splitRow(r))), "</table>"].join(
    "\n",
  );
}

/**
 * Converts chat Markdown into top-level Notion blocks (each string is one unsplittable unit: a list, a code block,
 * an equation, a table or a paragraph). Never splits inside code fences or `$$` equations.
 */
export function toNotionBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) blocks.push(current.join("\n"));
    current = [];
  };
  let indents: number[] = [];
  const at = (n: number) => lines[n] ?? "";

  for (let i = 0; i < lines.length; i++) {
    const line = at(i);

    const fence = fenceRe.exec(line);
    if (fence) {
      flush();
      indents = [];
      const marker = fence[1] ?? "```";
      const body: string[] = [];
      for (i++; i < lines.length && !at(i).trim().startsWith(marker); i++) body.push(at(i));
      blocks.push(["```" + (fence[2] ?? "").trim(), ...body, "```"].join("\n"));
      continue;
    }

    const trimmed = line.trim();
    const isDisplayMath =
      trimmed.startsWith("$$") && (trimmed.endsWith("$$") ? trimmed.length > 4 || trimmed === "$$" : !trimmed.slice(2).includes("$$"));
    if (isDisplayMath) {
      flush();
      indents = [];
      const first = line.trim().slice(2);
      const body: string[] = [];
      if (first.endsWith("$$")) {
        body.push(first.slice(0, -2));
      } else {
        body.push(first);
        for (i++; i < lines.length; i++) {
          const l = at(i).trim();
          if (l.endsWith("$$")) {
            body.push(l.slice(0, -2));
            break;
          }
          body.push(l);
        }
      }
      blocks.push(["$$", ...body.map((l) => l.trim()).filter(Boolean), "$$"].join("\n"));
      continue;
    }

    if (line.includes("|") && at(i + 1).includes("-") && separatorRe.test(at(i + 1))) {
      flush();
      indents = [];
      const table = [line, at(i + 1)];
      for (i += 2; i < lines.length && at(i).includes("|") && at(i).trim(); i++) table.push(at(i));
      i--;
      blocks.push(tableBlock(table));
      continue;
    }

    if (!line.trim()) {
      flush();
      indents = [];
      continue;
    }

    const item = listRe.exec(line);
    if (item) {
      const width = (item[1] ?? "").replace(/\t/g, "    ").length;
      while (indents.length && (indents[indents.length - 1] ?? 0) > width) indents.pop();
      if (indents[indents.length - 1] !== width) indents.push(width);
      const marker = /\d/.test(item[2] ?? "") ? "1." : "-";
      current.push("\t".repeat(indents.length - 1) + `${marker} ${convertInline(item[3] ?? "")}`);
      continue;
    }

    if (current.length && indents.length) {
      current.push("\t".repeat(indents.length) + convertInline(line.trim())); // list continuation
      continue;
    }
    flush();
    indents = [];
    const converted = convertInline(line.trim());
    // Headings, quotes and rules are single-line blocks; plain paragraphs may need splitting.
    if (/^(#{1,6}\s|>|---+$)/.test(converted)) blocks.push(converted);
    else blocks.push(...splitLongParagraph(converted));
  }
  flush();
  return blocks;
}

export const toNotionMarkdown = (markdown: string) => toNotionBlocks(markdown).join("\n");

// ---------------------------------------------------------------------------------------------------------------
// Chat -> blocks

/** Blocks of the full transcript: a heading per message, attachments as text, audio transcripts included. */
export function conversationBlocks(items: ChatItem[]): string[] {
  const blocks: string[] = [];
  for (const item of items) {
    blocks.push(item.role === "user" ? "## Tú" : "## Claude");
    for (const a of item.attachments) blocks.push(`- Adjunto: ${convertInline(a.name)}`);
    for (const a of item.attachments) {
      if (a.transcript?.trim()) {
        blocks.push(`**Transcripción de ${convertInline(a.name)}**`, ...toNotionBlocks(a.transcript));
      }
    }
    if (item.text.trim()) blocks.push(...toNotionBlocks(item.text));
  }
  return blocks;
}

/** Plain Markdown of the chat: the input of the summary prompt. */
export function conversationSource(items: ChatItem[]): string {
  return items
    .map((item) => {
      const files = item.attachments.map((a) =>
        a.transcript ? `[Adjunto: ${a.name}]\nTranscripción:\n${a.transcript}` : `[Adjunto: ${a.name}]`,
      );
      return [item.role === "user" ? "Tú:" : "Claude:", ...files, item.text].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

export function attachmentBlocks(items: ChatItem[]): string[] {
  const names = [...new Set(items.flatMap((i) => i.attachments.map((a) => a.name)))];
  return names.length ? ["## Adjuntos", ...names.map((n) => `- ${convertInline(n)}`)] : [];
}

// ---------------------------------------------------------------------------------------------------------------
// Chunking

const blockWeight = (block: string) => (/^(```|\$\$|<table)/.test(block) ? 1 : block.split("\n").length);

/** Splits one oversized block at line boundaries, reopening code fences / equations on each piece. */
export function splitOversized(block: string, max = MAX_CHUNK_CHARS): string[] {
  if (block.length <= max) return [block];
  const lines = block.split("\n");
  const first = lines[0] ?? "";
  const wrapped = first.startsWith("```") || first === "$$";
  const open = first;
  const close = first === "$$" ? "$$" : "```";
  const body = wrapped ? lines.slice(1, -1) : lines;
  const pieces: string[] = [];
  let cur: string[] = [];
  let size = 0;
  const push = () => {
    if (cur.length) pieces.push(wrapped ? [open, ...cur, close].join("\n") : cur.join("\n"));
    cur = [];
    size = 0;
  };
  const room = max - 20;
  for (const l of body) {
    for (let from = 0; from < Math.max(l.length, 1); from += room) {
      const part = l.slice(from, from + room);
      if (size + part.length + 1 > room) push();
      cur.push(part);
      size += part.length + 1;
    }
  }
  push();
  return pieces;
}

/** Groups blocks into pieces that respect the per-call character and block limits. */
export function chunkBlocks(blocks: string[], maxChars = MAX_CHUNK_CHARS, maxBlocks = MAX_CHUNK_BLOCKS): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  let chars = 0;
  let weight = 0;
  for (const block of blocks.flatMap((b) => splitOversized(b, maxChars))) {
    const w = blockWeight(block);
    if (cur.length && (chars + block.length + 1 > maxChars || weight + w > maxBlocks)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
      weight = 0;
    }
    cur.push(block);
    chars += block.length + 1;
    weight += w;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const indent = (text: string) =>
  text
    .split("\n")
    .map((l) => (l ? `\t${l}` : l))
    .join("\n");

export type ExportMode = "full" | "summary" | "both";

/**
 * Splits the page body into content strings, one per Notion call. The first goes to `notion-create-pages`, the
 * rest are appended. In "both" mode the transcript sits in toggles ("parte i/n" when it needs several calls).
 */
export function planPageContent(opts: {
  mode: ExportMode;
  summary?: string;
  transcript: string[];
  attachments: string[];
}): string[] {
  const { mode, summary, transcript, attachments } = opts;
  const head: string[] = [];
  if (mode !== "full" && summary) head.push(...toNotionBlocks(summary));
  head.push(...attachments);

  if (mode === "summary") return chunkBlocks(head).map((c) => c.join("\n"));
  if (mode === "full") return chunkBlocks([...head, ...transcript]).map((c) => c.join("\n"));

  // Toggle children are indented, which adds a tab per line: leave headroom in the limits.
  const parts = chunkBlocks(transcript, MAX_CHUNK_CHARS - 2_000, MAX_CHUNK_BLOCKS - 10);
  const toggles = parts.map((part, i) => {
    const label = parts.length > 1 ? `Conversación completa (parte ${i + 1}/${parts.length})` : "Conversación completa";
    return `<details>\n<summary>${label}</summary>\n${indent(part.join("\n"))}\n</details>`;
  });
  return [...chunkBlocks(head).map((c) => c.join("\n")), ...toggles];
}

// ---------------------------------------------------------------------------------------------------------------
// Tool arguments (single source of truth for the Notion MCP shapes)
// Docs: https://developers.notion.com/docs/mcp-supported-tools

export const buildSearchArgs = (query: string) => ({ query, query_type: "internal", page_size: 10 });

export const buildCreateArgs = (parentId: string, title: string, content: string) => ({
  parent: { type: "page_id", page_id: parentId },
  pages: [{ properties: { title }, content }],
  allow_async: false, // we need the URL right away
});

export const buildAppendArgs = (pageId: string, content: string) => ({
  page_id: pageId,
  command: "insert_content",
  content,
  position: { type: "end" },
  allow_async: false,
});

// ---------------------------------------------------------------------------------------------------------------
// Tool results

export interface NotionPageRef {
  id: string;
  title: string;
  url: string;
  path?: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/** `notion-search` answers with JSON `{ results: [{ id, title, url, type, path }] }`; databases are not valid parents. */
export function parseSearchResults(text: string): NotionPageRef[] {
  try {
    const data = JSON.parse(text) as { results?: unknown };
    if (!Array.isArray(data.results)) return [];
    return data.results.flatMap((r: unknown) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const id = str(o.id);
      const type = str(o.type);
      if (!id || (type && type !== "page")) return [];
      return [{ id, title: str(o.title) ?? "Sin título", url: str(o.url) ?? "", path: str(o.path) }];
    });
  } catch {
    return [];
  }
}

/** Page created by `notion-create-pages`: JSON with `pages[].id/url` is expected, any Notion URL in the text works. */
export function parseCreatedPage(text: string): { id: string; url: string } | undefined {
  const idFromUrl = (url: string) => /([0-9a-f]{32})(?:[?#].*)?$/i.exec(url)?.[1];
  try {
    const data = JSON.parse(text) as { pages?: unknown[] } | unknown[];
    const pages = Array.isArray(data) ? data : data.pages;
    const first = (pages?.[0] ?? {}) as Record<string, unknown>;
    const url = str(first.url);
    const id = str(first.id) ?? (url ? idFromUrl(url) : undefined);
    if (url && id) return { id, url };
  } catch {
    // not JSON: fall through to the URL scan
  }
  const url = /https:\/\/(?:www\.)?notion\.(?:so|com)\/[^\s"'<>)\]]+/.exec(text)?.[0];
  const id = url ? idFromUrl(url) : undefined;
  return url && id ? { id, url } : undefined;
}

/** Spanish, actionable message for an error coming from Notion or from the connection. */
export function mapNotionError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("no está conectado")) return "Notion no está conectado. Conéctalo en Ajustes";
  if (m.includes("caducado") || /unauthorized|invalid_token|invalid_grant|\b401\b|expired/.test(m)) {
    return "Vuelve a conectar Notion en Ajustes";
  }
  if (/not.?found|object_not_found|restricted|forbidden|\b403\b|\b404\b|permission|no access|could not find/.test(m)) {
    return "StudyLab no tiene acceso a esa página. Compártela con la integración de StudyLab en Notion (menú ··· de la página, Conexiones) y vuelve a intentarlo";
  }
  if (/rate.?limit|\b429\b/.test(m)) return "Notion está limitando las peticiones. Espera un momento y reinténtalo";
  return `Notion devolvió un error: ${message.slice(0, 300)}`;
}
