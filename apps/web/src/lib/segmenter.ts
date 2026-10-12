/** Splits a live 16 kHz mono stream into speech segments for near-live dictation. Pure: no DOM, no timers. */
export const SEGMENT_RATE = 16_000;

export interface SegmenterOptions {
  frameMs: number;
  /** Silence that closes a segment. */
  silenceMs: number;
  /** Once a segment is longer than `softSeconds`, a shorter pause (`softSilenceMs`) is enough to close it. */
  softSeconds: number;
  softSilenceMs: number;
  /** Hard cap: longer speech is cut at its quietest moment. */
  maxSeconds: number;
  /** Segments with less speech than this are clicks/noise and are dropped. */
  minSpeechMs: number;
  /** Silence kept around the speech so Whisper does not hear clipped words. */
  padMs: number;
  /** Absolute floor for the speech threshold (RMS, 0..1). */
  minThreshold: number;
  /** Speech threshold = max(minThreshold, noise floor * noiseFactor). */
  noiseFactor: number;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  frameMs: 20,
  silenceMs: 500,
  softSeconds: 4,
  softSilenceMs: 200,
  maxSeconds: 8,
  minSpeechMs: 150,
  padMs: 200,
  minThreshold: 0.01,
  noiseFactor: 3,
};

export interface AudioSegment {
  samples: Float32Array;
  /** Position of the first sample in the whole stream. */
  startSample: number;
  /** RMS over the voiced frames. */
  rms: number;
}

interface Frame {
  data: Float32Array;
  energy: number;
  voiced: boolean;
  start: number;
}

export function rms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export class Segmenter {
  private readonly o: SegmenterOptions;
  private readonly frameSize: number;
  private leftover = new Float32Array(0);
  private position = 0;
  private noiseFloor = 0.003;
  private preroll: Frame[] = [];
  private seg: Frame[] = [];
  private silence = 0;

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.o = { ...DEFAULT_SEGMENTER, ...options };
    this.frameSize = Math.round((SEGMENT_RATE * this.o.frameMs) / 1000);
  }

  /** Feeds any amount of samples; returns the segments that closed. */
  push(chunk: Float32Array): AudioSegment[] {
    const input = this.leftover.length ? concat([this.leftover, chunk]) : chunk;
    const out: AudioSegment[] = [];
    let offset = 0;
    for (; offset + this.frameSize <= input.length; offset += this.frameSize) {
      const data = input.slice(offset, offset + this.frameSize);
      const segment = this.frame({ data, energy: rms(data), voiced: false, start: this.position });
      this.position += this.frameSize;
      if (segment) out.push(segment);
    }
    this.leftover = input.slice(offset);
    return out;
  }

  /** Call when the recording stops: emits whatever speech is still open. */
  flush(): AudioSegment | null {
    const segment = this.seg.length ? this.build(this.seg) : null;
    this.seg = [];
    this.preroll = [];
    this.silence = 0;
    this.leftover = new Float32Array(0);
    return segment;
  }

  private get padFrames() {
    return Math.round(this.o.padMs / this.o.frameMs);
  }

  private frame(f: Frame): AudioSegment | null {
    const threshold = Math.max(this.o.minThreshold, this.noiseFloor * this.o.noiseFactor);
    f.voiced = f.energy >= threshold;
    if (!this.seg.length) {
      if (!f.voiced) {
        this.noiseFloor = this.noiseFloor * 0.95 + f.energy * 0.05;
        this.preroll.push(f);
        if (this.preroll.length > this.padFrames) this.preroll.shift();
        return null;
      }
      this.seg = [...this.preroll, f];
      this.preroll = [];
      this.silence = 0;
      return null;
    }
    this.seg.push(f);
    this.silence = f.voiced ? 0 : this.silence + 1;
    const long = this.seg.length * this.o.frameMs >= this.o.softSeconds * 1000;
    if (this.silence >= (long ? this.o.softSilenceMs : this.o.silenceMs) / this.o.frameMs) {
      const frames = this.seg.slice(0, this.seg.length - this.silence + this.padFrames);
      this.seg = [];
      this.silence = 0;
      return this.build(frames);
    }
    if (this.seg.length >= (this.o.maxSeconds * 1000) / this.o.frameMs) return this.cut();
    return null;
  }

  /** Cuts at the quietest frame of the last 2 s so a word is rarely split. */
  private cut(): AudioSegment | null {
    const window = Math.round(2000 / this.o.frameMs);
    let best = this.seg.length - 1;
    for (let i = this.seg.length - 1; i >= this.seg.length - window; i--) {
      if (this.seg[i]!.energy < this.seg[best]!.energy) best = i;
    }
    const head = this.seg.slice(0, best + 1);
    this.seg = this.seg.slice(best + 1);
    this.silence = 0;
    for (let i = this.seg.length - 1; i >= 0 && !this.seg[i]!.voiced; i--) this.silence++;
    return this.build(head);
  }

  private build(frames: Frame[]): AudioSegment | null {
    const voiced = frames.filter((f) => f.voiced);
    if (voiced.length * this.o.frameMs < this.o.minSpeechMs) return null;
    const energy = Math.sqrt(voiced.reduce((sum, f) => sum + f.energy * f.energy, 0) / voiced.length);
    return { samples: concat(frames.map((f) => f.data)), startSample: frames[0]!.start, rms: energy };
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Streaming box-filter resampler (mic rate → 16 kHz) for browsers that ignore the AudioContext sampleRate. */
export class Resampler {
  private acc = 0;
  private count = 0;
  private phase = 0;
  private readonly step: number;

  constructor(fromRate: number, toRate = SEGMENT_RATE) {
    this.step = fromRate / toRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.step === 1) return input;
    const out: number[] = [];
    for (let i = 0; i < input.length; i++) {
      this.acc += input[i]!;
      this.count++;
      this.phase++;
      if (this.phase >= this.step) {
        out.push(this.acc / this.count);
        this.acc = 0;
        this.count = 0;
        this.phase -= this.step;
      }
    }
    return Float32Array.from(out);
  }
}
