import { z } from "zod";

export interface TemplateData {
  name: string;
  icon: string;
  description: string;
  instructions: string;
}

export const MAX_IMPORT_BYTES = 200 * 1024;
export const MAX_IMPORT_TEMPLATES = 50;

export const importTemplateSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre de una plantilla"),
  icon: z.string().trim().min(1).default("✨"),
  description: z.string().default(""),
  instructions: z.string().default(""),
});
export const importBodySchema = z.object({
  templates: z.array(importTemplateSchema).min(1, "No hay plantillas para importar").max(MAX_IMPORT_TEMPLATES),
});

/** One-line, quoted value so any text (colons, quotes) survives the round trip. */
const quote = (value: string) => JSON.stringify(value.replace(/\s*\n\s*/g, " ").trim());

/** `.md` file: a small frontmatter (name, icon, description) followed by the instructions. */
export function serializeTemplateMarkdown(t: TemplateData): string {
  return `---\nname: ${quote(t.name)}\nicon: ${quote(t.icon)}\ndescription: ${quote(t.description)}\n---\n\n${t.instructions}\n`;
}

function readValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === "string") return parsed;
    } catch {
      // fall through to the plain value
    }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

/** Inverse of `serializeTemplateMarkdown`; also accepts unquoted values. Throws a Spanish error. */
export function parseTemplateMarkdown(text: string): TemplateData {
  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error("El archivo .md no tiene el encabezado (---) con name, icon y description.");
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const kv = /^([A-Za-z_]+)\s*:(.*)$/.exec(line);
    if (kv) fields[kv[1]!.toLowerCase()] = readValue(kv[2]!);
  }
  const parsed = importTemplateSchema.safeParse({
    name: fields.name,
    icon: fields.icon || undefined,
    description: fields.description,
    instructions: match[2]!.replace(/^\n+/, "").trimEnd(),
  });
  if (!parsed.success) throw new Error("El encabezado del .md necesita al menos un name.");
  return parsed.data;
}

export function serializeBundle(templates: TemplateData[]): string {
  const clean = templates.map(({ name, icon, description, instructions }) => ({
    name,
    icon,
    description,
    instructions,
  }));
  return JSON.stringify({ version: 1, templates: clean }, null, 2);
}

/** Validates an import payload: `{ templates }` or a single `{ markdown }`. Throws a Spanish error. */
export function parseImportPayload(body: unknown): TemplateData[] {
  if (JSON.stringify(body ?? null).length > MAX_IMPORT_BYTES) {
    throw new Error("El archivo es demasiado grande (máximo 200 KB).");
  }
  const markdown = z.object({ markdown: z.string() }).safeParse(body);
  if (markdown.success) return [parseTemplateMarkdown(markdown.data.markdown)];
  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.code === "too_big") throw new Error(`Máximo ${MAX_IMPORT_TEMPLATES} plantillas por importación.`);
    const known = issue?.path.length === 2 || issue?.code === "too_small";
    throw new Error(known && issue ? issue.message : "Formato de plantillas no válido.");
  }
  return parsed.data.templates;
}

/** Appends " (importada)" (and a counter if needed) so imports never collide with existing names. */
export function dedupeNames(templates: TemplateData[], existing: Iterable<string>): TemplateData[] {
  const taken = new Set([...existing].map((n) => n.trim().toLowerCase()));
  return templates.map((t) => {
    let name = t.name;
    for (let i = 1; taken.has(name.toLowerCase()); i++) {
      name = `${t.name} (importada${i > 1 ? ` ${i}` : ""})`;
    }
    taken.add(name.toLowerCase());
    return { ...t, name };
  });
}
