import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutChord, parseChordBlock } from "./chord-block.ts";

test("parses a compact chord", () => {
  const r = parseChordBlock("name: Am7\nfrets: x02010\nfingers: 0 0 2 0 1 0");
  assert.ok(r.ok);
  assert.equal(r.chords[0]!.name, "Am7");
  assert.deepEqual(r.chords[0]!.frets, ["x", 0, 2, 0, 1, 0]);
  assert.deepEqual(r.chords[0]!.fingers, [null, null, "2", null, "1", null]);
});

test("parses several chords and separated frets", () => {
  const r = parseChordBlock("name: C\nfrets: x32010\n\nname: Bm\nfrets: x-2-4-4-3-2\nbarre: 2 5-1\nposition: 2\n---\nfrets: 022000");
  assert.ok(r.ok);
  assert.equal(r.chords.length, 3);
  assert.deepEqual(r.chords[1]!.barres, [{ fret: 2, fromString: 5, toString: 1 }]);
  assert.equal(r.chords[1]!.position, 2);
});

test("reports errors instead of throwing", () => {
  assert.ok(!parseChordBlock("").ok);
  assert.ok(!parseChordBlock("name: X").ok);
  assert.ok(!parseChordBlock("frets: x02").ok);
  assert.ok(!parseChordBlock("frets: x02010\nfoo: 1").ok);
  assert.ok(!parseChordBlock("frets: x02010\nbarre: 1 9-1").ok);
  assert.ok(!parseChordBlock("frets: x02010\nfingers: 1 2").ok);
});

test("layout: open chord starts at the nut, string 6 is the low E", () => {
  const r = parseChordBlock("frets: x02210");
  assert.ok(r.ok);
  const l = layoutChord(r.chords[0]!);
  assert.equal(l.position, 1);
  assert.equal(l.frets, 5);
  assert.deepEqual(l.fingers[0], [6, "x", undefined]);
  assert.deepEqual(l.fingers[2], [4, 2, undefined]);
});

test("layout: high chord gets an automatic position", () => {
  const r = parseChordBlock("frets: 577655\nbarre: 5 6-1");
  assert.ok(r.ok);
  const l = layoutChord(r.chords[0]!);
  assert.equal(l.position, 5);
  assert.deepEqual(l.barres, [{ fret: 1, fromString: 6, toString: 1 }]);
  assert.deepEqual(l.fingers[1], [5, 3, undefined]);
});
