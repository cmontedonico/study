import { Hono } from "hono";
import { transcribe, transcribeLive, transcriptionStatus, warmUp } from "../transcribe.ts";
import { parseWav, WHISPER_SAMPLE_RATE } from "../wav.ts";

export const transcribeRoutes = new Hono();

/** Model state, so the UI can say "downloading the model (once)…" instead of looking stuck. */
transcribeRoutes.get("/status", (c) => c.json(transcriptionStatus()));

/** Body: a 16 kHz mono 16-bit WAV (the client converts whatever the browser can decode). */
transcribeRoutes.post("/", async (c) => {
  const { samples, sampleRate } = parseWav(new Uint8Array(await c.req.arrayBuffer()));
  if (sampleRate !== WHISPER_SAMPLE_RATE) throw new Error("El audio debe ser WAV de 16 kHz");
  if (c.req.query("live") === "1") {
    const language = c.req.query("language");
    return c.json(await transcribeLive(samples, language && /^[a-z]{2,3}$/.test(language) ? language : undefined));
  }
  const text = await transcribe(samples, { timestamps: c.req.query("timestamps") === "1" });
  return c.json({ text });
});

/** Called when dictation starts, so the model is loaded and warm by the time the first segment arrives. */
transcribeRoutes.post("/warm", (c) => {
  void warmUp().catch(() => undefined);
  return c.json({ ok: true });
});
