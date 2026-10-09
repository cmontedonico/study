import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseWav } from "./wav.ts";

// files.ts and transcribe.ts open the data dir on import: keep them away from the real one.
process.env.HUB_DATA_DIR = mkdtempSync(join(tmpdir(), "hub-wav-"));
const { asAudioTranscript, isAudio } = await import("./files.ts");
const { formatSegments, formatTimestamp } = await import("./transcribe.ts");

function makeWav(opts: { channels?: number; sampleRate?: number; samples: number[]; extraChunk?: boolean }) {
  const channels = opts.channels ?? 1;
  const sampleRate = opts.sampleRate ?? 16_000;
  const data = Buffer.alloc(opts.samples.length * 2);
  opts.samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  const fmt = Buffer.alloc(16);
  fmt.writeUInt16LE(1, 0);
  fmt.writeUInt16LE(channels, 2);
  fmt.writeUInt32LE(sampleRate, 4);
  fmt.writeUInt32LE(sampleRate * channels * 2, 8);
  fmt.writeUInt16LE(channels * 2, 12);
  fmt.writeUInt16LE(16, 14);
  const chunk = (id: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(id, 0, "ascii");
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const chunks = [chunk("fmt ", fmt)];
  if (opts.extraChunk) chunks.push(chunk("LIST", Buffer.from("abc"))); // odd size → padding byte
  chunks.push(chunk("data", data));
  const body = Buffer.concat([Buffer.from("WAVE"), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return new Uint8Array(Buffer.concat([riff, body]));
}

test("parseWav decodes 16-bit mono samples to floats", () => {
  const { samples, sampleRate } = parseWav(makeWav({ samples: [0, 16384, -32768, 32767] }));
  assert.equal(sampleRate, 16_000);
  assert.deepEqual(Array.from(samples.slice(0, 3)), [0, 0.5, -1]);
  assert.ok(Math.abs(samples[3]! - 0.99997) < 1e-4);
});

test("parseWav downmixes stereo and skips unknown chunks", () => {
  const { samples } = parseWav(makeWav({ channels: 2, samples: [16384, -16384, 8192, 8192], extraChunk: true }));
  assert.deepEqual(Array.from(samples), [0, 0.25]);
});

test("parseWav honours the real data length when the header lies", () => {
  const bytes = makeWav({ samples: [1, 2, 3] });
  new DataView(bytes.buffer).setUint32(bytes.length - 6 - 4, 0xffffffff, true); // data chunk size
  assert.equal(parseWav(bytes).samples.length, 3);
});

test("parseWav rejects non-WAV input", () => {
  assert.throws(() => parseWav(new Uint8Array([1, 2, 3])), /no válido/);
  assert.throws(() => parseWav(new TextEncoder().encode("RIFF....WAVE....")), /no válido/);
});

test("formatSegments groups segments into timestamped lines", () => {
  const text = formatSegments([
    { start: 0, text: " Hola" },
    { start: 12, text: " qué tal." },
    { start: 31, text: " Segundo bloque." },
    { start: 65, text: "  " },
    { start: 70, text: " Final." },
  ]);
  assert.equal(text, "[00:00] Hola qué tal.\n[00:31] Segundo bloque.\n[01:10] Final.");
  assert.equal(formatTimestamp(3725), "62:05");
});

test("audio attachments are wrapped as a transcript", () => {
  assert.equal(isAudio("audio/wav"), true);
  assert.equal(isAudio("image/png"), false);
  assert.equal(
    asAudioTranscript({ name: "nota.wav", extractedText: "hola" }),
    '<audio_transcript name="nota.wav">\nhola\n</audio_transcript>',
  );
});

test("parseRange handles open, suffix and invalid ranges", async () => {
  const { parseRange } = await import("./routes/files.ts");
  assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  assert.deepEqual(parseRange("bytes=900-", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=0-5000", 1000), { start: 0, end: 999 });
  assert.equal(parseRange("bytes=2000-3000", 1000), null);
  assert.equal(parseRange(undefined, 1000), null);
});
