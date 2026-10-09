import { MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { formatDuration, toWav } from "@/lib/audio";
import { useModelStatusLabel } from "@/components/app/audio-uploads";

const MAX_SECONDS = 15 * 60;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export const INSECURE_MESSAGE =
  "El dictado necesita HTTPS: usa «tailscale serve» (ver README) o el dictado del teclado.";

/** getUserMedia only exists on https:// and localhost. */
export function canRecord() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Inserts text at the caret (or appends with a space) and notifies React as if the user had typed it. */
function insertIntoTextarea(textarea: HTMLTextAreaElement, text: string) {
  const { value } = textarea;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";
  const inserted = lead + text + trail;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, before + inserted + after);
  const caret = before.length + inserted.length;
  textarea.setSelectionRange(caret, caret);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
}

type Phase = "idle" | "recording" | "transcribing";

/** Mic button for the prompt toolbar: record → local Whisper on the server → text in the textarea. */
export function DictationButton() {
  const supported = canRecord();
  const anchor = useRef<HTMLSpanElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const modelLabel = useModelStatusLabel(phase === "transcribing");

  const textarea = () => anchor.current?.closest("form")?.querySelector("textarea") ?? null;

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const finish = useCallback(async (chunks: Blob[], type: string) => {
    if (cancelled.current) return setPhase("idle");
    setPhase("transcribing");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const wav = await toWav(new Blob(chunks, { type }));
      const { text } = await api.transcribe(wav, controller.signal);
      const target = textarea();
      if (!text.trim()) toast.info("No se entendió nada. Inténtalo de nuevo.");
      else if (target) insertIntoTextarea(target, text.trim());
    } catch (e) {
      if (!controller.signal.aborted) toast.error((e as Error).message);
    } finally {
      abort.current = null;
      setPhase("idle");
    }
  }, []);

  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    abort.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    else setPhase("idle");
  }, []);

  async function start() {
    if (!supported) return void toast.info(INSECURE_MESSAGE);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      toast.error(
        denied
          ? "Permiso de micrófono denegado: actívalo en Ajustes del Sistema → Privacidad → Micrófono"
          : "No se pudo acceder al micrófono",
      );
      return;
    }
    const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    cancelled.current = false;
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    rec.onstop = () => {
      release();
      void finish(chunks, rec.mimeType || mimeType || "audio/webm");
    };
    recorder.current = rec;
    rec.start(1000);
    setElapsed(0);
    setPhase("recording");
  }

  // Elapsed timer, auto-stop at the cap, and Esc to cancel while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const began = Date.now();
    const timer = setInterval(() => {
      const seconds = (Date.now() - began) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stop();
    }, 250);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, stop, cancel]);

  useEffect(
    () => () => {
      cancelled.current = true;
      abort.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
    },
    [release],
  );

  if (phase === "recording") {
    return (
      <span ref={anchor} className="flex items-center gap-2">
        <PromptInputButton
          onClick={stop}
          aria-label="Detener dictado"
          className="size-9 rounded-full bg-red-500/15 text-red-600 hover:bg-red-500/25 sm:size-7 dark:text-red-400"
        >
          <SquareIcon className="size-3.5 fill-red-600 text-red-600 dark:fill-red-400 dark:text-red-400" />
        </PromptInputButton>
        <span className="flex items-center gap-1.5 text-xs tabular-nums" role="status" aria-label="Grabando">
          <span className="size-2 animate-pulse rounded-full bg-red-500" />
          {formatDuration(elapsed)}
          <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground ml-1 underline">
            Cancelar
          </button>
        </span>
      </span>
    );
  }

  if (phase === "transcribing") {
    return (
      <span ref={anchor} className="text-muted-foreground flex items-center gap-2 text-xs" role="status">
        <Spinner className="size-4" />
        <span className="max-w-56 truncate sm:max-w-none">{modelLabel ?? "Transcribiendo…"}</span>
        <button type="button" onClick={cancel} className="hover:text-foreground underline">
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <span ref={anchor}>
      <PromptInputButton
        onClick={() => void start()}
        aria-label={supported ? "Dictar" : "Dictar (no disponible)"}
        aria-disabled={!supported}
        title={supported ? "Dictar" : INSECURE_MESSAGE}
        className={`size-9 sm:size-7 ${supported ? "" : "opacity-40"}`}
      >
        <MicIcon className="size-4" />
      </PromptInputButton>
    </span>
  );
}
