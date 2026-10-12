import { Copy, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { api, type Template, type TemplateInput } from "@/lib/api";
import { useHub } from "@/lib/hub";
import { cn } from "@/lib/utils";

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

  const selected = templates.find((t) => t.id === selectedId);
  const hiddenCount = state?.hiddenTemplateCount ?? 0;

  function select(template: Template) {
    setSelectedId(template.id);
    setApplyPrompt(null);
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
    setDraft(empty);
  }

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
      const saved =
        selectedId === "new" ? await api.createTemplate(draft) : await api.updateTemplate(selectedId!, draft);
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
            <Button type="button" variant="outline" size="sm" className="mb-1" onClick={startNew}>
              <Plus /> Nueva plantilla
            </Button>
            <div className="grid max-h-[50vh] gap-1 overflow-y-auto">
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
                    <span className="text-muted-foreground text-[0.65rem] uppercase">
                      {t.customized ? "Modificada" : "Integrada"}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {hiddenCount > 0 && (
              <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => void restoreHidden()}>
                <RotateCcw /> Recuperar integradas ({hiddenCount})
              </Button>
            )}
          </div>

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
                    {selected.customized ? "Integrada · modificada" : "Integrada"}
                  </span>{" "}
                  Puedes editarla; los cambios se conservan al actualizar la app.
                </p>
              )}
              <div className="flex gap-3">
                <div className="grid w-16 gap-2">
                  <Label htmlFor="tpl-icon">Icono</Label>
                  <Input
                    id="tpl-icon"
                    value={draft.icon}
                    className="text-center"
                    onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
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
              </div>
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
                      Aplicar a {applyPrompt.count} proyecto{applyPrompt.count === 1 ? "" : "s"} que usan esta
                      plantilla
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
