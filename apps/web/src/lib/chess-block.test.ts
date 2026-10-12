import assert from "node:assert/strict";
import { test } from "node:test";
import { moveLabel, parseArrows, parseChessBlock, sanToSpanish } from "./chess-block.ts";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("fen: full, placement-only and options", () => {
  const d = parseChessBlock("fen", `${START}\norientation: black\narrows: e2e4, g1-f3\ncaption: Inicio`);
  assert.ok(d);
  assert.equal(d.orientation, "black");
  assert.deepEqual(d.arrows, [{ from: "e2", to: "e4" }, { from: "g1", to: "f3" }]);
  assert.equal(d.caption, "Inicio");
  assert.equal(parseChessBlock("fen", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")?.steps[0].fen, START.replace("KQkq", "-"));
  const partial = parseChessBlock("fen", "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3");
  assert.equal(partial?.steps[0].fen.endsWith("e3 0 1"), true);
});

test("fen: invalid input and ascii boards give null", () => {
  assert.equal(parseChessBlock("fen", "no es un fen"), null);
  assert.equal(parseChessBlock("fen", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP"), null);
  assert.equal(parseChessBlock("fen", ""), null);
  assert.equal(parseChessBlock("fen", "  a b c d e f g h\n8 r . b q k b . r"), null);
});

test("pgn: moves, headers, invalid", () => {
  const d = parseChessBlock("pgn", "caption: Italiana\n1. e4 e5 2. Nf3 Nc6 3. Bc4");
  assert.ok(d);
  assert.equal(d.steps.length, 6);
  assert.equal(d.steps[0].fen, START);
  assert.equal(d.steps[5].san, "Bc4");
  assert.equal(d.steps[1].from, "e2");
  assert.ok(parseChessBlock("pgn", '[Event "x"]\n\n1. d4 d5 *'));
  assert.equal(parseChessBlock("pgn", "1. e4 e5 2. Ke4"), null);
  assert.equal(parseChessBlock("pgn", "hola"), null);
});

test("pgn: black to move from a FEN tag", () => {
  const d = parseChessBlock(
    "pgn",
    '[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"]\n\n1... c5',
  );
  assert.ok(d);
  assert.equal(moveLabel(1, d.steps[0].fen, "c5"), "1... c5");
});

test("spanish labels", () => {
  assert.equal(sanToSpanish("Nxf7+"), "Cxf7+");
  assert.equal(sanToSpanish("e8=Q#"), "e8=D#");
  assert.equal(sanToSpanish("O-O"), "O-O");
  assert.equal(moveLabel(4, START, "Nc6"), "2... Cc6");
  assert.deepEqual(parseArrows("e2e4 zz"), [{ from: "e2", to: "e4" }]);
});
