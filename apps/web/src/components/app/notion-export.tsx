import { ExternalLinkIcon, FileUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api, type NotionExportMode, type NotionPage, type Thread } from "@/lib/api";
import { useHub } from "@/lib/hub";

const modes: { id: NotionExportMode; label: string; hint: string }[] = [
  { id: "full", label: "Conversación completa", hint: "Todos los mensajes, con código y fórmulas" },
  { id: "summary", label: "Resumen de conocimiento", hint: "Claude redacta una nota de estudio" },
  { id: "both", label: "Resumen y conversación", hint: "Nota arriba y la conversación en un desplegable" },
];

const defaultTitle = (thread: Thread) => `${thread.title} · ${new Date().toLocaleDateString("es-ES")}`;

/** Header controls: the "Exportar a Notion" button (with its dialog) and the link to the last export. */
export function NotionExport({ thread }: { thread: Thread }) {
  const { state } = useHub();
  const connected = state?.settings.notionConnected ?? false;
  const [open, setOpen] = useState(false);

  return (
    <>
      {thread.notionUrl && (
        <a
          href={thread.notionUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-xs sm:flex"
        >
          Exportado a Notion
          <ExternalLinkIcon className="size-3" />
        </a>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A disabled button swallows pointer events, so the tooltip hangs from a wrapper. */}
            <span tabIndex={connected ? -1 : 0}>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={!connected}
                onClick={() => setOpen(true)}
              >
                <FileUpIcon className="size-4" />
                <span className="sr-only">Exportar a Notion</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{connected ? "Exportar a Notion" : "Conecta Notion en Ajustes"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {open && <NotionExportDialog thread={thread} onOpenChange={setOpen} />}
    </>
  );
}

function NotionExportDialog({ thread, onOpenChange }: { thread: Thread; onOpenChange: (open: boolean) => void }) {
  const { state, refresh } = useHub();
  const [parent, setParent] = useState<{ id: string; title: string } | null>(state?.settings.notionExportParent ?? null);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [mode, setMode] = useState<NotionExportMode>("full");
  const [title, setTitle] = useState(() => defaultTitle(thread));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    setSearchError(null);
    if (!q) {
      setPages([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.notionPages(q, controller.signal).then(
        (r) => {
          setPages(r.pages);
          setSearching(false);
        },
        (e: Error) => {
          if (controller.signal.aborted) return;
          setSearchError(e.message);
          setSearching(false);
        },
      );
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function submit() {
    if (!parent) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.notionExport(thread.id, {
        parentId: parent.id,
        parentTitle: parent.title,
        mode,
        title: title.trim(),
      });
      toast.success("Exportado a Notion", {
        action: { label: "Abrir en Notion", onClick: () => window.open(url, "_blank", "noreferrer") },
        duration: 15000,
      });
      onOpenChange(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar a Notion</DialogTitle>
          <DialogDescription>
            Guarda lo aprendido en una página de Notion antes de compactar o borrar el chat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="notion-parent-search">Página de destino</Label>
            {parent && (
              <div className="bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
                <span className="truncate">{parent.title || "Página seleccionada"}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setParent(null)}>
                  Cambiar
                </Button>
              </div>
            )}
            {!parent && (
              <>
                <Input
                  id="notion-parent-search"
                  placeholder="Busca una página de Notion…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                <div className="max-h-44 overflow-y-auto" aria-live="polite">
                  {searching && (
                    <div className="text-muted-foreground flex items-center gap-2 px-1 py-2 text-sm">
                      <Spinner className="size-4" /> Buscando…
                    </div>
                  )}
                  {searchError && <p className="text-destructive px-1 py-2 text-sm">{searchError}</p>}
                  {!searching && !searchError && query.trim() && pages.length === 0 && (
                    <p className="text-muted-foreground px-1 py-2 text-sm">Sin resultados</p>
                  )}
                  {pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setParent({ id: p.id, title: p.title })}
                      className="hover:bg-muted flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm"
                    >
                      <span className="truncate">{p.title}</span>
                      {p.path && <span className="text-muted-foreground truncate text-xs">{p.path}</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Contenido</Label>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Contenido">
              {modes.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                    mode === m.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-muted-foreground text-xs">{m.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notion-title">Título</Label>
            <Input id="notion-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <p className="text-muted-foreground text-xs">
            Cada exportación crea una página nueva (no actualiza las anteriores). Los archivos adjuntos se listan por
            nombre; las transcripciones de audio se incluyen como texto.
          </p>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!parent || !title.trim() || busy} onClick={() => void submit()}>
            {busy && <Spinner className="size-4" />}
            {busy ? (mode === "full" ? "Exportando…" : "Generando y exportando…") : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
