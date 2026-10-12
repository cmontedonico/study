import { Chess, validateFen } from "chess.js";

// Format of the ```fen and ```pgn blocks the chess tutor emits:
//   ```fen                                  ```pgn
//   rnbqkbnr/pppppppp/8/8/4P3/... b KQkq    orientation: white
//   orientation: black                      caption: Defensa siciliana
//   arrows: e2e4 g1f3                       1. e4 c5 2. Nf3 d6
//   caption: Tras 1.e4                      ```
//   ```
// The body is the FEN (or the PGN movetext); "key: value" option lines may appear before or after it.
// Moves use standard English piece letters (K Q R B N); they are shown to the user in Spanish.

export type Orientation = "white" | "black";
export type BoardArrow = { from: string; to: string };

export type ChessStep = { fen: string; san: string | null; from: string | null; to: string | null };

export type ChessDiagram = {
  kind: "fen" | "pgn";
  orientation: Orientation;
  arrows: BoardArrow[];
  caption: string | null;
  /** Step 0 is the start position; a FEN block has a single step with san = null. */
  steps: ChessStep[];
};

const OPTION_RE = /^(orientation|orientacion|orientación|arrows|flechas|caption|titulo|título|title)\s*:\s*(.*)$/i;
const PLACEMENT_ONLY_RE = /^[prnbqkPRNBQK1-8]+(\/[prnbqkPRNBQK1-8]+){7}$/;

function parseOrientation(value: string): Orientation {
  return /^(black|negras?|b)$/i.test(value.trim()) ? "black" : "white";
}

export function parseArrows(value: string): BoardArrow[] {
  const arrows: BoardArrow[] = [];
  for (const token of value.split(/[\s,;]+/)) {
    const m = /^([a-h][1-8])([a-h][1-8])$/i.exec(token.replace(/[-–>]+/g, ""));
    if (m) arrows.push({ from: m[1].toLowerCase(), to: m[2].toLowerCase() });
  }
  return arrows;
}

function splitBlock(code: string) {
  const options: { orientation?: string; arrows?: string; caption?: string } = {};
  const body: string[] = [];
  for (const raw of code.split(/\r?\n/)) {
    const line = raw.trim();
    const m = OPTION_RE.exec(line);
    if (m) {
      const key = m[1].toLowerCase();
      if (key.startsWith("orient")) options.orientation = m[2];
      else if (key === "arrows" || key === "flechas") options.arrows = m[2];
      else options.caption = m[2];
    } else if (line) body.push(line);
  }
  return { options, body: body.join("\n") };
}

function normalizeFen(raw: string): string | null {
  const parts = raw.replace(/\s+/g, " ").trim().split(" ");
  if (parts.length === 1 && !PLACEMENT_ONLY_RE.test(parts[0])) return null;
  // Models often drop the trailing fields; fill them in.
  const defaults = ["w", "-", "-", "0", "1"];
  while (parts.length < 6) parts.push(defaults[parts.length - 1]);
  const fen = parts.join(" ");
  return validateFen(fen).ok ? fen : null;
}

/** Returns null when the block is not (yet) a valid diagram, so callers can fall back to plain code. */
export function parseChessBlock(kind: "fen" | "pgn", code: string): ChessDiagram | null {
  const { options, body } = splitBlock(code);
  if (!body) return null;
  const base = {
    orientation: parseOrientation(options.orientation ?? "white"),
    arrows: options.arrows ? parseArrows(options.arrows) : [],
    caption: options.caption?.trim() || null,
  };

  if (kind === "fen") {
    const fen = normalizeFen(body.split("\n")[0]);
    return fen ? { kind, ...base, steps: [{ fen, san: null, from: null, to: null }] } : null;
  }

  try {
    const game = new Chess();
    game.loadPgn(body);
    const history = game.history({ verbose: true });
    if (history.length === 0) return null;
    const steps: ChessStep[] = [{ fen: history[0].before, san: null, from: null, to: null }];
    for (const move of history) steps.push({ fen: move.after, san: move.san, from: move.from, to: move.to });
    return { kind, ...base, steps };
  } catch {
    return null;
  }
}

const SPANISH_PIECES: Record<string, string> = { K: "R", Q: "D", R: "T", B: "A", N: "C" };

/** English SAN (Nf3, Qxd5+, e8=Q) to the Spanish piece letters shown in the UI (Cf3, Dxd5+, e8=D). */
export function sanToSpanish(san: string): string {
  return san.replace(/[KQRBN]/g, (letter) => SPANISH_PIECES[letter]);
}

/** "1. e4" for white moves, "1... c5" for black ones; `index` is the 1-based step index. */
export function moveLabel(index: number, startFen: string, san: string): string {
  const ply = index - 1 + (startFen.split(" ")[1] === "b" ? 1 : 0);
  return `${Math.floor(ply / 2) + 1}${ply % 2 === 0 ? "." : "..."} ${sanToSpanish(san)}`;
}
