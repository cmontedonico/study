import { Copy, Download, Loader2, Plus, RotateCcw, Sparkles, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { downloadText, safeFileName } from "@/lib/export";
import { api, type Template, type TemplateInput } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { cn } from "@/lib/utils";
import { EmojiField } from "./emoji-field";

const empty: TemplateInput = { name: "", icon: "✨", description: "", instructions: "" };

/** Create, edit, duplicate, restore and delete templates; built-ins are editable and recoverable. */
export function TemplatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, refresh } = useHub();
  const templates = state?.templates ?? [];
  // `null` = nothing selected, "new" = unsaved draft.
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<TemplateInput>(empty);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set after saving a template that has projects created from it.
  const [applyPrompt, setApplyPrompt] = useState<{ id: string; count: number } | null>(null);

  // AI helpers: "Crear con IA" panel, "Mejorar con IA" note and the pending proposal.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [improveNote, setImproveNote] = useState("");
  const [proposal, setProposal] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState<"generate" | "improve" | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const selected = templates.find((t) => t.id === selectedId);
  const hiddenCount = state?.hiddenTemplateCount ?? 0;

  function select(template: Template) {
    setSelectedId(template.id);
    setApplyPrompt(null);
    setProposal(null);
    setDraft({
      name: template.name,
      icon: template.icon,
      description: template.description,
      instructions: template.instructions,
    });
  }

  function startNew() {
    setSelectedId("new");
    setApplyPrompt(null);
    setProposal(null);
    setDraft(empty);
  }

  async function runAi(kind: "generate" | "improve", action: () => Promise<void>) {
    setAiBusy(kind);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setAiBusy(null);
    }
  }

  const generate = () =>
    runAi("generate", async () => {
      const result = await api.generateTemplate(aiPrompt);
      startNew();
      setDraft(result);
      setAiOpen(false);
      setAiPrompt("");
      toast.success("Borrador creado: revísalo y pulsa “Crear plantilla”");
    });

  const improve = () =>
    runAi("improve", async () => {
      const { instructions } = await api.improveTemplate(draft.instructions, improveNote);
      setProposal(instructions);
    });

  const acceptProposal = () => {
    if (proposal === null) return;
    setDraft({ ...draft, instructions: proposal });
    setProposal(null);
    setImproveNote("");
    toast.success("Propuesta aplicada: pulsa Guardar para conservarla");
  };

  const exportOne = () =>
    run(async () => {
      if (!selected) return;
      const text = await api.exportTemplates(selected.id);
      downloadText(`${safeFileName(selected.name, "plantilla")}.md`, text, "text/markdown");
    });

  const exportAll = () =>
    run(async () => {
      downloadText("plantillas-studylab.json", await api.exportTemplates(), "application/json");
    });

  const importFile = (file: File) =>
    run(async () => {
      const text = await file.text();
      let body: Parameters<typeof api.importTemplates>[0];
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          body = JSON.parse(text) as { templates: TemplateInput[] };
        } catch {
          throw new Error("El archivo .json no es válido.");
        }
      } else {
        body = { markdown: text };
      }
      const { count, templates: created } = await api.importTemplates(body);
      await refresh();
      if (created.length === 1) select(created[0]!);
      toast.success(count === 1 ? "1 plantilla importada" : `${count} plantillas importadas`);
    });

  async function run(action: () => Promise<void>) {
    setSaving(true);
    try {
      await action();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const save = () =>
    run(async () => {
      const input = { ...draft, icon: draft.icon || "✨" };
      const saved = selectedId === "new" ? await api.createTemplate(input) : await api.updateTemplate(selectedId!, input);
      const projectCount = selectedId === "new" ? 0 : (selected?.projectCount ?? 0);
      await refresh();
      select(saved);
      if (projectCount > 0) setApplyPrompt({ id: saved.id, count: projectCount });
      toast.success("Plantilla guardada");
    });

  const restore = () =>
    run(async () => {
      if (!selected) return;
      const original = await api.restoreTemplate(selected.id);
      setConfirmRestore(false);
      await refresh();
      select(original);
      toast.success("Plantilla restaurada");
    });

  const restoreHidden = () =>
    run(async () => {
      const { count } = await api.restoreHiddenTemplates();
      await refresh();
      toast.success(count === 1 ? "1 plantilla recuperada" : `${count} plantillas recuperadas`);
    });

  const applyToProjects = () =>
    run(async () => {
      if (!applyPrompt) return;
      const { count } = await api.applyTemplateToProjects(applyPrompt.id);
      setApplyPrompt(null);
      await refresh();
      toast.success(
        count === 1 ? "Instrucciones aplicadas a 1 proyecto" : `Instrucciones aplicadas a ${count} proyectos`,
      );
    });

  const duplicate = () =>
    run(async () => {
      if (!selected) return;
      const copy = await api.createTemplate({ ...draft, name: `${selected.name} (copia)` });
      await refresh();
      select(copy);
      toast.success("Plantilla duplicada");
    });

  const remove = () =>
    run(async () => {
      if (!selected) return;
      await api.deleteTemplate(selected.id);
      setConfirmDelete(false);
      setSelectedId(null);
      await refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Plantillas</DialogTitle>
          <DialogDescription>
            Las plantillas definen las instrucciones iniciales de un proyecto nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[15rem_1fr]">
          <div className="grid content-start gap-1">
            <div className="mb-1 grid grid-cols-2 gap-1">
              <Button type="button" variant="outline" size="sm" onClick={startNew}>
                <Plus /> Nueva
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAiOpen((v) => !v)}>
                <Sparkles /> Crear con IA
              </Button>
            </div>
            <div className="grid max-h-[50vh] grid-cols-[minmax(0,1fr)] gap-1 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => select(t)}
                  className={cn(
                    "hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    selectedId === t.id && "bg-accent",
                  )}
                >
                  <span>{t.icon}</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  {t.builtIn && (
                    <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-px text-[0.65rem] whitespace-nowrap">
                      {t.customized ? "Editada" : "Integrada"}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => importRef.current?.click()}>
                <Upload /> Importar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving || templates.length === 0}
                onClick={() => void exportAll()}
              >
                <Download /> Exportar todas
              </Button>
              <input
                ref={importRef}
                type="file"
                accept=".md,.json,text/markdown,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void importFile(file);
                }}
              />
            </div>
            {hiddenCount > 0 && (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void restoreHidden()}>
                <RotateCcw /> Recuperar integradas ({hiddenCount})
              </Button>
            )}
          </div>

          <div className="grid content-start gap-3">
          {aiOpen && (
            <div className="grid gap-2 rounded-md border p-3">
              <Label htmlFor="tpl-ai-prompt">Describe la plantilla que quieres</Label>
              <Textarea
                id="tpl-ai-prompt"
                className="min-h-20 text-sm"
                placeholder="Ej.: tutor de química para bachillerato, muy paciente"
                value={aiPrompt}
                disabled={aiBusy !== null}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2">
                {aiBusy === "generate" && (
                  <span className="text-muted-foreground mr-auto text-xs">Esto puede tardar hasta 30 s…</span>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={aiBusy !== null} onClick={() => setAiOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={aiBusy !== null || !aiPrompt.trim()} onClick={() => void generate()}>
                  {aiBusy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />} Generar
                </Button>
              </div>
            </div>
          )}
          {selectedId === null ? (
            <p className="text-muted-foreground self-center text-center text-sm">
              Selecciona una plantilla o crea una nueva.
            </p>
          ) : (
            <form
              className="grid content-start gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {selected?.builtIn && (
                <p className="text-muted-foreground text-xs">
                  <span className="bg-muted rounded px-1.5 py-0.5 font-medium">
                    {selected.customized ? "Integrada · editada" : "Integrada"}
                  </span>{" "}
                  Puedes editarla; los cambios se conservan al actualizar la app.
                </p>
              )}
              <div className="flex gap-3">
                <div className="grid w-16 gap-2">
                  <Label htmlFor="tpl-icon">Icono</Label>
                  <EmojiField
                    id="tpl-icon"
                    value={draft.icon}
                    fallback="✨"
                    onChange={(icon) => setDraft({ ...draft, icon })}
                  />
                </div>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="tpl-name">Nombre</Label>
                  <Input
                    id="tpl-name"
                    required
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-description">Descripción</Label>
                <Input
                  id="tpl-description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-instructions">Instrucciones</Label>
                <Textarea
                  id="tpl-instructions"
                  className="max-h-[55vh] min-h-64 font-mono text-sm"
                  value={draft.instructions}
                  onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                />
                <p className="text-muted-foreground text-right text-xs">
                  {draft.instructions.length.toLocaleString("es")} caracteres
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label="Nota para la IA"
                    className="min-w-40 flex-1"
                    placeholder="Opcional: p. ej. “que sea más estricto”"
                    value={improveNote}
                    disabled={aiBusy !== null}
                    onChange={(e) => setImproveNote(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={aiBusy !== null || !draft.instructions.trim()}
                    onClick={() => void improve()}
                  >
                    {aiBusy === "improve" ? <Loader2 className="animate-spin" /> : <Sparkles />} Mejorar con IA
                  </Button>
                </div>
                {aiBusy === "improve" && (
                  <p className="text-muted-foreground text-xs">Mejorando… puede tardar hasta 30 s.</p>
                )}
              </div>
              {proposal !== null && (
                <div className="grid gap-2 rounded-md border border-violet-500/40 bg-violet-500/10 p-3 text-sm">
                  <p className="font-medium">
                    Propuesta de la IA{" "}
                    <span className="text-muted-foreground font-normal">
                      ({draft.instructions.length.toLocaleString("es")} → {proposal.length.toLocaleString("es")}{" "}
                      caracteres)
                    </span>
                  </p>
                  <pre className="bg-background max-h-[40vh] overflow-y-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap">
                    {proposal}
                  </pre>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setProposal(null)}>
                      Descartar
                    </Button>
                    <Button type="button" size="sm" onClick={acceptProposal}>
                      Aceptar
                    </Button>
                  </div>
                </div>
              )}
              {applyPrompt && applyPrompt.id === selectedId && (
                <div className="grid gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p>
                    {applyPrompt.count === 1
                      ? "1 proyecto usa esta plantilla."
                      : `${applyPrompt.count} proyectos usan esta plantilla.`}{" "}
                    Aplicar los cambios reemplazará las instrucciones actuales de esos proyectos (incluidas las
                    ediciones que hayas hecho en ellos). No se tocan nombre, icono ni conocimiento.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" disabled={saving} onClick={() => void applyToProjects()}>
                      Aplicar a {applyPrompt.count} proyecto{applyPrompt.count === 1 ? " que usa" : "s que usan"}{" "}
                      esta plantilla
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setApplyPrompt(null)}>
                      Ahora no
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {selected && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive mr-auto"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 /> Borrar
                  </Button>
                )}
                {selected?.builtIn && selected.customized && (
                  <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmRestore(true)}>
                    <RotateCcw /> Restaurar original
                  </Button>
                )}
                {selected && (
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void exportOne()}>
                    <Download /> Exportar
                  </Button>
                )}
                {selected && (
                  <Button type="button" variant="outline" disabled={saving} onClick={() => void duplicate()}>
                    <Copy /> Duplicar
                  </Button>
                )}
                <Button type="submit" disabled={saving || !draft.name.trim()}>
                  {selectedId === "new" ? "Crear plantilla" : "Guardar"}
                </Button>
              </div>
            </form>
          )}
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Borrar “{selected?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {selected?.builtIn
                  ? "Es una plantilla integrada: podrás recuperarla más tarde con “Recuperar integradas”. "
                  : ""}
                Los proyectos ya creados con esta plantilla no se verán afectados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove()}>Borrar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restaurar “{selected?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Se descartarán tus cambios y la plantilla volverá a su versión original.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void restore()}>Restaurar original</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
