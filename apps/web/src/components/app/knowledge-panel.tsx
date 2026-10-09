import { FileText, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api, type KnowledgeFile } from "@/lib/api";
import { cn } from "@/lib/utils";

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Lists, uploads (button or drag & drop) and deletes the files a project uses as knowledge. */
export function KnowledgePanel({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [charLimit, setCharLimit] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toDelete, setToDelete] = useState<KnowledgeFile | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.knowledge(projectId);
      setFiles(res.files);
      setCharLimit(res.limit);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(list: FileList | File[]) {
    setUploading(true);
    try {
      for (const file of Array.from(list)) {
        setProcessing(file.name);
        try {
          const saved = await api.uploadKnowledge(projectId, file);
          if (saved.warning) toast.warning(`${file.name}: ${saved.warning}`);
        } catch (error) {
          toast.error((error as Error).message);
        }
      }
    } finally {
      setUploading(false);
      setProcessing(null);
      await load();
    }
  }

  async function remove(file: KnowledgeFile) {
    try {
      await api.deleteKnowledge(file.id);
    } catch (error) {
      toast.error((error as Error).message);
    }
    setToDelete(null);
    await load();
  }

  const totalChars = files.reduce((sum, f) => sum + f.chars, 0);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const usage = Math.min(100, charLimit ? (totalChars / charLimit) * 100 : 0);

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={cn(
          "grid justify-items-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors",
          dragging && "border-primary bg-accent",
        )}
      >
        <Upload className="text-muted-foreground size-5" />
        <p className="text-muted-foreground text-sm">
          Arrastra aquí PDFs o archivos de texto (txt, md, csv, json). Claude los leerá en todos los chats del proyecto.
        </p>
        <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? "Subiendo…" : "Subir archivos"}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".pdf,.txt,.md,.markdown,.csv,.json,text/*,application/pdf,application/json"
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(files.length > 0 || processing) && (
        <ul className="max-h-[32vh] divide-y overflow-y-auto rounded-lg border">
          {processing && (
            <li className="flex items-center gap-3 px-3 py-2" aria-live="polite">
              <LoaderCircle className="text-muted-foreground size-4 shrink-0 animate-spin" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{processing}</span>
                <span className="text-muted-foreground text-xs">
                  {/\.pdf$/i.test(processing)
                    ? "Leyendo PDF… si es un escaneo se usa OCR y puede tardar un minuto"
                    : "Procesando…"}
                </span>
              </span>
            </li>
          )}
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{file.name}</span>
                <span className="text-muted-foreground text-xs">
                  {formatSize(file.size)} · {file.chars.toLocaleString("es")} caracteres
                  {file.chars === 0 && " (sin texto legible)"}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Borrar ${file.name}`}
                onClick={() => setToDelete(file)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-1">
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div className={cn("bg-primary h-full", usage >= 100 && "bg-destructive")} style={{ width: `${usage}%` }} />
        </div>
        <p className="text-muted-foreground text-xs">
          {files.length} {files.length === 1 ? "archivo" : "archivos"} · {formatSize(totalSize)} ·{" "}
          {totalChars.toLocaleString("es")} de {charLimit.toLocaleString("es")} caracteres usados
          {totalChars > charLimit && ". El exceso se recortará al chatear."}
        </p>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Claude dejará de usar este archivo en los chats del proyecto. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && void remove(toDelete)}>Borrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
