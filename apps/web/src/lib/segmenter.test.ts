import assert from "node:assert/strict";
import { test } from "node:test";
import { Resampler, SEGMENT_RATE, Segmenter } from "./segmenter.ts";

const tone = (seconds: number, amp = 0.3) =>
  Float32Array.from({ length: Math.round(seconds * SEGMENT_RATE) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / SEGMENT_RATE));
const silence = (seconds: number) => new Float32Array(Math.round(seconds * SEGMENT_RATE));
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const seconds = (s: { samples: Float32Array }) => s.samples.length / SEGMENT_RATE;

function run(audio: Float32Array, chunk = audio.length) {
  const seg = new Segmenter();
  const out = [];
  for (let i = 0; i < audio.length; i += chunk) out.push(...seg.push(audio.subarray(i, i + chunk)));
  const last = seg.flush();
  if (last) out.push(last);
  return out;
}

test("closes a segment at a pause and keeps a little padding", () => {
  const out = run(join(silence(1), tone(1), silence(1), tone(1.5), silence(1)));
  assert.equal(out.length, 2);
  assert.ok(seconds(out[0]!) > 1.2 && seconds(out[0]!) < 1.6, String(seconds(out[0]!)));
  assert.ok(out[0]!.startSample < 1.0 * SEGMENT_RATE && out[0]!.startSample > 0.7 * SEGMENT_RATE);
  assert.ok(out[0]!.rms > 0.1);
});

test("a pause shorter than 500 ms does not split", () => {
  assert.equal(run(join(tone(1), silence(0.3), tone(1), silence(1))).length, 1);
});

test("after 4 s a short pause is enough to close the segment", () => {
  const out = run(join(tone(5), silence(0.3), tone(5), silence(1)));
  assert.equal(out.length, 2);
  assert.ok(seconds(out[0]!) < 5.6, String(seconds(out[0]!)));
});

test("silence and clicks yield nothing", () => {
  assert.equal(run(silence(5)).length, 0);
  assert.equal(run(join(silence(1), tone(0.06), silence(1))).length, 0);
});

test("uniform low noise does not count as speech", () => {
  const noise = Float32Array.from({ length: 5 * SEGMENT_RATE }, (_, i) => 0.004 * Math.sin(i));
  assert.equal(run(noise).length, 0);
});

test("long continuous speech is cut near the cap without losing audio", () => {
  const audio = tone(20);
  const out = run(audio);
  assert.ok(out.length >= 3);
  for (const s of out) assert.ok(seconds(s) <= 8.1, String(seconds(s)));
  assert.equal(out.reduce((n, s) => n + s.samples.length, 0), audio.length);
});

test("flush emits speech still open when recording stops", () => {
  const seg = new Segmenter();
  assert.equal(seg.push(join(silence(0.5), tone(1))).length, 0);
  const last = seg.flush();
  assert.ok(last && seconds(last) > 1);
  assert.equal(seg.flush(), null);
});

test("chunk size does not change the result", () => {
  const audio = join(silence(0.5), tone(1), silence(1), tone(2), silence(0.7));
  const a = run(audio).map((s) => s.samples.length);
  assert.deepEqual(run(audio, 1000).map((s) => s.samples.length), a);
  assert.deepEqual(run(audio, 128).map((s) => s.samples.length), a);
});

test("resampler 48 kHz → 16 kHz", () => {
  const out = new Resampler(48_000).process(new Float32Array(4800).fill(0.5));
  assert.equal(out.length, 1600);
  assert.ok(Math.abs(out[10]! - 0.5) < 1e-6);
});
