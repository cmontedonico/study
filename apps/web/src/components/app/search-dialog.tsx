import { Folder, MessageSquare } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { api, type SearchResult } from "@/lib/api";
import { useHub } from "@/lib/hub";

/** Renders FTS snippets safely: only the `<mark>` delimiters are interpreted, everything else is text. */
function Highlighted({ text }: { text: string }) {
  const chunks = text.split(/<\/?mark>/);
  // After splitting on both delimiters, odd indexes are the highlighted parts.
  return (
    <>
      {chunks.map((chunk, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
            {chunk}
          </mark>
        ) : (
          <Fragment key={i}>{chunk}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, openThread } = useHub();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearched(false);
      return;
    }
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .search(query, controller.signal)
        .then((found) => {
          setResults(found);
          setSearched(true);
        })
        .catch(() => undefined); // aborted or offline: keep the previous results
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const projectName = (id: string | null) => state?.projects.find((p) => p.id === id)?.name;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar"
      description="Busca en el título y el contenido de todos los chats"
    >
        <Command shouldFilter={false}>
        <CommandInput placeholder="Buscar en todos los chats…" value={query} onValueChange={setQuery} />
        <CommandList>
          {searched && results.length === 0 && <CommandEmpty>Sin resultados.</CommandEmpty>}
          {results.map((r) => {
            const project = projectName(r.projectId);
            return (
              <CommandItem
                key={r.threadId}
                value={r.threadId}
                className="flex-col items-start gap-0.5"
                onSelect={() => {
                  openThread(r.threadId);
                  onOpenChange(false);
                }}
              >
                <div className="flex w-full items-center gap-2">
                  <MessageSquare className="text-muted-foreground" />
                  <span className="truncate font-medium">{r.title}</span>
                  {project && (
                    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Folder className="size-3" /> {project}
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 w-full pl-6 text-xs text-muted-foreground">
                  <Highlighted text={r.snippet} />
                </p>
              </CommandItem>
            );
          })}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
