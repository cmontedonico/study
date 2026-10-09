import type { FileUIPart } from "ai";
import { ChevronDownIcon, MicIcon } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api, type TranscriptionStatus } from "@/lib/api";
import { toWav } from "@/lib/audio";

type Stage = "converting" | "transcribing" | "done" | "error";

interface Job {
  stage: Stage;
  error?: string;
  promise: Promise<FileUIPart>;
}

interface PendingAudio {
  id: string;
  url: string;
  filename?: string;
}

interface AudioUploads {
  stageOf: (id: string) => { stage: Stage; error?: string } | undefined;
  /** Starts (once) converting + uploading + transcribing a picked audio file. */
  ensure: (file: PendingAudio) => Promise<FileUIPart>;
  /** True while any of the given picked files has not finished transcribing. */
  blocks: (ids: string[]) => boolean;
}

const Context = createContext<AudioUploads | null>(null);

export function useAudioUploads() {
  const value = useContext(Context);
  if (!value) throw new Error("AudioUploadsProvider missing");
  return value;
}

/**
 * Audio picked in the prompt is converted to 16 kHz WAV in the browser, uploaded and transcribed on the server
 * as soon as it is attached, so sending later is instant and the chip can show progress.
 */
export function AudioUploadsProvider({ children }: { children: React.ReactNode }) {
  const jobs = useRef(new Map<string, Job>());
  const [version, rerender] = useReducer((n: number) => n + 1, 0);

  const ensure = useCallback((file: PendingAudio) => {
    const existing = jobs.current.get(file.id);
    if (existing) return existing.promise;
    const job: Job = {
      stage: "converting",
      promise: undefined as unknown as Promise<FileUIPart>,
    };
    job.promise = (async () => {
      const blob = await (await fetch(file.url)).blob();
      const wav = await toWav(blob);
      job.stage = "transcribing";
      rerender();
      const name = (file.filename ?? "audio").replace(/\.[^.]*$/, "") + ".wav";
      const saved = await api.uploadFile(new File([wav], name, { type: "audio/wav" }));
      job.stage = "done";
        return { ...saved, filename: name };
    })();
    job.promise.then(
      () => rerender(),
      (e: Error) => {
        job.stage = "error";
        job.error = e.message;
        rerender();
      },
    );
    jobs.current.set(file.id, job);
    rerender();
    return job.promise;
  }, []);

  const value = useMemo<AudioUploads>(
    () => ({
      stageOf: (id) => jobs.current.get(id),
      ensure,
      blocks: (ids) => ids.some((id) => jobs.current.get(id)?.stage !== "done"),
    }),
    // A new value on every job update makes consumers re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensure, version],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Polls the model state while something waits on it; returns a label only if the model is downloading/loading. */
export function useModelStatusLabel(active: boolean): string | null {
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  useEffect(() => {
    if (!active) return setStatus(null);
    let stop = false;
    const tick = () =>
      api
        .transcriptionStatus()
        .then((s) => !stop && setStatus(s))
        .catch(() => undefined);
    void tick();
    const timer = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [active]);
  if (!status) return null;
  if (status.phase === "downloading") {
    return `Descargando modelo de transcripción (una sola vez, ~${status.approxMb} MB)… ${Math.round(status.progress * 100)}%`;
  }
  if (status.phase === "loading") return "Cargando modelo de transcripción…";
  return null;
}

/** Text shown on a pending audio chip. */
export function AudioChipStatus({ stage, error }: { stage: Stage; error?: string }) {
  const model = useModelStatusLabel(stage === "transcribing");
  if (stage === "error") return <span className="text-destructive">{error ?? "Error"}</span>;
  if (stage === "converting") return <span>Preparando audio…</span>;
  if (stage === "transcribing") return <span>{model ?? "Transcribiendo…"}</span>;
  return <span>Transcrito</span>;
}

/** Audio in a sent message: player plus the transcript Claude received, collapsed. */
export function AudioAttachment({ part }: { part: FileUIPart }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!open || text !== null) return;
    api
      .fileTranscript(part.url)
      .then((t) => setText(t.text))
      .catch((e: Error) => setText(`No se pudo cargar la transcripción: ${e.message}`));
  }, [open, text, part.url]);

  return (
    <div className="bg-background flex w-full max-w-sm flex-col gap-1.5 rounded-lg border p-2 text-xs">
      <div className="flex items-center gap-1.5">
        <MicIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="truncate font-medium">{part.filename}</span>
      </div>
      <audio controls preload="metadata" src={part.url} className="h-9 w-full" />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronDownIcon className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          Transcripción
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="text-muted-foreground mt-1.5 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {text ?? "Cargando…"}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
