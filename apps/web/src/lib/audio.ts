/** Whisper wants 16 kHz mono; converting in the browser means the server needs no ffmpeg. */
const TARGET_RATE = 16_000;
const MAX_SECONDS = 60 * 60;

const audioExtensions = /\.(m4a|mp3|wav|ogg|oga|opus|aac|flac|caf|webm|weba|amr|3gp)$/i;

/** Some platforms report "" or a generic type for voice notes, so fall back to the extension. */
export function isAudioFile(mediaType: string | undefined, filename: string | undefined): boolean {
  if (mediaType?.startsWith("audio/")) return true;
  return (!mediaType || mediaType === "application/octet-stream") && audioExtensions.test(filename ?? "");
}

/** Decodes any audio the browser understands (works on insecure origins too) to mono 16 kHz samples. */
export async function decodeAudio(data: ArrayBuffer): Promise<Float32Array> {
  // An offline context resamples during decoding, so a 60 min stereo 48 kHz file is held at 16 kHz.
  const context = new OfflineAudioContext(1, 1, TARGET_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(data);
  } catch {
    throw new Error("No se pudo leer el audio: formato no compatible con este navegador");
  }
  if (buffer.sampleRate !== TARGET_RATE) buffer = await resample(buffer);
  const mono = new Float32Array(buffer.length);
  const channels = buffer.numberOfChannels;
  for (let ch = 0; ch < channels; ch++) {
    const samples = buffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) mono[i]! += samples[i]! / channels;
  }
  return mono;
}

async function resample(buffer: AudioBuffer): Promise<AudioBuffer> {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * TARGET_RATE), TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Blob {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/** Any audio blob (file or recording) → 16 kHz mono WAV. */
export async function toWav(blob: Blob): Promise<Blob> {
  const samples = await decodeAudio(await blob.arrayBuffer());
  if (samples.length > MAX_SECONDS * TARGET_RATE) throw new Error(`El audio supera el máximo de ${MAX_SECONDS / 60} minutos`);
  return encodeWav(samples);
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
