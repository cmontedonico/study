import { Resampler, SEGMENT_RATE } from "./segmenter.ts";

// Runs on the audio thread; batches the 128-sample render quanta so the main thread is not flooded.
const WORKLET = `
class PcmTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-tap", PcmTap);
`;

export function canCapture(): boolean {
  return typeof AudioContext !== "undefined" && typeof AudioWorkletNode !== "undefined";
}

/** Streams the microphone as 16 kHz mono Float32 blocks. Returns a function that stops everything. */
export async function captureMic(stream: MediaStream, onSamples: (samples: Float32Array) => void) {
  // Asking for 16 kHz lets the browser resample; the Resampler below covers engines that ignore the hint.
  const context = new AudioContext({ sampleRate: SEGMENT_RATE });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const resampler = new Resampler(context.sampleRate);
  const source = context.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(context, "pcm-tap", { numberOfOutputs: 1, outputChannelCount: [1] });
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => onSamples(resampler.process(e.data));
  // The graph is only pulled when it reaches the destination; a muted gain keeps the mic out of the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(context.destination);
  await context.resume();
  return () => {
    tap.port.onmessage = null;
    source.disconnect();
    tap.disconnect();
    void context.close();
  };
}
