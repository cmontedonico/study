import { generateText } from "ai";
import { z } from "zod";
import { resolveModel, type Engine } from "./model.ts";
import { getSetting } from "./settings.ts";
import { builtInTemplates } from "./templates.ts";

const draftSchema = z.object({
  name: z.string().trim().min(1),
  icon: z.string().trim().min(1),
  description: z.string().trim(),
  instructions: z.string().trim().min(1),
});
const improveSchema = z.object({ instructions: z.string().trim().min(1) });

export type TemplateDraft = z.infer<typeof draftSchema>;

/** First emoji-like cluster of the string, so a stray word never ends up as the icon. */
function firstEmoji(icon: string): string {
  const match = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/u.exec(icon);
  return match?.[0] ?? "✨";
}

/** Extracts the JSON object from a model answer (fenced ```json block or bare object). */
export function extractJson(answer: string): unknown {
  const fenced = /```(?:json)?[ \t]*\n([\s\S]*?)\n[ \t]*```/i.exec(answer);
  const candidate = fenced?.[1] ?? answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

export function parseGeneratedDraft(answer: string): TemplateDraft {
  const draft = draftSchema.parse(extractJson(answer));
  return { ...draft, icon: firstEmoji(draft.icon), description: draft.description.replace(/\s*\n\s*/g, " ") };
}

export function parseImprovedInstructions(answer: string): string {
  return improveSchema.parse(extractJson(answer)).instructions;
}

const example = (id: string) => {
  const t = builtInTemplates.find((b) => b.id === id);
  if (!t) throw new Error(`Falta la plantilla de ejemplo ${id}`);
  return `Ejemplo (${t.name}):\n${t.instructions}`;
};

const RULES = `Reglas para las instrucciones:
- Español. Segunda persona dirigida al asistente ("Eres…", "Haz…"), con viñetas directivas como en los ejemplos.
- Concisas y con comportamientos concretos y verificables (qué preguntar, cuándo, en qué formato); nada de generalidades.
- Las fórmulas matemáticas, si el tema las usa, se escriben en LaTeX solo con dobles dólares $$...$$; un solo $ se reserva para importes de dinero.
- Las respuestas van siempre como texto en el chat (no hay archivos, imágenes generadas ni herramientas).
- No inventes capacidades que el asistente no tenga.`;

const FORMAT_DRAFT = `Responde únicamente con un bloque de código \`\`\`json con esta forma exacta, sin texto fuera del bloque:
{"name": "nombre corto", "icon": "un único emoji", "description": "una sola línea", "instructions": "texto completo con saltos de línea \\n"}`;

const FORMAT_IMPROVE = `Responde únicamente con un bloque de código \`\`\`json con esta forma exacta, sin texto fuera del bloque:
{"instructions": "texto completo mejorado con saltos de línea \\n"}`;

export const generateSystem = `Redactas plantillas de instrucciones (system prompts) para StudyLab, una app de estudio con Claude. Una plantilla define cómo debe comportarse el asistente en un proyecto.

${RULES}

Estos son ejemplos del estilo y la calidad esperados:

${example("asistente-tareas")}

${example("tutor-matematicas")}

${FORMAT_DRAFT}`;

export const improveSystem = `Mejoras instrucciones (system prompts) de plantillas de StudyLab. Conserva la intención y el contenido útil; corrige ambigüedades, añade comportamientos concretos que falten y elimina relleno. Aplica la petición del usuario si la hay.

${RULES}

Reglas de la mejora:
- Mantén aproximadamente la longitud original: apunta a ≤ 1,5 veces el tamaño de las instrucciones actuales. Solo puedes pasar de ahí si la petición del usuario pide explícitamente más detalle, o si el original es de una sola línea (en ese caso, hasta ~1.200 caracteres).
- Prefiere afinar las viñetas existentes antes que añadir secciones nuevas.
- Conserva la voz y la persona del original: si dice "Eres…" y "Tu objetivo es que yo aprenda", no cambies a primera persona del asistente ni reescribas el planteamiento.

Ejemplo del estilo esperado (solo de estilo; no copies su longitud ni su estructura):

${example("tutor-matematicas")}

${FORMAT_IMPROVE}`;

/** Runs the model; on an unparseable answer it retries once, telling the model what went wrong. */
export async function runWithRetry<T>(
  generate: (retryHint?: string) => Promise<string>,
  parse: (answer: string) => T,
): Promise<T> {
  let hint: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await generate(hint);
    try {
      return parse(answer);
    } catch {
      hint = "Tu respuesta anterior no era JSON válido en un bloque ```json con los campos pedidos. Inténtalo de nuevo.";
    }
  }
  throw new Error("La IA no devolvió un resultado válido. Inténtalo de nuevo.");
}

async function ask(system: string, prompt: string, hint?: string): Promise<string> {
  const engine = (getSetting("defaultEngine") ?? "cli") as Engine;
  const { text } = await generateText({
    model: resolveModel(engine, "sonnet"),
    system,
    prompt: hint ? `${prompt}\n\n${hint}` : prompt,
  });
  return text;
}

export const generateTemplateDraft = (request: string) =>
  runWithRetry((hint) => ask(generateSystem, `Crea una plantilla para: ${request}`, hint), parseGeneratedDraft);

export const improveInstructions = (instructions: string, request?: string) =>
  runWithRetry(
    (hint) =>
      ask(
        improveSystem,
        `Instrucciones actuales:\n<instrucciones>\n${instructions}\n</instrucciones>\n\nPetición: ${
          request?.trim() || "mejóralas en general"
        }`,
        hint,
      ),
    parseImprovedInstructions,
  );
