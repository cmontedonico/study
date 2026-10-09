/** Sample rate Whisper expects; the client resamples to this before uploading. */
export const WHISPER_SAMPLE_RATE = 16_000;

/**
 * Parses a PCM WAV (16-bit integer or 32-bit float, any channel count) into mono Float32 samples in [-1, 1].
 * The client always sends 16 kHz mono 16-bit, but being lenient about channels keeps the endpoint easy to test.
 */
export function parseWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.byteLength < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Audio WAV no válido");

  let format: { code: number; channels: number; sampleRate: number; bits: number } | undefined;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      let code = view.getUint16(body, true);
      if (code === 0xfffe && size >= 26) code = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      format = {
        code,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new Error("Audio WAV no válido: falta el bloque fmt");
      const { code, channels, sampleRate, bits } = format;
      const bytesPerSample = bits / 8;
      if (channels < 1 || !((code === 1 && bits === 16) || (code === 3 && bits === 32))) {
        throw new Error("WAV no soportado: se espera PCM de 16 bits");
      }
      // Streamed WAVs may declare a bogus (0 or 0xFFFFFFFF) size: take what is really there.
      const available = Math.min(size, bytes.byteLength - body);
      const frames = Math.floor(available / (bytesPerSample * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let ch = 0; ch < channels; ch++) {
          const at = body + (i * channels + ch) * bytesPerSample;
          sum += code === 1 ? view.getInt16(at, true) / 32768 : view.getFloat32(at, true);
        }
        samples[i] = sum / channels;
      }
      return { samples, sampleRate };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error("Audio WAV no válido: falta el bloque data");
}
