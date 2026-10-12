import { MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api";
import { encodeWav, formatDuration } from "@/lib/audio";
import { useModelStatusLabel } from "@/components/app/audio-uploads";
import { canCapture, captureMic } from "@/lib/live-capture";
import { rms, SEGMENT_RATE, Segmenter, type AudioSegment } from "@/lib/segmenter";

const MAX_SECONDS = 15 * 60;
/** Detection on a very short segment is unreliable; only lock the language from a segment at least this long. */
const MIN_SECONDS_TO_LOCK_LANGUAGE = 1.5;

export const INSECURE_MESSAGE =
  "El dictado necesita HTTPS: usa «tailscale serve» (ver README) o el dictado del teclado.";

/** getUserMedia only exists on https:// and localhost. */
export function canRecord() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && canCapture();
}

/**
 * Inserts text at `at` (default: the selection) or appends with a space, and notifies React as if the user had
 * typed it. Returns the caret position after the insertion.
 */
function insertIntoTextarea(textarea: HTMLTextAreaElement, text: string, at?: number): number {
  const { value } = textarea;
  const start = at ?? textarea.selectionStart ?? value.length;
  const end = at ?? textarea.selectionEnd ?? value.length;
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
  return caret;
}

/** Everything that belongs to one dictation, so a stale callback can never touch the next one. */
interface Session {
  segmenter: Segmenter;
  chain: Promise<void>;
  controller: AbortController;
  language?: string;
  caret: number | null;
  inserted: number;
  level: number;
  cancelled: boolean;
  stopCapture?: () => void;
  stream?: MediaStream;
}

/**
 * Mic button for the prompt toolbar. Audio is cut at pauses (or every ~8 s) and each piece goes to the local
 * Whisper on the server, in order; the text lands in the textarea while the user keeps talking.
 */
export function DictationButton() {
  const supported = canRecord();
  const anchor = useRef<HTMLSpanElement>(null);
  const session = useRef<Session | null>(null);
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const modelLabel = useModelStatusLabel(pending > 0);

  const textarea = () => anchor.current?.closest("form")?.querySelector("textarea") ?? null;

  const insert = (s: Session, text: string) => {
    const target = textarea();
    if (!target) return;
    const selection = target.selectionStart ?? target.value.length;
    // Follow the user's caret if they moved it (or typed) since our last insertion.
    const moved = s.caret === null || (document.activeElement === target && selection !== s.caret);
    const at = Math.min(moved ? selection : s.caret!, target.value.length);
    s.caret = insertIntoTextarea(target, text, at);
    s.inserted++;
  };

  const enqueue = (s: Session, segment: AudioSegment) => {
    setPending((n) => n + 1);
    const seconds = segment.samples.length / SEGMENT_RATE;
    // Sequential on purpose: segments must land in the order they were spoken.
    s.chain = s.chain.then(async () => {
      try {
        if (s.cancelled) return;
        const { text, language } = await api.transcribeLive(encodeWav(segment.samples), s.language, s.controller.signal);
        if (s.cancelled) return;
        const clean = text.trim();
        if (language && !s.language && clean && seconds >= MIN_SECONDS_TO_LOCK_LANGUAGE) s.language = language;
        if (clean) insert(s, clean);
      } catch (e) {
        if (!s.cancelled) toast.error((e as Error).message);
      } finally {
        if (!s.cancelled) setPending((n) => Math.max(0, n - 1));
      }
    });
  };

  const teardown = useCallback((s: Session) => {
    s.stopCapture?.();
    s.stream?.getTracks().forEach((t) => t.stop());
    s.stopCapture = undefined;
    s.stream = undefined;
  }, []);

  const stop = () => {
    const s = session.current;
    if (!s || s.cancelled) return;
    teardown(s);
    const last = s.segmenter.flush();
    if (last) enqueue(s, last);
    setRecording(false);
    void s.chain.then(() => {
      if (s.cancelled || session.current !== s) return;
      session.current = null;
      if (!s.inserted) toast.info("No se entendió nada. Inténtalo de nuevo.");
    });
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const cancel = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.cancelled = true;
    s.controller.abort();
    teardown(s);
    session.current = null;
    setRecording(false);
    setPending(0);
  }, [teardown]);

  async function start() {
    if (!supported) return void toast.info(INSECURE_MESSAGE);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      toast.error(
        denied
          ? "Permiso de micrófono denegado: actívalo en Ajustes del Sistema → Privacidad → Micrófono"
          : "No se pudo acceder al micrófono",
      );
      return;
    }
    const s: Session = {
      segmenter: new Segmenter(),
      chain: Promise.resolve(),
      controller: new AbortController(),
      caret: null,
      inserted: 0,
      level: 0,
      cancelled: false,
      stream,
    };
    try {
      s.stopCapture = await captureMic(stream, (samples) => {
        s.level = Math.max(rms(samples), s.level * 0.85);
        for (const segment of s.segmenter.push(samples)) enqueue(s, segment);
      });
    } catch {
      teardown(s);
      toast.error("No se pudo iniciar la captura de audio");
      return;
    }
    session.current = s;
    // Loads (and warms) the model while the user starts talking.
    void api.warmTranscription().catch(() => undefined);
    setElapsed(0);
    setRecording(true);
  }

  // Elapsed timer, level meter, auto-stop at the cap, and Esc to cancel while recording.
  useEffect(() => {
    if (!recording) return;
    const began = Date.now();
    const timer = setInterval(() => {
      const seconds = (Date.now() - began) / 1000;
      setElapsed(Math.floor(seconds));
      setLevel(Math.min(1, Math.sqrt(session.current?.level ?? 0) * 2));
      if (seconds >= MAX_SECONDS) stopRef.current();
    }, 100);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [recording, cancel]);

  useEffect(() => () => cancel(), [cancel]);

  if (recording) {
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
          <span aria-hidden className="bg-muted h-1.5 w-10 overflow-hidden rounded-full">
            <span
              className="block h-full rounded-full bg-red-500 transition-[width] duration-100"
              style={{ width: `${level * 100}%` }}
            />
          </span>
          {pending > 0 && (
            <span className="text-muted-foreground flex items-center gap-1" data-testid="dictation-pending">
              <Spinner className="size-3" />
              <span className="max-w-40 truncate">{modelLabel ?? "transcribiendo…"}</span>
            </span>
          )}
          <button type="button" onClick={cancel} className="text-muted-foreground hover:text-foreground ml-1 underline">
            Cancelar
          </button>
        </span>
      </span>
    );
  }

  if (pending > 0) {
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
