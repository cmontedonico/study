import { existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./paths.ts";
import { parseWav, WHISPER_SAMPLE_RATE } from "./wav.ts";

// Multilingual Whisper large-v3-turbo, 4-bit weights: ~740 MB, ~11 s per minute of audio on Apple Silicon.
export const MODEL_ID = "onnx-community/whisper-large-v3-turbo";
export const MODEL_DTYPE = "q4";
export const MODEL_APPROX_MB = 740;
export const modelsDir = join(dataDir, "models");

/** Longest audio accepted (the WAV the client sends is ~1.9 MB per minute). */
export const MAX_AUDIO_SECONDS = 60 * 60;

export type ModelPhase = "idle" | "downloading" | "loading" | "ready" | "error";

export interface TranscriptionStatus {
  phase: ModelPhase;
  /** Model files are already on disk: no download needed. */
  cached: boolean;
  /** 0..1 while downloading. */
  progress: number;
  approxMb: number;
  error?: string;
}

interface Segment {
  start: number;
  text: string;
}

interface ProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

// The slice of transformers.js we use, typed by hand: its own pipeline types are far too broad to be useful.
interface Tensorish {
  data: ArrayLike<number>;
}
interface WhisperPipeline {
  (
    audio: Float32Array,
    options: Record<string, unknown>,
  ): Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
  model: {
    generation_config: { lang_to_id: Record<string, number>; decoder_start_token_id: number };
    forward: (inputs: Record<string, unknown>) => Promise<{ logits: Tensorish }>;
  };
}

let phase: ModelPhase = "idle";
let lastError: string | undefined;
const fileProgress = new Map<string, { loaded: number; total: number }>();
let loading: Promise<WhisperPipeline> | undefined;
// Imported lazily so the server starts fast and tests never touch onnxruntime.
let transformers: typeof import("@huggingface/transformers") | undefined;

export function isModelCached(): boolean {
  return existsSync(join(modelsDir, MODEL_ID, "onnx", `decoder_model_merged_${MODEL_DTYPE}.onnx`));
}

export function transcriptionStatus(): TranscriptionStatus {
  let loaded = 0;
  let total = 0;
  for (const f of fileProgress.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  return {
    phase,
    cached: isModelCached(),
    progress: total > 0 ? Math.min(1, loaded / total) : 0,
    approxMb: MODEL_APPROX_MB,
    ...(phase === "error" && lastError ? { error: lastError } : {}),
  };
}

function loadModel(): Promise<WhisperPipeline> {
  loading ??= (async () => {
    try {
      phase = isModelCached() ? "loading" : "downloading";
      fileProgress.clear();
      transformers ??= await import("@huggingface/transformers");
      transformers.env.cacheDir = modelsDir;
      const asr = await transformers.pipeline("automatic-speech-recognition", MODEL_ID, {
        dtype: MODEL_DTYPE,
        device: "cpu",
        progress_callback: (e: ProgressEvent) => {
          if (e.file && typeof e.loaded === "number" && typeof e.total === "number") {
            fileProgress.set(e.file, { loaded: e.loaded, total: e.total });
          }
          if (e.status === "ready") phase = "loading";
        },
      });
      phase = "ready";
      return asr as unknown as WhisperPipeline;
    } catch (error) {
      phase = "error";
      lastError = error instanceof Error ? error.message : String(error);
      loading = undefined; // allow a retry on the next request
      throw error;
    }
  })();
  return loading;
}

/** transformers.js does not detect the language by itself (it silently assumes English), so ask the decoder. */
async function detectLanguage(asr: WhisperPipeline, audio: Float32Array): Promise<string | undefined> {
  const { Tensor } = transformers!;
  const { lang_to_id, decoder_start_token_id } = asr.model.generation_config;
  const head = audio.subarray(0, 30 * WHISPER_SAMPLE_RATE);
  const { input_features } = await asr.processor(head);
  const { logits } = await asr.model.forward({
    input_features,
    decoder_input_ids: new Tensor("int64", BigInt64Array.from([BigInt(decoder_start_token_id)]), [1, 1]),
  });
  let best: string | undefined;
  let bestScore = -Infinity;
  for (const [token, id] of Object.entries(lang_to_id)) {
    const score = logits.data[id] ?? -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = token.replace(/^<\||\|>$/g, "");
    }
  }
  return best;
}

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  return `${mm}:${String(s % 60).padStart(2, "0")}`;
}

/** Merges Whisper segments into lines of roughly `span` seconds, each prefixed with `[mm:ss]`. */
export function formatSegments(segments: Segment[], span = 30): string {
  const lines: { start: number; text: string }[] = [];
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const last = lines.at(-1);
    if (last && seg.start - last.start < span) last.text += ` ${text}`;
    else lines.push({ start: seg.start, text });
  }
  return lines.map((l) => `[${formatTimestamp(l.start)}] ${l.text}`).join("\n");
}

// Jobs run one at a time: the model is big and onnxruntime already uses every core.
let queue: Promise<unknown> = Promise.resolve();

export interface TranscribeOptions {
  /** Prefix coarse `[mm:ss]` markers (used for attachments; dictation wants plain text). */
  timestamps?: boolean;
}

export function transcribe(audio: Float32Array, options: TranscribeOptions = {}): Promise<string> {
  const job = queue.then(async () => {
    if (audio.length < WHISPER_SAMPLE_RATE * 0.3) return "";
    if (audio.length > MAX_AUDIO_SECONDS * WHISPER_SAMPLE_RATE) {
      throw new Error(`El audio supera el máximo de ${MAX_AUDIO_SECONDS / 60} minutos`);
    }
    const asr = await loadModel();
    const language = await detectLanguage(asr, audio);
    const result = await asr(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      ...(language ? { language } : {}),
      ...(options.timestamps ? { return_timestamps: true } : {}),
    });
    if (options.timestamps && result.chunks?.length) {
      return formatSegments(result.chunks.map((c) => ({ start: c.timestamp[0], text: c.text })));
    }
    return result.text.trim();
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Transcript stored with an audio attachment: timestamps help when the model is asked about a moment. */
export async function transcribeWavBytes(bytes: Uint8Array): Promise<string> {
  const { samples, sampleRate } = parseWav(bytes);
  if (sampleRate !== WHISPER_SAMPLE_RATE) throw new Error("El audio debe ser WAV de 16 kHz");
  return transcribe(samples, { timestamps: true });
}
