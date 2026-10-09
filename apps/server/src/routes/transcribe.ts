import { Hono } from "hono";
import { transcribe, transcriptionStatus } from "../transcribe.ts";
import { parseWav, WHISPER_SAMPLE_RATE } from "../wav.ts";

export const transcribeRoutes = new Hono();

/** Model state, so the UI can say "downloading the model (once)…" instead of looking stuck. */
transcribeRoutes.get("/status", (c) => c.json(transcriptionStatus()));

/** Body: a 16 kHz mono 16-bit WAV (the client converts whatever the browser can decode). */
transcribeRoutes.post("/", async (c) => {
  const { samples, sampleRate } = parseWav(new Uint8Array(await c.req.arrayBuffer()));
  if (sampleRate !== WHISPER_SAMPLE_RATE) throw new Error("El audio debe ser WAV de 16 kHz");
  const text = await transcribe(samples, { timestamps: c.req.query("timestamps") === "1" });
  return c.json({ text });
});
