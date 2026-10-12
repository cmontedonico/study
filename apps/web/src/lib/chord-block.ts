// Parser for the ```chord code blocks the guitar tutor emits. Pure (no DOM, no svguitar runtime) so it can be tested.
//
//   name: Am7          title above the diagram (optional)
//   frets: x02010      one value per string, low E -> high e: x = muted, 0 = open, N = fret number
//                      (use separators for frets >= 10: x-10-12-12-11-10)
//   fingers: 0 0 2 0 1 0   optional, one value per string (0, - or x = none)
//   barre: 1 6-1       optional, repeatable: fret then the strings it covers (6 = low E, 1 = high e)
//   position: 5        optional first fret shown (auto when the chord is high up the neck)
// Several chords: separate them with a blank line or a line with ---.

export type FretValue = number | "x";

export interface ChordBarre {
  fret: number;
  /** String numbers, 1 = high e ... N = lowest string. fromString >= toString. */
  fromString: number;
  toString: number;
}

export interface ChordSpec {
  name?: string;
  frets: FretValue[];
  fingers?: (string | null)[];
  barres: ChordBarre[];
  position?: number;
}

export type ChordParseResult = { ok: true; chords: ChordSpec[] } | { ok: false; error: string };

const MAX_FRET = 24;

function parseFrets(value: string): FretValue[] | string {
  const tokens = /[\s,\-|]/.test(value) ? value.split(/[\s,\-|]+/).filter(Boolean) : [...value];
  const out: FretValue[] = [];
  for (const t of tokens) {
    if (t === "x" || t === "X") out.push("x");
    else if (/^\d{1,2}$/.test(t) && Number(t) <= MAX_FRET) out.push(Number(t));
    else return `Traste no válido: "${t}"`;
  }
  if (out.length < 4 || out.length > 8) return "Debe haber entre 4 y 8 cuerdas en frets";
  return out;
}

function parseFingers(value: string, strings: number): (string | null)[] | string {
  const tokens = /[\s,]/.test(value) ? value.split(/[\s,]+/).filter(Boolean) : [...value];
  if (tokens.length !== strings) return `fingers debe tener ${strings} valores`;
  const out: (string | null)[] = [];
  for (const t of tokens) {
    if (t === "0" || t === "-" || t === "x" || t === "X") out.push(null);
    else if (/^[1-4TtPp]$/.test(t)) out.push(t.toUpperCase());
    else return `Dedo no válido: "${t}"`;
  }
  return out;
}

function parseBarre(value: string, strings: number): ChordBarre | string {
  const m = /^(\d{1,2})\s+(\d)\s*-\s*(\d)$/.exec(value.trim());
  if (!m) return `barre no válido: "${value}" (usa "traste cuerda-cuerda", p. ej. "1 6-1")`;
  const fret = Number(m[1]);
  const a = Number(m[2]);
  const b = Number(m[3]);
  const from = Math.max(a, b);
  const to = Math.min(a, b);
  if (fret < 1 || fret > MAX_FRET || to < 1 || from > strings) return `barre fuera de rango: "${value}"`;
  return { fret, fromString: from, toString: to };
}

function parseOne(lines: string[]): ChordSpec | string {
  const fields = new Map<string, string[]>();
  for (const line of lines) {
    const m = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) return `Línea no válida: "${line.trim()}"`;
    const key = m[1]!.toLowerCase();
    if (!["name", "frets", "fingers", "barre", "position"].includes(key)) return `Clave desconocida: "${key}"`;
    fields.set(key, [...(fields.get(key) ?? []), m[2]!.trim()]);
  }
  const fretsRaw = fields.get("frets")?.[0];
  if (!fretsRaw) return "Falta la línea frets";
  const frets = parseFrets(fretsRaw);
  if (typeof frets === "string") return frets;
  const spec: ChordSpec = { frets, barres: [] };
  const name = fields.get("name")?.[0];
  if (name) spec.name = name;
  const fingersRaw = fields.get("fingers")?.[0];
  if (fingersRaw) {
    const fingers = parseFingers(fingersRaw, frets.length);
    if (typeof fingers === "string") return fingers;
    spec.fingers = fingers;
  }
  for (const b of fields.get("barre") ?? []) {
    const barre = parseBarre(b, frets.length);
    if (typeof barre === "string") return barre;
    spec.barres.push(barre);
  }
  const pos = fields.get("position")?.[0];
  if (pos) {
    if (!/^\d{1,2}$/.test(pos) || Number(pos) < 1 || Number(pos) > MAX_FRET) return `position no válida: "${pos}"`;
    spec.position = Number(pos);
  }
  return spec;
}

export function parseChordBlock(code: string): ChordParseResult {
  const groups: string[][] = [[]];
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || /^-{3,}$/.test(line)) {
      if (groups[groups.length - 1]!.length) groups.push([]);
    } else groups[groups.length - 1]!.push(line);
  }
  const nonEmpty = groups.filter((g) => g.length);
  if (!nonEmpty.length) return { ok: false, error: "Bloque vacío" };
  const chords: ChordSpec[] = [];
  for (const g of nonEmpty) {
    const r = parseOne(g);
    if (typeof r === "string") return { ok: false, error: r };
    chords.push(r);
  }
  return { ok: true, chords };
}

export interface DiagramLayout {
  /** First fret shown (1 = nut visible). */
  position: number;
  /** Number of fret rows. */
  frets: number;
  /** Fingers as [svguitar string number, fret relative to position | 0 | "x", finger label]. */
  fingers: [number, number | "x", string | undefined][];
  barres: { fret: number; fromString: number; toString: number }[];
}

/** Maps a chord to svguitar coordinates (strings numbered from the right, frets relative to position). */
export function layoutChord(spec: ChordSpec): DiagramLayout {
  const n = spec.frets.length;
  const fretted = [
    ...spec.frets.filter((f): f is number => typeof f === "number" && f > 0),
    ...spec.barres.map((b) => b.fret),
  ];
  const min = fretted.length ? Math.min(...fretted) : 1;
  const max = fretted.length ? Math.max(...fretted) : 1;
  const position = spec.position ?? (max > 5 ? min : 1);
  const frets = Math.max(5, max - position + 1);
  const rel = (f: number) => f - position + 1;
  const fingers: DiagramLayout["fingers"] = [];
  spec.frets.forEach((f, i) => {
    const string = n - i;
    if (f === "x") fingers.push([string, "x", undefined]);
    else if (f === 0) fingers.push([string, 0, undefined]);
    else if (rel(f) >= 1) fingers.push([string, rel(f), spec.fingers?.[i] ?? undefined]);
  });
  const barres = spec.barres.map((b) => ({ ...b, fret: rel(b.fret) })).filter((b) => b.fret >= 1);
  return { position, frets, fingers, barres };
}
